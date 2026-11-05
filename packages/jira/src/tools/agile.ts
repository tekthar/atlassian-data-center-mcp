import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { BacklogService, BoardService, SprintService, type SprintBean, type StringList } from '../jira-client/index.js';
import { asArray, asRecord, type JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_agile_boards, get_board_issues, get_sprints_from_board,
 * get_sprint_issues, create_sprint, update_sprint, add_issues_to_sprint, move_issues_to_backlog.
 * All of them call the Jira Software REST API (/rest/agile/1.0), which Jira instances without
 * Jira Software (for example JSM-only) do not have; those calls come back as failure results.
 */
export const AGILE_CATALOG: ToolCatalog = {
  toolsets: {
    jira_agile: { description: 'Agile boards and sprints: list boards and sprints, read their issues, plan sprints', default: false },
  },
  tools: {
    jira_getAgileBoards: { toolset: 'jira_agile', access: 'read' },
    jira_getBoardIssues: { toolset: 'jira_agile', access: 'read' },
    jira_getSprintsFromBoard: { toolset: 'jira_agile', access: 'read' },
    jira_getSprintIssues: { toolset: 'jira_agile', access: 'read' },
    jira_createSprint: { toolset: 'jira_agile', access: 'write', anyOfPermissions: ['MANAGE_SPRINTS_PERMISSION'] },
    jira_updateSprint: { toolset: 'jira_agile', access: 'write', anyOfPermissions: ['MANAGE_SPRINTS_PERMISSION'] },
    jira_addIssuesToSprint: { toolset: 'jira_agile', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
    jira_moveIssuesToBacklog: { toolset: 'jira_agile', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
  },
};

const SPRINT_STATES = ['future', 'active', 'closed'] as const;
const ISSUE_FIELDS = 'summary,status,assignee,issuetype,priority';
const AGILE_API_UNAVAILABLE =
  'The Jira Software agile REST API (/rest/agile/1.0) is not available on this instance (404 Not Found), so it has no agile boards.';

/** The generated client types list query params as StringList objects; Jira expects a comma-separated string. */
const asStringList = (value: string): StringList => value as unknown as StringList;

const failure = (error: string) => formatToolResponse({ success: false, error });

const withoutUndefined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

/** Keep the fields a model needs to pick a board; drop self links. */
export function shapeBoard(value: unknown) {
  const board = asRecord(value);
  const location = asRecord(board.location);
  return {
    id: board.id,
    name: board.name,
    type: board.type,
    projectKey: location.projectKey,
    projectName: location.projectName,
  };
}

export function shapeSprint(value: unknown) {
  const sprint = asRecord(value);
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
    originBoardId: sprint.originBoardId,
  };
}

export function shapeIssue(value: unknown) {
  const issue = asRecord(value);
  const fields = asRecord(issue.fields);
  const assignee = asRecord(fields.assignee);
  return {
    key: issue.key,
    summary: fields.summary,
    status: asRecord(fields.status).name,
    type: asRecord(fields.issuetype).name,
    priority: asRecord(fields.priority).name,
    assignee: fields.assignee ? { name: assignee.name, displayName: assignee.displayName } : null,
  };
}

const pageInfo = (page: Record<string, unknown>) => ({
  startAt: page.startAt,
  maxResults: page.maxResults,
  total: page.total,
  isLast: page.isLast,
});

const shapeIssuePage = (value: unknown) => {
  const page = asRecord(value);
  return { ...pageInfo(page), issues: asArray(page.issues).map(shapeIssue) };
};

/** Returns an error message when a sprint date does not parse or the range is reversed. */
export function checkSprintDates(startDate?: string, endDate?: string): string | undefined {
  const start = startDate === undefined ? undefined : Date.parse(startDate);
  const end = endDate === undefined ? undefined : Date.parse(endDate);
  if (Number.isNaN(start)) return `startDate "${startDate}" is not a valid ISO 8601 date-time.`;
  if (Number.isNaN(end)) return `endDate "${endDate}" is not a valid ISO 8601 date-time.`;
  if (start !== undefined && end !== undefined && start >= end) return 'startDate must be before endDate.';
  return undefined;
}

const boardId = z.number().int().positive().describe('Agile board id, from jira_getAgileBoards');
const sprintId = z.number().int().positive().describe('Sprint id, from jira_getSprintsFromBoard');
const startAt = z.number().int().min(0).optional().describe('Index of the first result to return, for paging (default 0)');
const maxResults = z.number().int().min(1).max(100).optional()
  .describe('Maximum number of results to return (defaults to the server page size; Jira may cap it at 50)');
const issueJql = z.string().min(1).optional()
  .describe("Optional JQL to narrow the issues, e.g. \"status = 'In Progress' AND assignee = currentUser()\"");
const issueKeys = z.array(z.string().trim().min(1)).min(1).max(50)
  .describe('Issue keys, e.g. ["PROJ-1", "PROJ-2"]; Jira accepts at most 50 per call');
const sprintDate = (what: string) => z.string().min(1).optional()
  .describe(`${what} as an ISO 8601 date-time, e.g. 2026-11-10T09:00:00.000+03:00`);

export const agileToolSchemas = {
  getAgileBoards: {
    boardName: z.string().min(1).optional().describe('Only boards whose name contains this text (case-insensitive)'),
    projectKey: z.string().min(1).optional().describe("Only boards that show this project's issues; project key or id, e.g. 'PROJ'"),
    boardType: z.enum(['scrum', 'kanban']).optional().describe('Only boards of this type'),
    startAt,
    maxResults,
  },
  getBoardIssues: { boardId, jql: issueJql, startAt, maxResults },
  getSprintsFromBoard: {
    boardId,
    state: z.array(z.enum(SPRINT_STATES)).min(1).optional()
      .describe("Sprint states to include, e.g. ['active', 'future']. Omit for sprints in every state"),
    startAt,
    maxResults,
  },
  getSprintIssues: { sprintId, jql: issueJql, startAt, maxResults },
  createSprint: {
    boardId: z.number().int().positive().describe('Id of the scrum board the sprint belongs to, from jira_getAgileBoards'),
    name: z.string().trim().min(1).describe("Sprint name, e.g. 'Sprint 12'"),
    startDate: sprintDate('Planned start'),
    endDate: sprintDate('Planned end'),
    goal: z.string().optional().describe('Sprint goal'),
  },
  updateSprint: {
    sprintId,
    name: z.string().trim().min(1).optional().describe('New sprint name'),
    goal: z.string().optional().describe('New sprint goal; an empty string clears it'),
    startDate: sprintDate('New start'),
    endDate: sprintDate('New end'),
    state: z.enum(SPRINT_STATES).optional()
      .describe("'active' starts a future sprint (it needs start and end dates); 'closed' completes an active sprint. Jira rejects other state changes"),
  },
  addIssuesToSprint: { sprintId, issueKeys },
  moveIssuesToBacklog: { issueKeys },
};

type BoardFilter = { boardName?: string; projectKey?: string; boardType?: string; startAt?: number; maxResults: number };

/** GET /board has no path params, so a 404 means the agile API itself is missing. */
async function listBoards({ boardName, projectKey, boardType, startAt: first, maxResults: size }: BoardFilter) {
  try {
    const type = boardType ? asStringList(boardType) : undefined;
    return await BoardService.getAllBoards(size, boardName, projectKey, type, first);
  } catch (error) {
    if (asRecord(error).status === 404) throw new Error(AGILE_API_UNAVAILABLE);
    throw error;
  }
}

function registerGetAgileBoards(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getAgileBoards',
    {
      description: `List the agile (Jira Software) boards on the ${context.instanceType}, filtered by name, project or type. Returns the board ids the other jira_agile tools take.`,
      inputSchema: z.object(agileToolSchemas.getAgileBoards),
    },
    async (args) => formatToolResponse(await handleApiOperation(async () => {
      const page = asRecord(await listBoards({ ...args, maxResults: args.maxResults ?? context.getPageSize() }));
      return { ...pageInfo(page), boards: asArray(page.values).map(shapeBoard) };
    }, 'Error fetching agile boards')),
  );
}

function registerGetBoardIssues(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getBoardIssues',
    {
      description: `List the issues on an agile board in the ${context.instanceType}, in board rank order, optionally narrowed by JQL. Returns key, summary, status, type, priority and assignee per issue.`,
      inputSchema: z.object(agileToolSchemas.getBoardIssues),
    },
    async ({ boardId: board, jql, startAt: first, maxResults: size }) => formatToolResponse(await handleApiOperation(async () => {
      const page = await BoardService.getIssuesForBoard(
        board, undefined, jql, size ?? context.getPageSize(), undefined, [asStringList(ISSUE_FIELDS)], first,
      );
      return shapeIssuePage(page);
    }, 'Error fetching board issues')),
  );
}

