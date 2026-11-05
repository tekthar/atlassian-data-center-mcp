import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { EpicService, IssueService, type RemoteIssueLinkCreateOrUpdateRequest } from '../jira-client/index.js';
import { asArray, asRecord, type JiraToolContext } from './context.js';

/** Port of sooperset/mcp-atlassian tools: get_worklog, add_worklog, create_remote_issue_link, link_to_epic. */
export const WORKLOG_LINKS_CATALOG: ToolCatalog = {
  toolsets: {
    jira_worklog: { description: 'Read and log work time on issues', default: false },
    jira_remote_links: { description: 'Add web links to issues and move issues into epics', default: false },
  },
  tools: {
    jira_getWorklog: { toolset: 'jira_worklog', access: 'read' },
    jira_addWorklog: { toolset: 'jira_worklog', access: 'write' },
    jira_createRemoteIssueLink: { toolset: 'jira_remote_links', access: 'write' },
    jira_linkToEpic: { toolset: 'jira_remote_links', access: 'write' },
  },
};

/** Jira duration such as '1h 30m', '2d', '1w 2d' or '1.5h'; Jira converts it using the instance's working-day settings. */
const DURATION = /^\s*(\d+(\.\d+)?\s*[wdhm]\s*)+$/i;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/;
/** The agile endpoint moves at most this many issues per request. */
const MAX_EPIC_ISSUES = 50;

type AdjustEstimate = 'auto' | 'leave' | 'new' | 'manual';

interface EstimateArgs {
  adjustEstimate?: AdjustEstimate;
  newEstimate?: string;
  reduceBy?: string;
}

const duration = (what: string) => z.string().regex(DURATION, `${what} must be a Jira duration such as '1h 30m', '2d' or '45m'`);

/** Jira DC only parses `yyyy-MM-ddTHH:mm:ss.SSS+hhmm`, so normalise other ISO 8601 spellings to it. */
export function toJiraDateTime(value: string): string {
  const match = ISO_DATE_TIME.exec(value.trim());
  if (!match) return value;
  const [, date, hoursMinutes, seconds = '00', fraction = '', zone] = match;
  const millis = fraction.padEnd(3, '0').slice(0, 3);
  const offset = zone === 'Z' ? '+0000' : zone.replace(':', '');
  return `${date}T${hoursMinutes}:${seconds}.${millis}${offset}`;
}

const shapeAuthor = (value: unknown) => {
  const user = asRecord(value);
  return { name: user.name, displayName: user.displayName };
};

/** Keep what a model needs to read a worklog; drop self links, issue ids and avatars. */
export function shapeWorklog(value: unknown) {
  const worklog = asRecord(value);
  return {
    id: worklog.id,
    author: shapeAuthor(worklog.author),
    started: worklog.started,
    timeSpent: worklog.timeSpent,
    timeSpentSeconds: worklog.timeSpentSeconds,
    comment: worklog.comment,
    created: worklog.created,
    updated: worklog.updated,
    visibility: worklog.visibility,
  };
}

const secondsOf = (worklog: ReturnType<typeof shapeWorklog>) =>
  (typeof worklog.timeSpentSeconds === 'number' ? worklog.timeSpentSeconds : 0);

async function getWorklogs(issueKey: string) {
  // Jira DC returns every worklog of the issue in one response; it has no paging parameters here.
  const page = asRecord(await IssueService.getIssueWorklog(issueKey));
  const worklogs = asArray(page.worklogs).map(shapeWorklog);
  return {
    issueKey,
    total: page.total ?? worklogs.length,
    totalTimeSpentSeconds: worklogs.reduce((sum, worklog) => sum + secondsOf(worklog), 0),
    worklogs,
  };
}

/** sooperset's remaining_estimate maps to adjustEstimate=new; infer the mode from the value given. */
function inferAdjustEstimate({ adjustEstimate, newEstimate, reduceBy }: EstimateArgs): AdjustEstimate | undefined {
  if (adjustEstimate) return adjustEstimate;
  if (newEstimate) return 'new';
  return reduceBy ? 'manual' : undefined;
}

