import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { FieldService, IssueService, ProjectService, ProjectsService } from '../jira-client/index.js';
import { createVersion } from '../jira-versions.js';
import { asArray, asRecord, type JiraToolContext } from './context.js';
import { shapeUser } from './users.js';

/**
 * Port of sooperset/mcp-atlassian tools: search_fields, get_field_options, get_create_fields,
 * get_project_issue_types, get_project_fields, get_all_projects, search_projects,
 * get_project_components, batch_create_versions. Field metadata comes from the paged createmeta
 * endpoints of Jira Data Center 8.4+.
 */
export const FIELDS_PROJECTS_CATALOG: ToolCatalog = {
  toolsets: {
    jira_fields: { description: 'Find fields, the create schema of issue types, and allowed field values', default: false },
    jira_projects: { description: 'List and search projects, list components, create versions in bulk', default: false },
  },
  tools: {
    jira_searchFields: { toolset: 'jira_fields', access: 'read' },
    jira_getFieldOptions: { toolset: 'jira_fields', access: 'read' },
    jira_getCreateFields: { toolset: 'jira_fields', access: 'read' },
    jira_getProjectIssueTypes: { toolset: 'jira_fields', access: 'read' },
    jira_getProjectFields: { toolset: 'jira_fields', access: 'read' },
    jira_getAllProjects: { toolset: 'jira_projects', access: 'read' },
    jira_searchProjects: { toolset: 'jira_projects', access: 'read' },
    jira_getProjectComponents: { toolset: 'jira_projects', access: 'read' },
    jira_batchCreateVersions: { toolset: 'jira_projects', access: 'write' },
  },
};

const CREATEMETA_PAGE_SIZE = 50;
/** Stops paging if a server ignores startAt and keeps returning the same page. */
const CREATEMETA_MAX_PAGES = 40;
const CUSTOM_FIELD_PREFIX = 'customfield_';

type JsonRecord = Record<string, unknown>;

const textOrUndefined = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);

function isLastPage(response: JsonRecord, pageLength: number, collected: number): boolean {
  if (pageLength === 0 || response.isLast === true) return true;
  if (typeof response.total === 'number') return collected >= response.total;
  return response.isLast !== false;
}

async function collectPages(fetchPage: (startAt: number) => Promise<unknown>): Promise<JsonRecord[]> {
  const items: JsonRecord[] = [];
  for (let page = 0; page < CREATEMETA_MAX_PAGES; page += 1) {
    const response = asRecord(await fetchPage(items.length));
    const values = asArray(response.values).map(asRecord);
    items.push(...values);
    if (isLastPage(response, values.length, items.length)) break;
  }
  return items;
}

const fetchIssueTypes = (projectKey: string) => collectPages((startAt) =>
  IssueService.getCreateIssueMetaProjectIssueTypes(projectKey, String(CREATEMETA_PAGE_SIZE), String(startAt)));

const fetchCreateFields = (projectKey: string, issueTypeId: string) => collectPages((startAt) =>
  IssueService.getCreateIssueMetaFields(issueTypeId, projectKey, String(CREATEMETA_PAGE_SIZE), String(startAt)));

/** Schema type ('string', 'array', 'option', ...), the item type of arrays, and a custom field's plugin type. */
function shapeSchema(value: unknown) {
  const schema = asRecord(value);
  return { schemaType: schema.type, items: schema.items, customType: schema.custom };
}

export function shapeField(value: unknown) {
  const field = asRecord(value);
  return {
    id: field.id,
    name: field.name,
    custom: field.custom === true,
    ...shapeSchema(field.schema),
    clauseNames: field.clauseNames,
  };
}

function matchScore(field: JsonRecord, keyword: string, tokens: string[]): number {
  const candidates = [field.id, field.key, field.name, ...asArray(field.clauseNames)]
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map((candidate) => candidate.toLowerCase());
  return Math.max(0, ...candidates.map((candidate) => {
    if (candidate === keyword) return 4;
    if (candidate.startsWith(keyword)) return 3;
    if (candidate.includes(keyword)) return 2;
    return tokens.every((token) => candidate.includes(token)) ? 1 : 0;
  }));
}

