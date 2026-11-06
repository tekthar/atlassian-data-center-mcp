import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import type { ApiRequestOptions } from '../jira-client/core/ApiRequestOptions.js';
import { OpenAPI } from '../jira-client/core/OpenAPI.js';
import { request as __request } from '../jira-client/core/request.js';
import { asArray, asRecord, stripNoise, type JiraToolContext } from './context.js';
import { shapeUser } from './users.js';

/*
 * Jira Service Management tools ported from sooperset/mcp-atlassian. The generated client does
 * not cover /rest/servicedeskapi, so calls go through the generated `request` core directly.
 */

const TOOLSET = 'jira_service_desk';

export const SERVICE_DESK_CATALOG: ToolCatalog = {
  toolsets: {
    [TOOLSET]: {
      description: 'Jira Service Management: service desks, queues, request types and customer requests',
      default: false,
      gateway: false,
    },
  },
  tools: {
    jira_getServiceDeskForProject: { toolset: TOOLSET, access: 'read' },
    jira_getServiceDeskQueues: { toolset: TOOLSET, access: 'read' },
    jira_getQueueIssues: { toolset: TOOLSET, access: 'read' },
    jira_getRequestTypes: { toolset: TOOLSET, access: 'read' },
    jira_getRequestTypeFields: { toolset: TOOLSET, access: 'read' },
    jira_createCustomerRequest: { toolset: TOOLSET, access: 'write' },
  },
};

const MAX_PAGE_SIZE = 50;
/** Bounds the service desk scan in case a server never reports its last page. */
const MAX_SERVICE_DESK_PAGES = 20;
/** Customer request creation is an experimental JSM API on Data Center (sooperset sends this too). */
const EXPERIMENTAL_API_HEADERS = { 'X-ExperimentalApi': 'opt-in' };
const SELECT_SCHEMA_MARKERS = ['select', 'radiobutton', 'checkbox'];

type JsonRecord = Record<string, unknown>;
type ServiceDeskRequest = Omit<ApiRequestOptions, 'mediaType'>;

const isNotFound = (error: unknown) => asRecord(error).status === 404;

/** Instances without Jira Service Management answer 404 on every servicedeskapi path. */
async function callServiceDeskApi(options: ServiceDeskRequest, subject: string): Promise<JsonRecord> {
  try {
    return asRecord(await __request<unknown>(OpenAPI, { ...options, mediaType: 'application/json' }));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    throw new Error(
      `${subject} was not found (404). Check the id and your access, and that Jira Service Management is installed on this instance.`,
    );
  }
}

const nonEmpty = (value: unknown) => (asArray(value).length > 0 ? value : undefined);

function shapePage(page: JsonRecord, key: string, shapeItem: (value: unknown) => unknown) {
  return {
    start: page.start,
    limit: page.limit,
    size: page.size,
    isLastPage: page.isLastPage,
    [key]: asArray(page.values).map((value) => shapeItem(value)),
  };
}

function shapeServiceDesk(value: unknown) {
  const desk = asRecord(value);
  return { id: desk.id, name: desk.name, projectId: desk.projectId, projectKey: desk.projectKey, projectName: desk.projectName };
}

function shapeQueue(value: unknown) {
  const queue = asRecord(value);
  return { id: queue.id, name: queue.name, jql: queue.jql, fields: queue.fields, issueCount: queue.issueCount };
}

function shapeQueueIssue(value: unknown) {
  const issue = asRecord(value);
  return { id: issue.id, key: issue.key, fields: stripNoise(issue.fields) };
}

function shapeRequestType(value: unknown) {
  const type = asRecord(value);
  return {
    id: type.id,
    name: type.name,
    description: type.description || undefined,
    helpText: type.helpText || undefined,
    issueTypeId: type.issueTypeId,
    groupIds: nonEmpty(type.groupIds),
  };
}

function shapeRequestTypeField(value: unknown) {
  const field = asRecord(value);
  return {
    fieldId: field.fieldId,
    name: field.name,
    description: field.description || undefined,
    required: field.required,
    visible: field.visible,
    jiraSchema: field.jiraSchema,
    validValues: nonEmpty(field.validValues),
    defaultValues: nonEmpty(field.defaultValues),
  };
}

function shapeCustomerRequest(value: unknown) {
  const request = asRecord(value);
  return {
    issueId: request.issueId,
    issueKey: request.issueKey,
    serviceDeskId: request.serviceDeskId,
    requestTypeId: request.requestTypeId,
    createdDate: asRecord(request.createdDate).iso8601,
    reporter: request.reporter ? shapeUser(request.reporter) : undefined,
    currentStatus: asRecord(request.currentStatus).status,
    portalUrl: asRecord(request._links).web,
  };
}

