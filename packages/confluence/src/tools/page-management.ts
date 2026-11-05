import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { ConfluenceToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_page_children, get_space_page_tree, delete_page, move_page, copy_page, get_page_history, get_page_diff, get_labels, add_label, get_page_restrictions, set_page_restrictions.
 * Not implemented yet. Follow the pattern in the Jira package (packages/jira/src/tools/users.ts).
 */
export const PAGE_MANAGEMENT_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerPageManagementTools(_tools: PolicyRegistrar, _context: ConfluenceToolContext): void {}
