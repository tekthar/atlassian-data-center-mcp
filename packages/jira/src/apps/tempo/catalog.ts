import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Tempo toolsets are off by default and offered through the tool search once Tempo Timesheets is found.
 * Tempo shows each user the worklogs and timesheets its own permissions allow. Logging, changing and
 * deleting time use Jira's worklog permissions, which Tempo also checks; deleting is destructive, so the
 * tool search never offers it. Submitting and reviewing timesheets are decided by Tempo's own permissions,
 * which Jira's permission list doesn't report, so those are left ungated.
 */
export const TEMPO_CATALOG: ToolCatalog = {
  toolsets: {
    tempo_worklogs: { description: 'Tempo worklogs: search the time logged by person, issue, project, epic, team or account, with total hours, read one, and log, change or delete time', default: false },
    tempo_accounts: { description: 'Tempo accounts that time is logged against: list them, read one, and the account of an issue', default: false },
    tempo_teams: { description: 'Tempo teams: list them, read one, its members with their roles and availability, and the teams a person is in', default: false },
    tempo_timesheets: { description: 'Tempo timesheets: timesheet periods, approval statuses for a person, a team or a reviewer, and submitting, approving, rejecting or reopening timesheets', default: false },
  },
  tools: {
    tempo_getAccounts: { toolset: 'tempo_accounts', access: 'read' },
    tempo_getAccount: { toolset: 'tempo_accounts', access: 'read' },
    tempo_getIssueAccount: { toolset: 'tempo_accounts', access: 'read' },
    tempo_getTeams: { toolset: 'tempo_teams', access: 'read' },
    tempo_getTeam: { toolset: 'tempo_teams', access: 'read' },
    tempo_getTeamMembers: { toolset: 'tempo_teams', access: 'read' },
    tempo_getUserTeams: { toolset: 'tempo_teams', access: 'read' },
    tempo_searchWorklogs: { toolset: 'tempo_worklogs', access: 'read' },
    tempo_getWorklog: { toolset: 'tempo_worklogs', access: 'read' },
    tempo_logTime: { toolset: 'tempo_worklogs', access: 'write', anyOfPermissions: ['WORK_ON_ISSUES'] },
    tempo_updateWorklog: { toolset: 'tempo_worklogs', access: 'write', anyOfPermissions: ['EDIT_OWN_WORKLOGS', 'EDIT_ALL_WORKLOGS'] },
    tempo_deleteWorklog: { toolset: 'tempo_worklogs', access: 'destructive', anyOfPermissions: ['DELETE_OWN_WORKLOGS', 'DELETE_ALL_WORKLOGS'] },
    tempo_getPeriods: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getTimesheetApproval: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getTeamTimesheetApprovals: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getPendingTimesheetApprovals: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_getSuggestedReviewers: { toolset: 'tempo_timesheets', access: 'read' },
    tempo_submitTimesheet: { toolset: 'tempo_timesheets', access: 'write' },
    tempo_reviewTimesheet: { toolset: 'tempo_timesheets', access: 'write' },
  },
};
