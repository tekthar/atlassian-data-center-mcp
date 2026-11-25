import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Zephyr Essential's toolset is off by default and offered through the tool search once the app is found. It is
 * a different app from Zephyr (formerly Zephyr Scale), whose tools are the zephyr_ ones.
 */
export const ZEPHYR_ESSENTIAL_CATALOG: ToolCatalog = {
  toolsets: {
    zephyressential_tests: { description: 'Zephyr Essential (formerly Zephyr Squad): test executions found with ZQL, test steps and step results, cycles and folders, the tests covering a requirement, recording results, and creating and filling cycles', default: false },
  },
  tools: {
    zephyressential_searchExecutions: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getTestSteps: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getStepResults: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getCycles: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getCycleFolders: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_getRequirementCoverage: { toolset: 'zephyressential_tests', access: 'read' },
    zephyressential_recordResult: { toolset: 'zephyressential_tests', access: 'write' },
    zephyressential_recordStepResult: { toolset: 'zephyressential_tests', access: 'write' },
    zephyressential_createCycle: { toolset: 'zephyressential_tests', access: 'write' },
    zephyressential_addTestsToCycle: { toolset: 'zephyressential_tests', access: 'write' },
  },
};
