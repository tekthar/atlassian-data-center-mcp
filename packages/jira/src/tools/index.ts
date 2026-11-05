import { mergeToolCatalogs, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from './context.js';
import { AGILE_CATALOG, registerAgileTools } from './agile.js';
import { ANALYTICS_CATALOG, registerAnalyticsTools } from './analytics.js';
import { FIELDS_PROJECTS_CATALOG, registerFieldsProjectsTools } from './fields-projects.js';
import { ISSUE_MANAGEMENT_CATALOG, registerIssueManagementTools } from './issue-management.js';
import { SERVICE_DESK_CATALOG, registerServiceDeskTools } from './service-desk.js';
import { USERS_CATALOG, registerUserTools } from './users.js';
import { WORKLOG_LINKS_CATALOG, registerWorklogLinksTools } from './worklog-links.js';

interface JiraToolModule {
  catalog: ToolCatalog;
  register: (tools: PolicyRegistrar, context: JiraToolContext) => void;
}

/** Tool modules beyond the original b1ff set, each with its own catalog fragment. */
const MODULES: JiraToolModule[] = [
  { catalog: ISSUE_MANAGEMENT_CATALOG, register: registerIssueManagementTools },
  { catalog: USERS_CATALOG, register: registerUserTools },
  { catalog: FIELDS_PROJECTS_CATALOG, register: registerFieldsProjectsTools },
  { catalog: AGILE_CATALOG, register: registerAgileTools },
  { catalog: WORKLOG_LINKS_CATALOG, register: registerWorklogLinksTools },
  { catalog: SERVICE_DESK_CATALOG, register: registerServiceDeskTools },
  { catalog: ANALYTICS_CATALOG, register: registerAnalyticsTools },
];

export const JIRA_MODULES_CATALOG = mergeToolCatalogs(...MODULES.map((module) => module.catalog));

export function registerJiraModuleTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  for (const module of MODULES) {
    module.register(tools, context);
  }
}
