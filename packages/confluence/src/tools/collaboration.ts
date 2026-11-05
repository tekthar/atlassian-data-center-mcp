import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { ConfluenceToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_comments, add_comment, reply_to_comment, get_inline_comments, add_inline_comment, get_attachments, delete_attachment, search_user.
 * Not implemented yet. Follow the pattern in the Jira package (packages/jira/src/tools/users.ts).
 */
export const COLLABORATION_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerCollaborationTools(_tools: PolicyRegistrar, _context: ConfluenceToolContext): void {}
