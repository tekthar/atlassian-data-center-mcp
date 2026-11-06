import { mergeToolCatalogs, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import type { ConfluenceToolContext } from './context.js';
import { COLLABORATION_CATALOG, registerCollaborationTools } from './collaboration.js';
import { PAGE_MANAGEMENT_CATALOG, registerPageManagementTools } from './page-management.js';

interface ConfluenceToolModule {
  catalog: ToolCatalog;
  register: (tools: PolicyRegistrar, context: ConfluenceToolContext) => void;
}

/** Tool modules beyond the core tools in index.ts, each with its own catalog fragment. */
const MODULES: ConfluenceToolModule[] = [
  { catalog: PAGE_MANAGEMENT_CATALOG, register: registerPageManagementTools },
  { catalog: COLLABORATION_CATALOG, register: registerCollaborationTools },
];

export const CONFLUENCE_MODULES_CATALOG = mergeToolCatalogs(...MODULES.map((module) => module.catalog));

export function registerConfluenceModuleTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  for (const module of MODULES) {
    module.register(tools, context);
  }
}
