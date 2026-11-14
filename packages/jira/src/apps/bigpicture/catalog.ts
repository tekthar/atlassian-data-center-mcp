import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * BigPicture toolsets are off by default and offered through the tool search once BigPicture is
 * found. BigPicture checks each box's and team's permissions itself, so only the issue field write is
 * gated on a Jira permission. Removing a team member loses its planned availability, so it is
 * destructive: never offered by the tool search, listed only when TOOLSETS or ENABLED_TOOLS selects it.
 */
export const BIGPICTURE_CATALOG: ToolCatalog = {
  toolsets: {
    bigpicture_boxes: { description: 'BigPicture boxes (portfolios, programs, projects, iterations): the hierarchy, one box, box types and statuses, and adding boxes', default: false },
    bigpicture_issues: { description: 'BigPicture and Jira issues: which boxes an issue is in, and reading and setting its BigPicture fields such as planned dates and progress', default: false },
    bigpicture_teams: { description: 'BigPicture teams: the teams of boxes, global teams, and adding, changing and removing team members', default: false },
  },
  tools: {
    bigpicture_getBoxHierarchy: { toolset: 'bigpicture_boxes', access: 'read' },
    bigpicture_getBox: { toolset: 'bigpicture_boxes', access: 'read' },
    bigpicture_getBoxTypesAndStatuses: { toolset: 'bigpicture_boxes', access: 'read' },
    bigpicture_addBox: { toolset: 'bigpicture_boxes', access: 'write' },
    bigpicture_getIssueBoxes: { toolset: 'bigpicture_issues', access: 'read' },
    bigpicture_getIssueFields: { toolset: 'bigpicture_issues', access: 'read' },
    bigpicture_getAvailableFields: { toolset: 'bigpicture_issues', access: 'read' },
    bigpicture_updateIssueField: { toolset: 'bigpicture_issues', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
    bigpicture_getBoxTeams: { toolset: 'bigpicture_teams', access: 'read' },
    bigpicture_getGlobalTeams: { toolset: 'bigpicture_teams', access: 'read' },
    bigpicture_getTeamMembers: { toolset: 'bigpicture_teams', access: 'read' },
    bigpicture_addTeamMember: { toolset: 'bigpicture_teams', access: 'write' },
    bigpicture_updateTeamMember: { toolset: 'bigpicture_teams', access: 'write' },
    bigpicture_removeTeamMember: { toolset: 'bigpicture_teams', access: 'destructive' },
  },
};
