import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { asRecord, type JiraToolContext } from './context.js';
import { DEV_DATA_TYPES, loadIssuesDevelopmentInfo } from './analytics-dev-info.js';
import {
  briefOf,
  childrenByEpic,
  detectEpicParent,
  extractCrossProjectLinks,
  groupDependencies,
  groupEpicsByParent,
  type IssueBrief,
} from './analytics-hierarchy.js';
import {
  loadEpicChildren,
  loadHierarchyFieldIds,
  loadIssueForDates,
  loadProjectEpics,
  loadProjectIssuesWithLinks,
  loadStatuses,
  type SearchOutcome,
} from './analytics-loaders.js';
import {
  categoryLookup,
  computeSlaMetrics,
  DEFAULT_SLA_METRICS,
  measureFor,
  SLA_METRICS,
  statusCategoryIndex,
  workingHoursProblem,
  type WorkingHours,
} from './analytics-sla.js';
import {
  buildTimeline,
  describeTimeline,
  parseJiraDate,
  readIssueDates,
  summariseStatusTime,
  type IssueDateFacts,
  type TimelineSegment,
} from './analytics-timeline.js';

/*
 * Port of sooperset/mcp-atlassian get_issue_dates, get_issue_sla, get_project_epic_hierarchy,
 * get_cross_project_dependencies and get_issues_development_info, adapted to Jira Data Center.
 */

export const ANALYTICS_CATALOG: ToolCatalog = {
  toolsets: {
    jira_analytics: { description: 'Issue timelines, SLA metrics, epic hierarchy, cross-project links and batch development info', default: false },
  },
  tools: {
    jira_getIssueDates: { toolset: 'jira_analytics', access: 'read' },
    jira_getIssueSla: { toolset: 'jira_analytics', access: 'read' },
    jira_getProjectEpicHierarchy: { toolset: 'jira_analytics', access: 'read' },
    jira_getCrossProjectDependencies: { toolset: 'jira_analytics', access: 'read' },
    jira_getIssuesDevelopmentInfo: { toolset: 'jira_analytics', access: 'read' },
  },
};

export const MAX_DEV_INFO_ISSUES = 50;

const issueKey = z.string().min(1).describe('Jira issue key (e.g., PROJ-123)');
const projectKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Project keys contain only letters, digits and underscores').describe('Jira project key (e.g., PROJ)');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');

export const analyticsToolSchemas = {
  getIssueDates: {
    issueKey,
    includeStatusChanges: z.boolean().optional().describe('Include each status the issue was in, with entry/exit times and duration (default true)'),
    includeStatusSummary: z.boolean().optional().describe('Include total time and visit count per status (default true)'),
  },
  getIssueSla: {
    issueKey,
    metrics: z.array(z.enum(SLA_METRICS)).min(1).optional().describe(
      'Metrics to calculate (default cycle_time, time_in_status). cycle_time: created to resolved. lead_time: created to resolved, or to now if open. ' +
      'time_in_status: time and share per status (the current status counts up to now, or up to resolution once resolved). due_date_compliance: resolved before the end of the due day or not. ' +
      'resolution_time: first entry into an "In Progress" category status to resolved. first_response_time: created to first status transition.',
    ),
    workingHoursOnly: z.boolean().optional().describe('Count only working hours on working days (default false: calendar time)'),
    workingHoursStart: clock.optional().describe('Start of the working day, 24-hour HH:MM (default 09:00)'),
    workingHoursEnd: clock.optional().describe('End of the working day, 24-hour HH:MM (default 17:00)'),
    workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional().describe('Working days as ISO weekdays, 1 = Monday ... 7 = Sunday (default [1,2,3,4,5]; Sunday-Thursday is [7,1,2,3,4])'),
    timeZone: z.string().min(1).optional().describe('IANA time zone for working hours and day boundaries (default UTC), e.g. Asia/Riyadh'),
    includeRawDates: z.boolean().optional().describe('Also return the raw dates and status timeline the metrics were computed from (default false)'),
  },
  getProjectEpicHierarchy: {
    projectKey,
    maxEpics: z.number().int().min(1).max(500).optional().describe('Maximum epics to read, most recently updated first (1-500, default 200)'),
    includeChildren: z.boolean().optional().describe('List the issues in each epic, found through the Epic Link field (default true)'),
    maxChildren: z.number().int().min(1).max(1000).optional().describe('Maximum child issues to read across all epics (1-1000, default 500)'),
  },
  getCrossProjectDependencies: {
    projectKey,
    maxIssues: z.number().int().min(1).max(500).optional().describe('Maximum issues to scan for links, most recently updated first (1-500, default 200)'),
  },
  getIssuesDevelopmentInfo: {
    issueKeys: z.array(z.string().min(1)).min(1).max(MAX_DEV_INFO_ISSUES).describe(`Jira issue keys (e.g., ["PROJ-1", "PROJ-2"]), at most ${MAX_DEV_INFO_ISSUES}`),
    applicationType: z.string().min(1).optional().describe("Source-control type, case-sensitive: 'stash' (Bitbucket Server/Data Center), 'github', 'githube' (GitHub Enterprise), 'gitlab', 'bitbucket'. Omit to use the types Jira reports data for"),
    dataType: z.enum(DEV_DATA_TYPES).optional().describe("Only fetch 'pullrequest', 'branch' or 'repository' (commits) data. Omit for all three"),
  },
};

