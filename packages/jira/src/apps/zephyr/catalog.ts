import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Zephyr toolsets are off by default and offered through the tool search once Zephyr is found. These
 * tools only read; Zephyr decides who may see each project's tests.
 */
export const ZEPHYR_CATALOG: ToolCatalog = {
  toolsets: {
    zephyr_test_cases: { description: 'Zephyr test cases: search them with TQL, read one with its steps, its latest result, and the test cases covering a Jira issue', default: false },
    zephyr_test_cycles: { description: 'Zephyr test cycles: search them, read one with its test cases, its execution results, and a project\'s environments', default: false },
    zephyr_test_plans: { description: 'Zephyr test plans: search them and read one with its test cycles', default: false },
  },
  tools: {
    zephyr_getTestCase: { toolset: 'zephyr_test_cases', access: 'read' },
    zephyr_searchTestCases: { toolset: 'zephyr_test_cases', access: 'read' },
    zephyr_getLatestTestResult: { toolset: 'zephyr_test_cases', access: 'read' },
    zephyr_getIssueTestCases: { toolset: 'zephyr_test_cases', access: 'read' },
    zephyr_getTestCycle: { toolset: 'zephyr_test_cycles', access: 'read' },
    zephyr_searchTestCycles: { toolset: 'zephyr_test_cycles', access: 'read' },
    zephyr_getTestCycleResults: { toolset: 'zephyr_test_cycles', access: 'read' },
    zephyr_getEnvironments: { toolset: 'zephyr_test_cycles', access: 'read' },
    zephyr_getTestPlan: { toolset: 'zephyr_test_plans', access: 'read' },
    zephyr_searchTestPlans: { toolset: 'zephyr_test_plans', access: 'read' },
  },
};