async function findServiceDeskForProject(projectKey: string) {
  const wanted = projectKey.toUpperCase();
  let start = 0;
  for (let pageNumber = 0; pageNumber < MAX_SERVICE_DESK_PAGES; pageNumber++) {
    const page = await callServiceDeskApi(
      { method: 'GET', url: '/servicedeskapi/servicedesk', query: { start, limit: MAX_PAGE_SIZE } },
      'The Jira Service Management REST API',
    );
    const desks = asArray(page.values);
    const match = desks.find((desk) => String(asRecord(desk).projectKey).toUpperCase() === wanted);
    if (match) return shapeServiceDesk(match);
    if (page.isLastPage !== false || desks.length === 0) break;
    start += desks.length;
  }
  return null;
}

interface PageArgs {
  serviceDeskId: string;
  start: number;
  limit: number;
}

async function getServiceDeskQueues({ serviceDeskId, start, limit }: PageArgs) {
  const page = await callServiceDeskApi({
    method: 'GET',
    url: '/servicedeskapi/servicedesk/{serviceDeskId}/queue',
    path: { serviceDeskId },
    query: { includeCount: true, start, limit },
  }, `Service desk ${serviceDeskId}`);
  return { serviceDeskId, ...shapePage(page, 'queues', shapeQueue) };
}

async function getQueueIssues({ serviceDeskId, queueId, start, limit }: PageArgs & { queueId: string }) {
  const path = { serviceDeskId, queueId };
  const subject = `Queue ${queueId} in service desk ${serviceDeskId}`;
  const [queue, page] = await Promise.all([
    // Queue metadata only adds context; the issue page decides success, as in sooperset.
    callServiceDeskApi({
      method: 'GET', url: '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}', path, query: { includeCount: true },
    }, subject).catch(() => undefined),
    callServiceDeskApi({
      method: 'GET', url: '/servicedeskapi/servicedesk/{serviceDeskId}/queue/{queueId}/issue', path, query: { start, limit },
    }, subject),
  ]);
  return { serviceDeskId, queueId, queue: queue && shapeQueue(queue), ...shapePage(page, 'issues', shapeQueueIssue) };
}

async function getRequestTypes({ serviceDeskId, start, limit }: PageArgs) {
  const page = await callServiceDeskApi({
    method: 'GET',
    url: '/servicedeskapi/servicedesk/{serviceDeskId}/requesttype',
    path: { serviceDeskId },
    query: { start, limit },
  }, `Service desk ${serviceDeskId}`);
  return { serviceDeskId, ...shapePage(page, 'requestTypes', shapeRequestType) };
}

function fetchRequestTypeFields(serviceDeskId: string, requestTypeId: string): Promise<JsonRecord> {
  return callServiceDeskApi({
    method: 'GET',
    url: '/servicedeskapi/servicedesk/{serviceDeskId}/requesttype/{requestTypeId}/field',
    path: { serviceDeskId, requestTypeId },
  }, `Request type ${requestTypeId} in service desk ${serviceDeskId}`);
}

async function getRequestTypeFields(serviceDeskId: string, requestTypeId: string) {
  const definition = await fetchRequestTypeFields(serviceDeskId, requestTypeId);
  return {
    serviceDeskId,
    requestTypeId,
    canRaiseOnBehalfOf: definition.canRaiseOnBehalfOf,
    canAddRequestParticipants: definition.canAddRequestParticipants,
    fields: asArray(definition.requestTypeFields).map(shapeRequestTypeField),
  };
}

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null
  || (typeof value === 'string' && value.trim() === '')
  || (typeof value === 'object' && Object.keys(value).length === 0);

const isScalar = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number';

function isSelectLike(schema: JsonRecord): boolean {
  const custom = String(schema.custom ?? '').toLowerCase();
  return schema.type === 'option' || schema.items === 'option' || SELECT_SCHEMA_MARKERS.some((marker) => custom.includes(marker));
}

/** Accept an option's label or id, as a person would type it, and send the {id} form Jira expects. */
function matchOption(field: JsonRecord, candidate: string | number): { id: string } {
  const wanted = String(candidate).trim().toLowerCase();
  const options = asArray(field.validValues).map(asRecord);
  const match = options.find((option) =>
    [option.value, option.label].some((text) => text !== undefined && String(text).trim().toLowerCase() === wanted));
  if (match) return { id: String(match.value) };
  const allowed = options.slice(0, 10).map((option) => `${option.label} (${option.value})`).join(', ');
  throw new Error(`"${candidate}" is not a valid option for field ${field.name} (${field.fieldId}). Allowed: ${allowed}.`);
}

