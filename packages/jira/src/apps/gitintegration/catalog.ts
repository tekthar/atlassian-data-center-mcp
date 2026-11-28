import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Git Integration's toolset is off by default and offered through the tool search once the app is found. The app
 * decides which repositories and commits each user sees.
 */
export const GIT_INTEGRATION_CATALOG: ToolCatalog = {
  toolsets: {
    gitintegration_code: { description: 'Git Integration for Jira: an issue\'s commits, branches and pull requests, and the connected repositories', default: false },
  },
  tools: {
    gitintegration_getIssueCommits: { toolset: 'gitintegration_code', access: 'read' },
    gitintegration_getIssueBranches: { toolset: 'gitintegration_code', access: 'read' },
    gitintegration_getIssuePullRequests: { toolset: 'gitintegration_code', access: 'read' },
    gitintegration_getRepositories: { toolset: 'gitintegration_code', access: 'read' },
  },
};
