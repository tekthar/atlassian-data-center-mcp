import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Timesheet Tracking's toolset is off by default and offered through the tool search once the app is found. The
 * app decides what each user sees: work plans on the issues they may manage, and running timers, everyone's for
 * Jira administrators.
 */
export const TIMESHEET_TRACKING_CATALOG: ToolCatalog = {
  toolsets: {
    timesheettracking_work: { description: 'Timesheet Tracking for Jira: planned work (work plans) by person, period or issue, and running timers', default: false },
  },
  tools: {
    timesheettracking_getWorkPlans: { toolset: 'timesheettracking_work', access: 'read' },
    timesheettracking_getIssueWorkPlans: { toolset: 'timesheettracking_work', access: 'read' },
    timesheettracking_getTimers: { toolset: 'timesheettracking_work', access: 'read' },
  },
};
