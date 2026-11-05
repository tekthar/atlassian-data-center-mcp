import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_worklog, add_worklog, create_remote_issue_link, link_to_epic.
 * Not implemented yet. Follow the pattern in users.ts.
 */
export const WORKLOG_LINKS_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerWorklogLinksTools(_tools: PolicyRegistrar, _context: JiraToolContext): void {}