type SchemaArgs<T extends Record<string, z.ZodType>> = z.infer<z.ZodObject<T>>;

const datesOf = ({ created, updated, dueDate, resolutionDate, currentStatus }: IssueDateFacts) =>
  ({ created, updated, dueDate, resolutionDate, currentStatus });

async function getIssueDates(args: SchemaArgs<typeof analyticsToolSchemas.getIssueDates>) {
  const withChanges = args.includeStatusChanges ?? true;
  const withSummary = args.includeStatusSummary ?? true;
  const issue = await loadIssueForDates(args.issueKey, withChanges || withSummary);
  const facts = readIssueDates(issue);
  const changes = withChanges || withSummary ? describeTimeline(buildTimeline({ ...facts, now: Date.now() })) : [];
  return {
    issueKey: String(issue.key ?? args.issueKey),
    ...datesOf(facts),
    ...(withChanges ? { statusChanges: changes } : {}),
    ...(withSummary ? { statusSummary: summariseStatusTime(changes) } : {}),
  };
}

type SlaArgs = SchemaArgs<typeof analyticsToolSchemas.getIssueSla>;

const workingHoursOf = (args: SlaArgs): WorkingHours | undefined => args.workingHoursOnly
  ? { start: args.workingHoursStart ?? '09:00', end: args.workingHoursEnd ?? '17:00', days: args.workingDays ?? [1, 2, 3, 4, 5], timeZone: args.timeZone ?? 'UTC' }
  : undefined;

const rawTimeline = (segments: TimelineSegment[]) =>
  segments.map(({ status, enteredAt, exitedAt, transitionedBy }) => ({ status, enteredAt, exitedAt, ...(transitionedBy ? { transitionedBy } : {}) }));

async function getIssueSla(args: SlaArgs, hours: WorkingHours | undefined) {
  const metrics = args.metrics ?? DEFAULT_SLA_METRICS;
  const issue = await loadIssueForDates(args.issueKey, true);
  const facts = readIssueDates(issue);
  const now = Date.now();
  // Once resolved, the final status stops accruing time, so time in status ends at resolution.
  const segments = buildTimeline({ ...facts, now: parseJiraDate(facts.resolutionDate) ?? now });
  const statuses = metrics.includes('resolution_time') ? await loadStatuses() : [];
  const categoryOf = categoryLookup(statusCategoryIndex([...statuses, asRecord(issue.fields).status]));
  return {
    issueKey: String(issue.key ?? args.issueKey),
    metricsCalculated: [...new Set(metrics)],
    workingHoursApplied: hours !== undefined,
    ...(hours ? { workingHoursConfig: hours } : {}),
    metrics: computeSlaMetrics(metrics, { ...facts, segments, now, categoryOf }, measureFor(hours)),
    ...(args.includeRawDates ? { rawDates: { ...datesOf(facts), statusChanges: rawTimeline(segments) } } : {}),
  };
}

type HierarchyArgs = SchemaArgs<typeof analyticsToolSchemas.getProjectEpicHierarchy>;

interface ChildrenSection {
  byEpic?: Map<string, IssueBrief[]>;
  summary: { included: boolean; reason?: string; total?: number; truncated?: boolean };
}

async function loadChildren(epics: SearchOutcome, epicLinkFieldId: string | undefined, args: HierarchyArgs): Promise<ChildrenSection> {
  if (args.includeChildren === false) return { summary: { included: false } };
  if (!epicLinkFieldId) return { summary: { included: false, reason: 'No Epic Link field found; Jira Software may not be installed.' } };
  const keys = epics.issues.map((epic) => briefOf(epic).key).filter(Boolean);
  if (keys.length === 0) return { byEpic: new Map<string, IssueBrief[]>(), summary: { included: true, total: 0, truncated: false } };
  const children = await loadEpicChildren(keys, epicLinkFieldId, args.maxChildren ?? 500);
  return {
    byEpic: childrenByEpic(children.issues, epicLinkFieldId),
    summary: { included: true, total: children.issues.length, truncated: children.truncated },
  };
}

