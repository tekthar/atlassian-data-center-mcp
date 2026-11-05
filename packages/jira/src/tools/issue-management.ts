import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_project_issues, batch_create_issues, assign_issue, delete_issue, get_issue_watchers, add_watcher, remove_watcher.
 * Not implemented yet. Follow the pattern in users.ts.
 */
export const ISSUE_MANAGEMENT_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerIssueManagementTools(_tools: PolicyRegistrar, _context: JiraToolContext): void {}
