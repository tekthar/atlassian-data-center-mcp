import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/**
 * Every Jira tool with its toolset and access level. The default toolsets expose the same
 * tools this server has always exposed, so setting nothing keeps existing setups unchanged.
 * A tool registered without an entry here fails at startup.
 */
export const JIRA_TOOL_CATALOG: ToolCatalog = {
  toolsets: {
    jira_issues: { description: 'Search, read, create and update issues', default: true },
    jira_comments: { description: 'Read, add and edit issue comments', default: true },
    jira_transitions: { description: 'List and run workflow transitions', default: true },
    jira_links: { description: 'Issue link types, link and unlink issues', default: true },
    jira_watchers: { description: 'Watch and unwatch issues as yourself', default: true },
    jira_versions: { description: 'Project versions (releases)', default: true },
    jira_development: { description: 'Branches, commits and pull requests linked to issues', default: true },
    jira_attachments: { description: 'Download and upload issue attachments', default: true },
  },
  tools: {
    jira_searchIssues: { toolset: 'jira_issues', access: 'read' },
    jira_getIssue: { toolset: 'jira_issues', access: 'read' },
    jira_createIssue: { toolset: 'jira_issues', access: 'write' },
    jira_updateIssue: { toolset: 'jira_issues', access: 'write' },
    jira_getIssueComments: { toolset: 'jira_comments', access: 'read' },
    jira_postIssueComment: { toolset: 'jira_comments', access: 'write' },
    jira_updateIssueComment: { toolset: 'jira_comments', access: 'write' },
    jira_getTransitions: { toolset: 'jira_transitions', access: 'read' },
    jira_transitionIssue: { toolset: 'jira_transitions', access: 'write' },
    jira_getIssueLinkTypes: { toolset: 'jira_links', access: 'read' },
    jira_linkIssues: { toolset: 'jira_links', access: 'write' },
    jira_unlinkIssues: { toolset: 'jira_links', access: 'destructive' },
    jira_watchIssue: { toolset: 'jira_watchers', access: 'write' },
    jira_unwatchIssue: { toolset: 'jira_watchers', access: 'write' },
    jira_getProjectVersions: { toolset: 'jira_versions', access: 'read' },
    jira_getVersion: { toolset: 'jira_versions', access: 'read' },
    jira_createVersion: { toolset: 'jira_versions', access: 'write' },
    jira_updateVersion: { toolset: 'jira_versions', access: 'write' },
    jira_deleteVersion: { toolset: 'jira_versions', access: 'destructive' },
    jira_getIssueDevelopmentInfo: { toolset: 'jira_development', access: 'read' },
    jira_downloadAttachment: { toolset: 'jira_attachments', access: 'read' },
    jira_uploadAttachment: { toolset: 'jira_attachments', access: 'write' },
  },
};
