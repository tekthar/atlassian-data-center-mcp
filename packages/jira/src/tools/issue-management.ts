import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { IssueService, SearchService, type IssuesUpdateBean, type UserBean } from '../jira-client/index.js';
import { asArray, asRecord, type JiraToolContext } from './context.js';
import { shapeUser } from './users.js';

/*
 * Port of sooperset/mcp-atlassian tools: get_project_issues, batch_create_issues, assign_issue,
 * delete_issue, get_issue_watchers, add_watcher, remove_watcher.
 */

export const ISSUE_MANAGEMENT_CATALOG: ToolCatalog = {
  toolsets: {
    jira_issue_management: { description: "List a project's issues, bulk-create, assign and delete issues", default: false },
    jira_watcher_management: { description: 'List the watchers of an issue and add or remove other users as watchers', default: false },
  },
  tools: {
    jira_getProjectIssues: { toolset: 'jira_issue_management', access: 'read' },
    jira_batchCreateIssues: { toolset: 'jira_issue_management', access: 'write', anyOfPermissions: ['CREATE_ISSUES'] },
    jira_assignIssue: { toolset: 'jira_issue_management', access: 'write', anyOfPermissions: ['ASSIGN_ISSUES'] },
    jira_deleteIssue: { toolset: 'jira_issue_management', access: 'destructive', anyOfPermissions: ['DELETE_ISSUES'] },
    jira_getIssueWatchers: { toolset: 'jira_watcher_management', access: 'read' },
    jira_addWatcher: { toolset: 'jira_watcher_management', access: 'write', anyOfPermissions: ['MANAGE_WATCHERS'] },
    jira_removeWatcher: { toolset: 'jira_watcher_management', access: 'write', anyOfPermissions: ['MANAGE_WATCHERS'] },
  },
};

const PROJECT_ISSUE_FIELDS = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated'];
const MAX_BATCH_SIZE = 50;

const issueKey = z.string().min(1).describe('Issue key, e.g. PROJ-123');

const newIssueSchema = z.object({
  projectKey: z.string().min(1).describe('Key of the project to create the issue in, e.g. PROJ'),
  summary: z.string().min(1).describe('Issue summary (title)'),
  issueType: z.string().min(1).describe("Issue type name, e.g. 'Task', 'Bug' or 'Sub-task', or its numeric id"),
  description: z.string().optional().describe('Description in Jira wiki markup'),
  assignee: z.string().min(1).optional().describe('Username of the assignee (see jira_searchAssignableUsers). Omit to leave it to the project default'),
  parentKey: z.string().min(1).optional().describe('Parent issue key. Required when issueType is a sub-task type'),
  components: z.array(z.string().min(1)).optional().describe('Component names'),
  customFields: z.record(z.string(), z.unknown()).optional().describe(
    "Other fields merged into this issue's create payload, e.g. {'priority': {'name': 'High'}, 'labels': ['ui'], 'customfield_10001': 'value'}",
  ),
});

type NewIssue = z.infer<typeof newIssueSchema>;

export const issueManagementSchemas = {
  getProjectIssues: {
    projectKey: z.string().regex(/^[A-Za-z0-9_]+$/, 'A project key contains only letters, digits and underscores').describe('Project key, e.g. PROJ'),
    maxResults: z.number().int().min(1).max(100).optional().describe('Maximum number of issues to return (default: the server page size)'),
    startAt: z.number().int().min(0).optional().describe('0-based index of the first issue to return, for paging (default 0)'),
  },
  batchCreateIssues: {
    issues: z.array(newIssueSchema).min(1).max(MAX_BATCH_SIZE).describe(`Issues to create, 1 to ${MAX_BATCH_SIZE}`),
  },
  assignIssue: {
    issueKey,
    assignee: z.string().min(1).nullable().describe(
      "Username to assign the issue to (see jira_searchAssignableUsers), '-1' for the project's automatic assignee, or null to unassign",
    ),
  },
  deleteIssue: {
    issueKey,
    deleteSubtasks: z.boolean().describe(
      'Whether to also delete the sub-tasks of the issue. With false, Jira refuses to delete an issue that has sub-tasks and nothing is deleted',
    ),
  },
  getIssueWatchers: { issueKey },
  addWatcher: {
    issueKey,
    username: z.string().min(1).describe('Username of the user to add as a watcher (see jira_searchAssignableUsers)'),
  },
  removeWatcher: {
    issueKey,
    username: z.string().min(1).describe('Username of the watcher to remove (see jira_getIssueWatchers)'),
  },
};

/** Username and display name only, for issue rows; null when the field is empty (e.g. unassigned). */
function shapeUserRef(value: unknown) {
  if (!value) return null;
  const user = asRecord(value);
  return { name: user.name, displayName: user.displayName };
}