/** Ranks exact matches first, then prefix, substring, and finally every-word matches; ties keep Jira's order. */
export function searchFieldList(fields: unknown[], keyword: string | undefined, limit: number) {
  const records = fields.map(asRecord);
  const wanted = (keyword ?? '').trim().toLowerCase();
  if (!wanted) return { total: records.length, fields: records.slice(0, limit).map(shapeField) };
  const tokens = wanted.split(/[\s_.:-]+/).filter(Boolean);
  const ranked = records
    .map((field) => ({ field, score: matchScore(field, wanted, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
  return { total: ranked.length, fields: ranked.slice(0, limit).map(({ field }) => shapeField(field)) };
}

export interface FieldOption {
  id?: string;
  value: string;
  disabled?: true;
  childOptions?: FieldOption[];
}

/** Custom field options carry `value`; system values such as priorities, components and versions carry `name`. */
export function shapeOption(value: unknown): FieldOption {
  const option = asRecord(value);
  const id = option.id ?? option.optionId;
  const children = asArray(option.cascadingOptions).map(shapeOption);
  return {
    id: id === undefined ? undefined : String(id),
    value: String(option.value ?? option.name ?? ''),
    ...(option.disabled === true ? { disabled: true as const } : {}),
    ...(children.length > 0 ? { childOptions: children } : {}),
  };
}

const optionMatches = (option: FieldOption, needle: string) =>
  [option, ...(option.childOptions ?? [])].some((entry) => entry.value.toLowerCase().includes(needle));

const toValueOnly = (option: FieldOption) =>
  option.childOptions ? { value: option.value, children: option.childOptions.map((child) => child.value) } : option.value;

function allowedValuesEntry(allowedValues: unknown[], include: boolean) {
  if (allowedValues.length === 0) return {};
  return include ? { allowedValues: allowedValues.map(shapeOption) } : { hasAllowedValues: true };
}

export function shapeCreateField(value: unknown, includeAllowedValues = false) {
  const field = asRecord(value);
  const fieldId = String(field.fieldId ?? field.key ?? '');
  return {
    fieldId,
    name: field.name,
    required: field.required === true,
    custom: fieldId.startsWith(CUSTOM_FIELD_PREFIX),
    ...shapeSchema(field.schema),
    ...allowedValuesEntry(asArray(field.allowedValues), includeAllowedValues),
  };
}

export function shapeIssueType(value: unknown) {
  const issueType = asRecord(value);
  return {
    id: issueType.id,
    name: issueType.name,
    description: textOrUndefined(issueType.description),
    subtask: issueType.subtask === true,
    untranslatedName: issueType.untranslatedName !== issueType.name ? textOrUndefined(issueType.untranslatedName) : undefined,
  };
}

const nameMatches = (value: unknown, wanted: string) => typeof value === 'string' && value.toLowerCase() === wanted;

async function resolveIssueTypeId(projectKey: string, issueType: string): Promise<string> {
  const types = await fetchIssueTypes(projectKey);
  const wanted = issueType.trim().toLowerCase();
  const match = types.find((type) => String(type.id) === wanted)
    ?? types.find((type) => nameMatches(type.name, wanted) || nameMatches(type.untranslatedName, wanted));
  if (!match) {
    const available = types.map((type) => type.name).join(', ') || 'none';
    throw new Error(`Issue type "${issueType}" cannot be used to create issues in ${projectKey}. Available issue types: ${available}.`);
  }
  return String(match.id);
}

const findCreateField = (fields: JsonRecord[], wanted: string) =>
  fields.find((field) => String(field.fieldId).toLowerCase() === wanted)
  ?? fields.find((field) => nameMatches(field.name, wanted));

interface FieldOptionsParams {
  fieldId: string;
  projectKey: string;
  issueType: string;
  contains?: string;
  returnLimit?: number;
  valuesOnly?: boolean;
}

async function getFieldOptions(params: FieldOptionsParams) {
  const issueTypeId = await resolveIssueTypeId(params.projectKey, params.issueType);
  const fields = await fetchCreateFields(params.projectKey, issueTypeId);
  const field = findCreateField(fields, params.fieldId.trim().toLowerCase());
  if (!field) {
    throw new Error(`Field "${params.fieldId}" is not on the create screen of ${params.issueType} in ${params.projectKey}, so Jira does not list its options there. Check the field with jira_getCreateFields.`);
  }
  const needle = params.contains?.toLowerCase();
  const matching = asArray(field.allowedValues).map(shapeOption).filter((option) => !needle || optionMatches(option, needle));
  const options = matching.slice(0, params.returnLimit ?? matching.length);
  return {
    fieldId: field.fieldId,
    name: field.name,
    total: matching.length,
    options: params.valuesOnly ? options.map(toValueOnly) : options,
  };
}

interface ProjectField {
  fieldId: string;
  name: unknown;
  custom: boolean;
  schemaType: unknown;
  items: unknown;
  customType: unknown;
  issueTypes: string[];
  requiredFor: string[];
}

function addProjectField(merged: Map<string, ProjectField>, entry: JsonRecord, issueTypeName: string): void {
  const fieldId = String(entry.fieldId ?? entry.key ?? '');
  if (!fieldId) return;
  let field = merged.get(fieldId);
  if (!field) {
    field = {
      fieldId,
      name: entry.name,
      custom: fieldId.startsWith(CUSTOM_FIELD_PREFIX),
      ...shapeSchema(entry.schema),
      issueTypes: [],
      requiredFor: [],
    };
    merged.set(fieldId, field);
  }
  field.issueTypes.push(issueTypeName);
  if (entry.required === true) field.requiredFor.push(issueTypeName);
}

/** One createmeta call (or more, when paged) per issue type, run in sequence to spare the server. */
async function getProjectFields(projectKey: string): Promise<ProjectField[]> {
  const merged = new Map<string, ProjectField>();
  for (const issueType of await fetchIssueTypes(projectKey)) {
    if (issueType.id === undefined) continue;
    const issueTypeName = String(issueType.name ?? issueType.id);
    for (const entry of await fetchCreateFields(projectKey, String(issueType.id))) {
      addProjectField(merged, entry, issueTypeName);
    }
  }
  return [...merged.values()];
}

export function shapeProject(value: unknown, includeDetails = false) {
  const project = asRecord(value);
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    projectTypeKey: project.projectTypeKey,
    category: asRecord(project.projectCategory).name,
    ...(project.archived === true ? { archived: true } : {}),
    ...(includeDetails
      ? { description: textOrUndefined(project.description), lead: project.lead ? shapeUser(project.lead) : undefined }
      : {}),
  };
}

export function shapeComponent(value: unknown) {
  const component = asRecord(value);
  return {
    id: component.id,
    name: component.name,
    description: textOrUndefined(component.description),
    lead: component.lead ? shapeUser(component.lead) : undefined,
    assigneeType: component.assigneeType,
    ...(component.archived === true ? { archived: true } : {}),
  };
}

const shapeProjectMatch = (value: unknown) => {
  const project = asRecord(value);
  return { id: project.id, key: project.key, name: project.name };
};

// Factories rather than shared constants: the JSON Schema conversion turns a reused Zod instance
// into a $ref to its first occurrence, which some MCP clients do not resolve.
const projectKeySchema = () => z.string().trim().min(1).describe('Project key, e.g. PROJ');
const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');

const versionInput = () => z.object({
  name: z.string().trim().min(1).describe('Version name, unique within the project'),
  description: z.string().optional().describe('Version description'),
  startDate: isoDate().optional().describe('Start date in YYYY-MM-DD format'),
  releaseDate: isoDate().optional().describe('Release date in YYYY-MM-DD format'),
  released: z.boolean().optional().describe('Whether the version is released'),
  archived: z.boolean().optional().describe('Whether the version is archived'),
});

type VersionInput = z.infer<ReturnType<typeof versionInput>>;

export const fieldsProjectsToolSchemas = {
  searchFields: {
    keyword: z.string().optional().describe("Text to find in field ids, names and JQL clause names (case-insensitive; with several words, each must appear). Omit to list fields in Jira's order"),
    limit: z.number().int().min(1).max(1000).optional().describe('Maximum number of fields to return (default 10)'),
  },
  getFieldOptions: {
    fieldId: z.string().trim().min(1).describe("Field id, e.g. 'customfield_10001' or 'priority' (find it with jira_searchFields). The field's exact name also works"),
    projectKey: projectKeySchema(),
    issueType: z.string().trim().min(1).describe("Issue type name (e.g. 'Bug') or id, whose create screen the options are read from"),
    contains: z.string().optional().describe('Only return options whose value, or a child value of a cascading select, contains this text (case-insensitive)'),
    returnLimit: z.number().int().positive().optional().describe('Maximum number of options to return, applied after the contains filter'),
    valuesOnly: z.boolean().optional().describe('Return only option values (with child values for cascading selects) instead of id/value objects'),
  },
  getCreateFields: {
    projectKey: projectKeySchema(),
    issueTypeId: z.number().int().positive().describe('Issue type id from jira_getProjectIssueTypes, e.g. 10002'),
    includeAllowedValues: z.boolean().optional().describe('Include the allowed values of fields that have them. By default such fields are only flagged with hasAllowedValues'),
  },
  getProjectIssueTypes: { projectKey: projectKeySchema() },
  getProjectFields: { projectKey: projectKeySchema() },
  getAllProjects: {
    includeArchived: z.boolean().optional().describe('Include archived projects (default false)'),
    includeDetails: z.boolean().optional().describe("Also return each project's description and lead (default false)"),
  },
  searchProjects: {
    query: z.string().trim().min(1).describe('Text to match against project names and keys'),
    maxResults: z.number().int().min(1).max(100).optional().describe('Maximum number of projects to return (default 20, at most 100)'),
  },
  getProjectComponents: { projectKey: projectKeySchema() },
  batchCreateVersions: {
    projectKey: projectKeySchema(),
    versions: z.array(versionInput()).min(1).max(50).describe('Versions to create, in the order they should appear in the project'),
  },
};

interface VersionOutcome {
  index: number;
  name: string;
  success: boolean;
  version?: unknown;
  error?: string;
  details?: unknown;
}

/** Sequential, so the versions keep the given order in the project. */
async function createVersionsInOrder(projectKey: string, versions: VersionInput[]): Promise<VersionOutcome[]> {
  const results: VersionOutcome[] = [];
  for (const [index, version] of versions.entries()) {
    const outcome = await createVersion({ projectKey, ...version });
    results.push(outcome.success
      ? { index, name: version.name, success: true, version: outcome.data }
      : { index, name: version.name, success: false, error: outcome.error, details: outcome.details });
  }
  return results;
}

function summarizeBatch(projectKey: string, results: VersionOutcome[]) {
  const created = results.filter((result) => result.success).length;
  const summary = { projectKey, created, failed: results.length - created, results };
  if (created > 0) return { success: true, data: summary };
  return { success: false, error: `None of the ${results.length} versions were created in ${projectKey}.`, details: summary };
}

function registerSearchFields(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_searchFields',
    {
      description: `Search the system and custom fields of the ${context.instanceType} by keyword, matching field ids, names and JQL clause names case-insensitively. Returns each field's id, name, whether it is custom, and its schema type. Use it to find a custom field id (e.g. for "Story Points") before reading, setting or querying it.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.searchFields),
    },
    async ({ keyword, limit }) => formatToolResponse(await handleApiOperation(
      async () => searchFieldList(asArray(await FieldService.getFields()), keyword, limit ?? 10),
      'Error searching fields',
    )),
  );
}

function registerGetFieldOptions(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getFieldOptions',
    {
      description: `List the allowed values of a select, multi-select, radio, checkbox or cascading-select field, as offered when creating an issue of the given type in a project of the ${context.instanceType}. Also works for system fields with fixed values (priority, components, versions). The field must be on that issue type's create screen.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.getFieldOptions),
    },
    async (params) => formatToolResponse(await handleApiOperation(() => getFieldOptions(params), 'Error fetching field options')),
  );
}

function registerGetCreateFields(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getCreateFields',
    {
      description: `List the fields that can be set when creating an issue of the given type in a project of the ${context.instanceType}, with whether each is required and its schema type. Get the issue type id from jira_getProjectIssueTypes; for a field's allowed values use jira_getFieldOptions or includeAllowedValues.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.getCreateFields),
    },
    async ({ projectKey, issueTypeId, includeAllowedValues }) => formatToolResponse(await handleApiOperation(async () => {
      const fields = await fetchCreateFields(projectKey, String(issueTypeId));
      return fields.map((field) => shapeCreateField(field, includeAllowedValues ?? false));
    }, 'Error fetching create fields')),
  );
}

function registerGetProjectIssueTypes(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getProjectIssueTypes',
    {
      description: `List the issue types that can be created in a project of the ${context.instanceType} (id, name, description, whether it is a sub-task type). Pass an id to jira_getCreateFields to see the fields of that type.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.getProjectIssueTypes),
    },
    async ({ projectKey }) => formatToolResponse(await handleApiOperation(
      async () => (await fetchIssueTypes(projectKey)).map(shapeIssueType),
      'Error fetching project issue types',
    )),
  );
}