function registerGetSprintsFromBoard(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getSprintsFromBoard',
    {
      description: `List the sprints of a scrum board in the ${context.instanceType}, optionally only those in given states (future, active, closed). Returns sprint id, name, state, goal and dates.`,
      inputSchema: z.object(agileToolSchemas.getSprintsFromBoard),
    },
    async ({ boardId: board, state, startAt: first, maxResults: size }) => formatToolResponse(await handleApiOperation(async () => {
      const states = state ? asStringList(state.join(',')) : undefined;
      const page = asRecord(await BoardService.getAllSprints(board, size ?? context.getPageSize(), states, first));
      return { ...pageInfo(page), sprints: asArray(page.values).map(shapeSprint) };
    }, 'Error fetching sprints')),
  );
}

function registerGetSprintIssues(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getSprintIssues',
    {
      description: `List the issues in a sprint in the ${context.instanceType}, in rank order, optionally narrowed by JQL. Returns key, summary, status, type, priority and assignee per issue.`,
      inputSchema: z.object(agileToolSchemas.getSprintIssues),
    },
    async ({ sprintId: sprint, jql, startAt: first, maxResults: size }) => formatToolResponse(await handleApiOperation(async () => {
      const page = await SprintService.getIssuesForSprint1(
        sprint, undefined, jql, size ?? context.getPageSize(), undefined, [asStringList(ISSUE_FIELDS)], first,
      );
      return shapeIssuePage(page);
    }, 'Error fetching sprint issues')),
  );
}

