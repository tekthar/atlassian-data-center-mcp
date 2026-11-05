import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_agile_boards, get_board_issues, get_sprints_from_board, get_sprint_issues, create_sprint, update_sprint, add_issues_to_sprint, move_issues_to_backlog.
 * Not implemented yet. Follow the pattern in users.ts.
 */
export const AGILE_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerAgileTools(_tools: PolicyRegistrar, _context: JiraToolContext): void {}