function registerGetProjectFields(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getProjectFields',
    {
      description: `List every field that issues of a project in the ${context.instanceType} can have on creation, merged across the project's issue types, with the issue types each field appears on and those that require it. Makes one request per issue type.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.getProjectFields),
    },
    async ({ projectKey }) => formatToolResponse(await handleApiOperation(
      () => getProjectFields(projectKey),
      'Error fetching project fields',
    )),
  );
}

function registerGetAllProjects(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getAllProjects',
    {
      description: `List all projects visible to the current user in the ${context.instanceType} (id, key, name, type, category). Prefer jira_searchProjects when you know part of the name or key.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.getAllProjects),
    },
    async ({ includeArchived, includeDetails }) => formatToolResponse(await handleApiOperation(async () => {
      const projects = await ProjectService.getAllProjects(includeArchived ?? false, includeDetails ? 'description,lead' : undefined);
      return asArray(projects).map((project) => shapeProject(project, includeDetails ?? false));
    }, 'Error fetching projects')),
  );
}

function registerSearchProjects(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_searchProjects',
    {
      description: `Find projects in the ${context.instanceType} whose name or key matches the query, ranked by Jira's project picker. Returns the total number of matches and the matching projects (id, key, name).`,
      inputSchema: z.object(fieldsProjectsToolSchemas.searchProjects),
    },
    async ({ query, maxResults }) => formatToolResponse(await handleApiOperation(async () => {
      const result = asRecord(await ProjectsService.searchForProjects(maxResults ?? 20, query));
      return { total: result.total, projects: asArray(result.projects).map(shapeProjectMatch) };
    }, 'Error searching projects')),
  );
}