function registerCreateSprint(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_createSprint',
    {
      description: `Create a future sprint on a scrum board in the ${context.instanceType}. Dates are optional; start it later with jira_updateSprint (state 'active').`,
      inputSchema: z.object(agileToolSchemas.createSprint),
    },
    async ({ boardId: board, name, startDate, endDate, goal }) => {
      const dateError = checkSprintDates(startDate, endDate);
      if (dateError) return failure(dateError);
      return formatToolResponse(await handleApiOperation(async () => {
        const body = withoutUndefined({ name, originBoardId: board, startDate, endDate, goal });
        return shapeSprint(await SprintService.createSprint(body));
      }, 'Error creating sprint'));
    },
  );
}

function registerUpdateSprint(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_updateSprint',
    {
      description: `Change a sprint in the ${context.instanceType}: rename it, set its goal or dates, start it (state 'active') or complete it (state 'closed'). Only the fields you pass change. Closed sprints cannot be edited.`,
      inputSchema: z.object(agileToolSchemas.updateSprint),
    },
    async ({ sprintId: sprint, ...changes }) => {
      const body: SprintBean = withoutUndefined(changes);
      if (Object.keys(body).length === 0) {
        return failure('Provide at least one of name, goal, startDate, endDate or state to update.');
      }
      const dateError = checkSprintDates(changes.startDate, changes.endDate);
      if (dateError) return failure(dateError);
      return formatToolResponse(await handleApiOperation(
        async () => shapeSprint(await SprintService.partiallyUpdateSprint(sprint, body)),
        'Error updating sprint',
      ));
    },
  );
}

function registerAddIssuesToSprint(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_addIssuesToSprint',
    {
      description: `Move issues into a future or active sprint in the ${context.instanceType}, taking them out of any other sprint. At most 50 issues per call.`,
      inputSchema: z.object(agileToolSchemas.addIssuesToSprint),
    },
    async ({ sprintId: sprint, issueKeys: keys }) => formatToolResponse(await handleApiOperation(async () => {
      await SprintService.moveIssuesToSprint(sprint, { issues: keys });
      return { sprintId: sprint, issueKeys: keys, message: `Moved ${keys.length} issue(s) to sprint ${sprint}.` };
    }, 'Error adding issues to sprint')),
  );
}

function registerMoveIssuesToBacklog(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_moveIssuesToBacklog',
    {
      description: `Move issues to the backlog in the ${context.instanceType}, removing them from their future or active sprint. At most 50 issues per call.`,
      inputSchema: z.object(agileToolSchemas.moveIssuesToBacklog),
    },
    async ({ issueKeys: keys }) => formatToolResponse(await handleApiOperation(async () => {
      await BacklogService.moveIssuesToBacklog({ issues: keys });
      return { issueKeys: keys, message: `Moved ${keys.length} issue(s) to the backlog.` };
    }, 'Error moving issues to backlog')),
  );
}

export function registerAgileTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerGetAgileBoards(tools, context);
  registerGetBoardIssues(tools, context);
  registerGetSprintsFromBoard(tools, context);
  registerGetSprintIssues(tools, context);
  registerCreateSprint(tools, context);
  registerUpdateSprint(tools, context);
  registerAddIssuesToSprint(tools, context);
  registerMoveIssuesToBacklog(tools, context);
}