function normalizeFieldValue(field: JsonRecord | undefined, value: unknown): unknown {
  const schema = asRecord(field?.jiraSchema);
  const listed = schema.type === 'array' && typeof value === 'string'
    ? value.split(',').map((part) => part.trim()).filter(Boolean)
    : value;
  if (!field || !isSelectLike(schema) || asArray(field.validValues).length === 0) return listed;
  if (Array.isArray(listed)) return listed.map((item) => (isScalar(item) ? matchOption(field, item) : item));
  return isScalar(listed) ? matchOption(field, listed) : listed;
}

function normalizeFieldValues(fields: JsonRecord[], values: Record<string, unknown>): JsonRecord {
  const byId = new Map(fields.map((field) => [String(field.fieldId), field]));
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => !isBlank(value))
      .map(([fieldId, value]) => [fieldId, normalizeFieldValue(byId.get(fieldId), value)]),
  );
}

interface CustomerRequestInput {
  serviceDeskId: string;
  requestTypeId: string;
  requestFieldValues: Record<string, unknown>;
  raiseOnBehalfOf?: string;
  requestParticipants?: string[];
}

/** Fail before creating anything, instead of sooperset's silent retry without raiseOnBehalfOf. */
function assertRequestIsAllowed(definition: JsonRecord, fields: JsonRecord[], input: CustomerRequestInput): void {
  if (input.raiseOnBehalfOf && definition.canRaiseOnBehalfOf === false) {
    throw new Error(`You cannot raise requests on behalf of other customers in service desk ${input.serviceDeskId}. Omit raiseOnBehalfOf.`);
  }
  if (input.requestParticipants?.length && definition.canAddRequestParticipants === false) {
    throw new Error(`You cannot add request participants in service desk ${input.serviceDeskId}. Omit requestParticipants.`);
  }
  const missing = fields
    .filter((field) => field.required === true && field.visible !== false && isBlank(input.requestFieldValues[String(field.fieldId)]))
    .map((field) => `${field.name} (${field.fieldId})`);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}. jira_getRequestTypeFields lists every field of this request type.`);
  }
}

async function createCustomerRequest(input: CustomerRequestInput) {
  const { serviceDeskId, requestTypeId, raiseOnBehalfOf, requestParticipants } = input;
  const definition = await fetchRequestTypeFields(serviceDeskId, requestTypeId);
  const fields = asArray(definition.requestTypeFields).map(asRecord);
  assertRequestIsAllowed(definition, fields, input);
  const body = {
    serviceDeskId,
    requestTypeId,
    requestFieldValues: normalizeFieldValues(fields, input.requestFieldValues),
    ...(raiseOnBehalfOf ? { raiseOnBehalfOf } : {}),
    ...(requestParticipants?.length ? { requestParticipants } : {}),
  };
  const created = await callServiceDeskApi(
    { method: 'POST', url: '/servicedeskapi/request', body, headers: EXPERIMENTAL_API_HEADERS },
    `Service desk ${serviceDeskId} or request type ${requestTypeId}`,
  );
  return shapeCustomerRequest(created);
}

const numericId = (description: string) => z.string().regex(/^\d+$/, 'Expected a numeric id').describe(description);
const serviceDeskIdSchema = numericId("Service desk id (e.g. '4'), not the project key. Find it with jira_getServiceDeskForProject");
const requestTypeIdSchema = numericId("Request type id (e.g. '23'). Find it with jira_getRequestTypes");
const pagingSchema = {
  start: z.number().int().min(0).optional().describe('0-based index of the first item to return (default 0)'),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional()
    .describe(`Maximum number of items to return (1-${MAX_PAGE_SIZE}, default ${MAX_PAGE_SIZE} or the configured page size if smaller)`),
};

export const serviceDeskToolSchemas = {
  getServiceDeskForProject: {
    projectKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Expected a Jira project key such as SUP')
      .describe("Key of the Jira Service Management project (e.g. 'SUP')"),
  },
  getServiceDeskQueues: { serviceDeskId: serviceDeskIdSchema, ...pagingSchema },
  getQueueIssues: {
    serviceDeskId: serviceDeskIdSchema,
    queueId: numericId("Queue id (e.g. '47'). Find it with jira_getServiceDeskQueues"),
    ...pagingSchema,
  },
  getRequestTypes: { serviceDeskId: serviceDeskIdSchema, ...pagingSchema },
  getRequestTypeFields: { serviceDeskId: serviceDeskIdSchema, requestTypeId: requestTypeIdSchema },
  createCustomerRequest: {
    serviceDeskId: serviceDeskIdSchema,
    requestTypeId: requestTypeIdSchema,
    requestFieldValues: z.record(z.string(), z.unknown()).describe(
      'Field values keyed by field id from jira_getRequestTypeFields, e.g. {"summary": "Cannot log in", "description": "Since 9am", "customfield_10010": "High"}. '
      + 'Select, radio and checkbox fields take an option label or id; multi-value fields take an array or a comma-separated string. '
      + 'Other values are sent as given, in Jira REST format.',
    ),
    raiseOnBehalfOf: z.string().min(1).optional()
      .describe('Username of the customer to raise the request for. Omit to raise it as the authenticated user'),
    requestParticipants: z.array(z.string().min(1)).optional()
      .describe('Usernames to add as request participants, e.g. ["jdoe", "asmith"]'),
  },
};

const respond = async <T>(operation: () => Promise<T>, errorPrefix: string) =>
  formatToolResponse(await handleApiOperation(operation, errorPrefix));

function pageArgs(context: JiraToolContext, args: { serviceDeskId: string; start?: number; limit?: number }): PageArgs {
  return {
    serviceDeskId: args.serviceDeskId,
    start: args.start ?? 0,
    limit: args.limit ?? Math.min(context.getPageSize(), MAX_PAGE_SIZE),
  };
}

function registerServiceDeskLookupTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getServiceDeskForProject',
    {
      description: `Find the Jira Service Management service desk for a project key in the ${context.instanceType}. Returns its numeric id, which the other service desk tools need, or serviceDesk: null when the project is not a service desk.`,
      inputSchema: z.object(serviceDeskToolSchemas.getServiceDeskForProject),
    },
    async ({ projectKey }) => respond(
      async () => ({ projectKey: projectKey.toUpperCase(), serviceDesk: await findServiceDeskForProject(projectKey) }),
      'Error finding service desk',
    ),
  );
}

function registerQueueTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getServiceDeskQueues',
    {
      description: `List the queues of a Jira Service Management service desk in the ${context.instanceType}, with each queue's JQL and issue count.`,
      inputSchema: z.object(serviceDeskToolSchemas.getServiceDeskQueues),
    },
    async (args) => respond(() => getServiceDeskQueues(pageArgs(context, args)), 'Error fetching service desk queues'),
  );

  tools.registerTool(
    'jira_getQueueIssues',
    {
      description: `List the issues in a Jira Service Management queue in the ${context.instanceType}, with the queue's columns as fields.`,
      inputSchema: z.object(serviceDeskToolSchemas.getQueueIssues),
    },
    async (args) => respond(
      () => getQueueIssues({ ...pageArgs(context, args), queueId: args.queueId }),
      'Error fetching queue issues',
    ),
  );
}

function registerRequestTypeTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getRequestTypes',
    {
      description: `List the request types customers can raise in a Jira Service Management service desk in the ${context.instanceType}.`,
      inputSchema: z.object(serviceDeskToolSchemas.getRequestTypes),
    },
    async (args) => respond(() => getRequestTypes(pageArgs(context, args)), 'Error fetching request types'),
  );

  tools.registerTool(
    'jira_getRequestTypeFields',
    {
      description: `Get the fields of a Jira Service Management request type in the ${context.instanceType}: ids, required flags, schemas and allowed values. Call it before jira_createCustomerRequest.`,
      inputSchema: z.object(serviceDeskToolSchemas.getRequestTypeFields),
    },
    async ({ serviceDeskId, requestTypeId }) => respond(
      () => getRequestTypeFields(serviceDeskId, requestTypeId),
      'Error fetching request type fields',
    ),
  );
}

function registerCreateCustomerRequestTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_createCustomerRequest',
    {
      description: `Raise a Jira Service Management customer request in the ${context.instanceType}. Checks required fields and maps select option labels to ids before creating. Returns the new issue key and portal URL.`,
      inputSchema: z.object(serviceDeskToolSchemas.createCustomerRequest),
    },
    async (args) => {
      if (Object.keys(args.requestFieldValues).length === 0) {
        return formatToolResponse({ success: false, error: 'requestFieldValues is empty. Provide at least the required fields, such as summary.' });
      }
      return respond(() => createCustomerRequest(args), 'Error creating customer request');
    },
  );
}

export function registerServiceDeskTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerServiceDeskLookupTool(tools, context);
  registerQueueTools(tools, context);
  registerRequestTypeTools(tools, context);
  registerCreateCustomerRequestTool(tools, context);
}
