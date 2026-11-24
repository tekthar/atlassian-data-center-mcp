import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Zephyr Essential's toolset is off by default and offered through the tool search once the app is found. It is
 * a different app from Zephyr (formerly Zephyr Scale), whose tools are the zephyr_ ones.
 */
export const ZEPHYR_ESSENTIAL_CATALOG: ToolCatalog = {
  toolsets: {
    zephyressential_tests: { description: 'Zephyr Essential (formerly Zephyr Squad): test executions found with ZQL, test steps, and step results', default: false },
  },
  tools: {
    zephyressential_searchExecutions: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getTestSteps: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getStepResults: { toolset: 'zephyressential_tests', access: 'read' },
  },
};
