import type { PolicyRegistrar, ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';

/**
 * Port of sooperset/mcp-atlassian tools: search_fields, get_field_options, get_create_fields, get_project_issue_types, get_project_fields, get_all_projects, search_projects, get_project_components, batch_create_versions.
 * Not implemented yet. Follow the pattern in users.ts.
 */
export const FIELDS_PROJECTS_CATALOG: ToolCatalog = { toolsets: {}, tools: {} };

export function registerFieldsProjectsTools(_tools: PolicyRegistrar, _context: JiraToolContext): void {}
