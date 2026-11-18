import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Tempo toolsets are off by default and offered through the tool search once Tempo Timesheets is found.
 * These tools only read; Tempo shows each user the worklogs and timesheets its own permissions allow.
 */
export const TEMPO_CATALOG: ToolCatalog = {
  toolsets: {
    tempo_worklogs: { description: 'Tempo worklogs: search the time logged by person, issue, project, epic, team or account, with total hours, and read one worklog', default: false },
    tempo_timesheets: { description: 'Tempo timesheets: timesheet periods, and approval statuses for a person, a team or a reviewer', default: false },
  },
  tools: {
    tempo_searchWorklogs: { toolset: 'tempo_worklogs', access: 'read' },
    tempo_getWorklog: { toolset: 'tempo_worklogs', access: 'read' },
    tempo_getPeriods: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getTimesheetApproval: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getTeamTimesheetApprovals: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getPendingTimesheetApprovals: { toolset: 'tempo_timesheets', access: 'read' },
  },
};