function shapeIssueRow(value: unknown) {
  const issue = asRecord(value);
  const fields = asRecord(issue.fields);
  return {
    key: issue.key,
    summary: fields.summary,
    status: asRecord(fields.status).name,
    issueType: asRecord(fields.issuetype).name,
    priority: asRecord(fields.priority).name,
    assignee: shapeUserRef(fields.assignee),
    reporter: shapeUserRef(fields.reporter),
    created: fields.created,
    updated: fields.updated,
  };
}

async function getProjectIssues(projectKey: string, startAt: number, maxResults: number) {
  // The schema limits the key to [A-Za-z0-9_], so it cannot break out of the quotes.
  const jql = `project = "${projectKey}" ORDER BY created DESC, key DESC`;
  const result = asRecord(await SearchService.searchUsingSearchRequest({ jql, startAt, maxResults, fields: PROJECT_ISSUE_FIELDS }));
  return {
    jql,
    total: result.total,
    startAt: result.startAt,
    maxResults: result.maxResults,
    issues: asArray(result.issues).map(shapeIssueRow),
  };
}

const issueTypeRef = (issueType: string) => (/^\d+$/.test(issueType) ? { id: issueType } : { name: issueType });

function toIssueFields(issue: NewIssue): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    project: { key: issue.projectKey },
    summary: issue.summary,
    issuetype: issueTypeRef(issue.issueType),
  };
  if (issue.description !== undefined) fields.description = issue.description;
  if (issue.assignee) fields.assignee = { name: issue.assignee };
  if (issue.parentKey) fields.parent = { key: issue.parentKey };
  if (issue.components) fields.components = issue.components.map((name) => ({ name }));
  return { ...fields, ...issue.customFields };
}

async function postBulkCreate(issues: NewIssue[]): Promise<unknown> {
  const body = { issueUpdates: issues.map((issue) => ({ fields: toIssueFields(issue) })) } as IssuesUpdateBean;
  try {
    return await IssueService.createIssues(body);
  } catch (error) {
    // When every issue fails, Jira answers 400 with the same { issues, errors } body as a partial success.
    const { status, body: errorBody } = asRecord(error);
    if (status === 400 && Array.isArray(asRecord(errorBody).errors)) return errorBody;
    throw error;
  }
}

function shapeBulkFailure(value: unknown, issues: NewIssue[]) {
  const failure = asRecord(value);
  const elementErrors = asRecord(failure.elementErrors);
  const index = typeof failure.failedElementNumber === 'number' ? failure.failedElementNumber : undefined;
  return {
    index,
    summary: index === undefined ? undefined : issues[index]?.summary,
    status: failure.status,
    errorMessages: elementErrors.errorMessages,
    errors: elementErrors.errors,
  };
}

/** Jira lists created issues in request order and failures by input index, so the two can be paired back up. */
function shapeBulkResult(response: unknown, issues: NewIssue[]) {
  const body = asRecord(response);
  const failed = asArray(body.errors).map((value) => shapeBulkFailure(value, issues));
  const failedIndexes = new Set(failed.map((failure) => failure.index));
  const createdIndexes = issues.map((_, index) => index).filter((index) => !failedIndexes.has(index));
  const createdRows = asArray(body.issues);
  const paired = createdRows.length === createdIndexes.length;
  const created = createdRows.map((value, position) => {
    const row = asRecord(value);
    const index = paired ? createdIndexes[position] : undefined;
    return { index, key: row.key, id: row.id, summary: index === undefined ? undefined : issues[index].summary };
  });
  return { created, failed };
}

async function assignIssue(key: string, assignee: string | null) {
  // UserBean types name as an optional string, but Jira only unassigns when name is an explicit null.
  await IssueService.assign(key, { name: assignee } as unknown as UserBean);
  const issue = asRecord(await IssueService.getIssue1(key, undefined, 'assignee'));
  const current = asRecord(issue.fields).assignee;
  return { issueKey: key, assignee: current ? shapeUser(current) : null };
}

async function getIssueWatchers(key: string) {
  const result = asRecord(await IssueService.getIssueWatchers(key));
  return {
    issueKey: key,
    watchCount: result.watchCount,
    isWatching: result.isWatching,
    watchers: asArray(result.watchers).map(shapeUser),
  };
}

function registerGetProjectIssues(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getProjectIssues',
    {
      description: `List the issues of a project in the ${context.instanceType}, newest first, with paging. Returns key, summary, status, type, priority, assignee, reporter and dates per issue, plus the total. For other filters or fields use jira_searchIssues.`,
      inputSchema: z.object(issueManagementSchemas.getProjectIssues),
    },
    async ({ projectKey, startAt, maxResults }) => formatToolResponse(
      await handleApiOperation(
        () => getProjectIssues(projectKey, startAt ?? 0, maxResults ?? context.getPageSize()),
        'Error getting project issues',
      ),
    ),
  );
}

