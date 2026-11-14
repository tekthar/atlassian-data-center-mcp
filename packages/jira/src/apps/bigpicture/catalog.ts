import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * BigPicture toolsets are off by default and offered through the tool search once BigPicture is
 * found. These tools only read; BigPicture checks each box's permissions itself.
 */
export const BIGPICTURE_CATALOG: ToolCatalog = {
  toolsets: {
    bigpicture_boxes: { description: 'BigPicture boxes (portfolios, programs, projects, iterations): the hierarchy, one box, and box types and statuses', default: false },
    bigpicture_issues: { description: 'BigPicture and Jira issues: which boxes an issue is in, and its BigPicture fields such as planned dates and progress', default: false },
    bigpicture_teams: { description: 'BigPicture teams: the teams of boxes, global teams, and team members', default: false },
  },
  tools: {
    bigpicture_getBoxHierarchy: { toolset: 'bigpicture_boxes', access: 'read' },
    bigpicture_getBox: { toolset: 'bigpicture_boxes', access: 'read' },
    bigpicture_getBoxTypesAndStatuses: { toolset: 'bigpicture_boxes', access: 'read' },
    bigpicture_getIssueBoxes: { toolset: 'bigpicture_issues', access: 'read' },
    bigpicture_getIssueFields: { toolset: 'bigpicture_issues', access: 'read' },
    bigpicture_getAvailableFields: { toolset: 'bigpicture_issues', access: 'read' },
    bigpicture_getBoxTeams: { toolset: 'bigpicture_teams', access: 'read' },
    bigpicture_getGlobalTeams: { toolset: 'bigpicture_teams', access: 'read' },
    bigpicture_getTeamMembers: { toolset: 'bigpicture_teams', access: 'read' },
  },
};