function registerGetProjectComponents(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getProjectComponents',
    {
      description: `List the components of a project in the ${context.instanceType} (id, name, description, lead, default assignee type).`,
      inputSchema: z.object(fieldsProjectsToolSchemas.getProjectComponents),
    },
    async ({ projectKey }) => formatToolResponse(await handleApiOperation(
      async () => asArray(await ProjectService.getProjectComponents(projectKey)).map(shapeComponent),
      'Error fetching project components',
    )),
  );
}

function registerBatchCreateVersions(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_batchCreateVersions',
    {
      description: `Create several versions (releases) in one project of the ${context.instanceType}, in the given order. Each version is created separately, so one failure does not stop the others; the result reports the outcome of each. Check existing names with jira_getProjectVersions first.`,
      inputSchema: z.object(fieldsProjectsToolSchemas.batchCreateVersions),
    },
    async ({ projectKey, versions }) => formatToolResponse(summarizeBatch(projectKey, await createVersionsInOrder(projectKey, versions))),
  );
}

const REGISTRATIONS = [
  registerSearchFields,
  registerGetFieldOptions,
  registerGetCreateFields,
  registerGetProjectIssueTypes,
  registerGetProjectFields,
  registerGetAllProjects,
  registerSearchProjects,
  registerGetProjectComponents,
  registerBatchCreateVersions,
];

export function registerFieldsProjectsTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  for (const register of REGISTRATIONS) {
    register(tools, context);
  }
}
