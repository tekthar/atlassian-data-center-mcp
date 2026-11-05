import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: get_issue_dates, get_issue_sla, get_project_epic_hierarchy, get_cross_project_dependencies, get_issues_development_info.
 * Not implemented yet. Follow the pattern in users.ts.
 */
export const ANALYTICS_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerAnalyticsTools(_tools: PolicyRegistrar, _context: JiraToolContext): void {}