function estimateError(args: EstimateArgs): string | undefined {
  const mode = inferAdjustEstimate(args);
  if (args.newEstimate && args.reduceBy) return 'Give newEstimate or reduceBy, not both.';
  if (mode === 'new' && !args.newEstimate) return "adjustEstimate 'new' needs newEstimate, the new remaining estimate (e.g. '2d').";
  if (mode === 'manual' && !args.reduceBy) return "adjustEstimate 'manual' needs reduceBy, the amount to take off the remaining estimate (e.g. '1h').";
  if (args.newEstimate && mode !== 'new') return "newEstimate only applies when adjustEstimate is 'new'.";
  if (args.reduceBy && mode !== 'manual') return "reduceBy only applies when adjustEstimate is 'manual'.";
  return undefined;
}

interface AddWorklogArgs extends EstimateArgs {
  issueKey: string;
  timeSpent: string;
  started?: string;
  comment?: string;
}

async function postWorklog(args: AddWorklogArgs) {
  const created = await IssueService.addWorklog(args.issueKey, args.newEstimate, inferAdjustEstimate(args), args.reduceBy, {
    timeSpent: args.timeSpent.trim(),
    started: args.started ? toJiraDateTime(args.started) : undefined,
    comment: args.comment,
  });
  return shapeWorklog(created);
}

const setOriginalEstimate = (issueKey: string, originalEstimate: string) =>
  IssueService.editIssue(issueKey, undefined, { fields: { timetracking: { originalEstimate } } });

interface RemoteLinkArgs {
  issueKey: string;
  url: string;
  title: string;
  summary?: string;
  relationship?: string;
  iconUrl?: string;
}

function remoteLinkRequest({ url, title, summary, relationship, iconUrl }: RemoteLinkArgs): RemoteIssueLinkCreateOrUpdateRequest {
  return {
    object: { url, title, summary, ...(iconUrl ? { icon: { url16x16: iconUrl, title } } : {}) },
    relationship,
  };
}

async function createRemoteLink(args: RemoteLinkArgs) {
  const created = asRecord(await IssueService.createOrUpdateRemoteIssueLink(args.issueKey, remoteLinkRequest(args)));
  return { id: created.id, issueKey: args.issueKey, url: args.url, title: args.title, relationship: args.relationship };
}

const issueKeySchema = z.string().trim().min(1);
const httpUrl = z.url({ protocol: /^https?$/ });

export const worklogLinksToolSchemas = {
  getWorklog: {
    issueKey: issueKeySchema.describe('Jira issue key (e.g. PROJ-123)'),
  },
  addWorklog: {
    issueKey: issueKeySchema.describe('Jira issue key (e.g. PROJ-123)'),
    timeSpent: duration('timeSpent').describe("Time spent in Jira duration format, e.g. '1h 30m', '45m', '1d' or '1w 2d'. Days and weeks follow the instance's working-time settings"),
    started: z.string().regex(ISO_DATE_TIME, 'started must be an ISO 8601 date-time with a time zone').optional()
      .describe("When the work started, as ISO 8601 with a time zone, e.g. '2026-11-05T09:00:00.000+0300' or '2026-11-05T06:00:00Z'. Defaults to now"),
    comment: z.string().optional().describe('Worklog comment in JIRA Wiki Markup'),
    adjustEstimate: z.enum(['auto', 'leave', 'new', 'manual']).optional()
      .describe("How to change the remaining estimate: 'auto' (default, reduce by timeSpent), 'leave' (unchanged), 'new' (set to newEstimate), 'manual' (reduce by reduceBy)"),
    newEstimate: duration('newEstimate').optional().describe("New remaining estimate, e.g. '2d'. Implies adjustEstimate 'new'"),
    reduceBy: duration('reduceBy').optional().describe("Amount to take off the remaining estimate, e.g. '1h'. Implies adjustEstimate 'manual'"),
    originalEstimate: duration('originalEstimate').optional()
      .describe("Set the issue's original estimate first, e.g. '3d'. If that update fails, no work is logged"),
  },
  createRemoteIssueLink: {
    issueKey: issueKeySchema.describe('Key of the issue to add the link to (e.g. PROJ-123)'),
    url: httpUrl.describe('http(s) URL to link to, e.g. a Confluence page or any web page'),
    title: z.string().trim().min(1).describe("Text shown for the link, e.g. 'Design document'"),
    summary: z.string().optional().describe('Optional description shown with the link'),
    relationship: z.string().optional()
      .describe("Optional relationship, used to group links on the issue, e.g. 'documentation', 'causes', 'relates to'"),
    iconUrl: httpUrl.optional().describe('Optional URL of a 16x16 icon shown next to the link'),
  },
  linkToEpic: {
    epicKey: issueKeySchema.describe('Key of the epic to link the issues to (e.g. PROJ-456)'),
    issueKeys: z.array(issueKeySchema).min(1).max(MAX_EPIC_ISSUES)
      .describe(`Keys of the issues to put in the epic (1 to ${MAX_EPIC_ISSUES}). Issues already in another epic are moved. Sub-tasks and epics cannot be added`),
  },
};