async function getProjectEpicHierarchy(args: HierarchyArgs) {
  const project = args.projectKey.toUpperCase();
  const fieldIds = await loadHierarchyFieldIds();
  const epics = await loadProjectEpics(project, fieldIds.parentLink, args.maxEpics ?? 200);
  const { byEpic, summary } = await loadChildren(epics, fieldIds.epicLink, args);
  const nodes = epics.issues.map((epic) => {
    const brief = briefOf(epic);
    const children = byEpic?.get(brief.key);
    const node = byEpic ? { ...brief, childCount: children?.length ?? 0, children: children ?? [] } : brief;
    return { epic: node, parent: detectEpicParent(epic, project, fieldIds.parentLink) };
  });
  return { projectKey: project, totalEpics: epics.issues.length, epicsInProject: epics.total, groups: groupEpicsByParent(nodes), children: summary };
}

async function getCrossProjectDependencies(args: SchemaArgs<typeof analyticsToolSchemas.getCrossProjectDependencies>) {
  const project = args.projectKey.toUpperCase();
  const scan = await loadProjectIssuesWithLinks(project, args.maxIssues ?? 200);
  const links = scan.issues.flatMap((issue) => extractCrossProjectLinks(issue, project));
  return {
    projectKey: project,
    totalIssuesScanned: scan.issues.length,
    issuesInProject: scan.total,
    totalCrossProjectLinks: links.length,
    byProject: groupDependencies(links),
  };
}

function registerTimelineTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getIssueDates',
    {
      description: `Get an issue's created, updated, due and resolution dates from the ${context.instanceType}, plus its status timeline from the changelog: each status with entry/exit times and duration (the current status is measured up to now and marked ongoing), and total time per status.`,
      inputSchema: z.object(analyticsToolSchemas.getIssueDates),
    },
    async (args) => formatToolResponse(await handleApiOperation(() => getIssueDates(args), 'Error getting issue dates')),
  );

  tools.registerTool(
    'jira_getIssueSla',
    {
      description: `Calculate SLA metrics for an issue in the ${context.instanceType} from its dates and status changelog: cycle time, lead time, time in status, due date compliance, resolution time and first response time. Optionally counts only working hours (configurable hours, weekdays and time zone).`,
      inputSchema: z.object(analyticsToolSchemas.getIssueSla),
    },
    async (args) => {
      const hours = workingHoursOf(args);
      const problem = hours ? workingHoursProblem(hours) : undefined;
      if (problem) return formatToolResponse({ success: false, error: problem });
      return formatToolResponse(await handleApiOperation(() => getIssueSla(args, hours), 'Error calculating issue SLA'));
    },
  );
}

function registerProjectTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool(
    'jira_getProjectEpicHierarchy',
    {
      description: `Map a project's epics in the ${context.instanceType}: groups epics under their parent issue (Advanced Roadmaps Parent Link, or a parent field / "is child of" link to another project; the rest under "Unlinked") and lists each epic's child issues via the Epic Link field. Scans up to 500 epics and 1000 children.`,
      inputSchema: z.object(analyticsToolSchemas.getProjectEpicHierarchy),
    },
    async (args) => formatToolResponse(await handleApiOperation(() => getProjectEpicHierarchy(args), 'Error getting project epic hierarchy')),
  );

  tools.registerTool(
    'jira_getCrossProjectDependencies',
    {
      description: `Find issue links from a project's issues to issues in other projects in the ${context.instanceType}, grouped by target project and link type, with each link's direction, relationship (e.g. "is blocked by") and the target's status. Scans up to 500 issues, most recently updated first.`,
      inputSchema: z.object(analyticsToolSchemas.getCrossProjectDependencies),
    },
    async (args) => formatToolResponse(await handleApiOperation(() => getCrossProjectDependencies(args), 'Error getting cross-project dependencies')),
  );

  tools.registerTool(
    'jira_getIssuesDevelopmentInfo',
    {
      description: `Get linked pull requests, branches, commits and repositories for up to ${MAX_DEV_INFO_ISSUES} issues at once from the ${context.instanceType} development panel (dev-status API). Each issue reports its own error, so one failure does not fail the batch.`,
      inputSchema: z.object(analyticsToolSchemas.getIssuesDevelopmentInfo),
    },
    async ({ issueKeys, applicationType, dataType }) => formatToolResponse(
      await handleApiOperation(() => loadIssuesDevelopmentInfo(issueKeys, { applicationType, dataType }), 'Error getting development info'),
    ),
  );
}

export function registerAnalyticsTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerTimelineTools(tools, context);
  registerProjectTools(tools, context);
}
