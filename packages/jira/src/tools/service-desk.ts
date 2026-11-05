import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_service_desk_for_project, get_service_desk_queues, get_queue_issues, get_request_types, get_request_type_fields, create_customer_request.
 * Not implemented yet. Follow the pattern in users.ts.
 */
export const SERVICE_DESK_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerServiceDeskTools(_tools: PolicyRegistrar, _context: JiraToolContext): void {}