function registerGetWorklog(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getWorklog',
    {
      description: `Get all worklog entries (who logged how much time, when, with which comment) for an issue in the ${context.instanceType}, with the total time logged.`,
      inputSchema: z.object(worklogLinksToolSchemas.getWorklog),
    },
    async ({ issueKey }) => formatToolResponse(await handleApiOperation(() => getWorklogs(issueKey), 'Error fetching worklogs')),
  );
}

function registerAddWorklog(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_addWorklog',
    {
      description: `Log work on an issue in the ${context.instanceType} as the authenticated user, optionally adjusting the remaining or original estimate.`,
      inputSchema: z.object(worklogLinksToolSchemas.addWorklog),
    },
    async (args) => {
      const invalid = estimateError(args);
      if (invalid) return formatToolResponse({ success: false, error: invalid });
      const { issueKey, originalEstimate } = args;
      if (originalEstimate) {
        const estimate = await handleApiOperation(
          () => setOriginalEstimate(issueKey, originalEstimate),
          'Error setting the original estimate, so no work was logged',
        );
        if (!estimate.success) return formatToolResponse(estimate);
      }
      return formatToolResponse(await handleApiOperation(() => postWorklog(args), 'Error adding worklog'));
    },
  );
}

function registerCreateRemoteIssueLink(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_createRemoteIssueLink',
    {
      description: `Add a web link (any http(s) URL, such as a Confluence page) to an issue in the ${context.instanceType}. It appears in the issue's Links section. To link two Jira issues use jira_linkIssues instead.`,
      inputSchema: z.object(worklogLinksToolSchemas.createRemoteIssueLink),
    },
    async (args) => formatToolResponse(await handleApiOperation(() => createRemoteLink(args), 'Error creating remote issue link')),
  );
}

function registerLinkToEpic(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_linkToEpic',
    {
      description: `Put one or more issues into an epic (sets their Epic Link) in the ${context.instanceType}, using the Jira Software agile API.`,
      inputSchema: z.object(worklogLinksToolSchemas.linkToEpic),
    },
    async ({ epicKey, issueKeys }) => {
      if (issueKeys.some((key) => key.toUpperCase() === epicKey.toUpperCase())) {
        return formatToolResponse({ success: false, error: `${epicKey} cannot be linked to itself; remove it from issueKeys.` });
      }
      return formatToolResponse(await handleApiOperation(async () => {
        await EpicService.moveIssuesToEpic(epicKey, { issues: issueKeys });
        return { epicKey, linkedIssues: issueKeys };
      }, 'Error linking issues to epic'));
    },
  );
}

export function registerWorklogLinksTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerGetWorklog(tools, context);
  registerAddWorklog(tools, context);
  registerCreateRemoteIssueLink(tools, context);
  registerLinkToEpic(tools, context);
}