function registerBatchCreateIssues(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_batchCreateIssues',
    {
      description: `Create up to ${MAX_BATCH_SIZE} issues in one request in the ${context.instanceType}. Each issue is created or rejected on its own: the result lists created issues (0-based input index, key, id) and failed ones (input index, Jira's field errors). Some issues can be created while others fail; never resubmit the created ones. Descriptions use Jira wiki markup.`,
      inputSchema: z.object(issueManagementSchemas.batchCreateIssues),
    },
    async ({ issues }) => {
      const result = await handleApiOperation(async () => shapeBulkResult(await postBulkCreate(issues), issues), 'Error creating issues');
      if (result.success && result.data?.created.length === 0) {
        return formatToolResponse({ success: false, error: `None of the ${issues.length} issues were created.`, details: result.data });
      }
      return formatToolResponse(result);
    },
  );
}

function registerAssignIssue(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_assignIssue',
    {
      description: `Assign an issue to a user, or unassign it, in the ${context.instanceType}. Uses the dedicated assignee endpoint, which only needs the Assign Issues permission. Takes a username: resolve names or emails with jira_searchAssignableUsers first. Returns the resulting assignee.`,
      inputSchema: z.object(issueManagementSchemas.assignIssue),
    },
    async ({ issueKey: key, assignee }) => formatToolResponse(
      await handleApiOperation(() => assignIssue(key, assignee), 'Error assigning issue'),
    ),
  );
}

function registerDeleteIssue(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_deleteIssue',
    {
      description: `Permanently delete an issue from the ${context.instanceType}. This cannot be undone. deleteSubtasks must be given explicitly: with true, the issue's sub-tasks are deleted too; with false, Jira refuses to delete an issue that has sub-tasks. Check the sub-tasks with jira_getIssue first.`,
      inputSchema: z.object(issueManagementSchemas.deleteIssue),
    },
    async ({ issueKey: key, deleteSubtasks }) => formatToolResponse(
      await handleApiOperation(async () => {
        await IssueService.deleteIssue(key, String(deleteSubtasks));
        return { issueKey: key, deleted: true, deleteSubtasks };
      }, 'Error deleting issue'),
    ),
  );
}

function registerGetIssueWatchers(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getIssueWatchers',
    {
      description: `List the watchers of an issue in the ${context.instanceType}: the watch count, whether you are watching, and each watcher's username and display name. Without the View Voters and Watchers permission Jira may return the count but not the list.`,
      inputSchema: z.object(issueManagementSchemas.getIssueWatchers),
    },
    async ({ issueKey: key }) => formatToolResponse(
      await handleApiOperation(() => getIssueWatchers(key), 'Error getting issue watchers'),
    ),
  );
}

function registerAddWatcher(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_addWatcher',
    {
      description: `Add a user, by username, as a watcher of an issue in the ${context.instanceType}. Adding someone other than yourself needs the Manage Watchers permission. To watch an issue yourself, use jira_watchIssue.`,
      inputSchema: z.object(issueManagementSchemas.addWatcher),
    },
    async ({ issueKey: key, username }) => formatToolResponse(
      await handleApiOperation(async () => {
        // Older Jira DC reads the user from a JSON string body, newer versions from the userName query parameter.
        await IssueService.addWatcher1(key, username, username);
        return { issueKey: key, addedWatcher: username };
      }, 'Error adding watcher'),
    ),
  );
}

function registerRemoveWatcher(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_removeWatcher',
    {
      description: `Remove a user, by username, from the watchers of an issue in the ${context.instanceType}. Removing someone other than yourself needs the Manage Watchers permission. To stop watching an issue yourself, use jira_unwatchIssue.`,
      inputSchema: z.object(issueManagementSchemas.removeWatcher),
    },
    async ({ issueKey: key, username }) => formatToolResponse(
      await handleApiOperation(async () => {
        // `username` is the older spelling of the query parameter; send both so every DC version finds it.
        await IssueService.removeWatcher1(key, username, username);
        return { issueKey: key, removedWatcher: username };
      }, 'Error removing watcher'),
    ),
  );
}

export function registerIssueManagementTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerGetProjectIssues(tools, context);
  registerBatchCreateIssues(tools, context);
  registerAssignIssue(tools, context);
  registerDeleteIssue(tools, context);
  registerGetIssueWatchers(tools, context);
  registerAddWatcher(tools, context);
  registerRemoveWatcher(tools, context);
}
