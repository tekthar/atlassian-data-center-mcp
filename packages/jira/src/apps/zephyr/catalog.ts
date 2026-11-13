import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Zephyr toolsets are off by default and offered through the tool search once Zephyr is found. Zephyr
 * decides who may see and change each project's tests, with its own project permissions, which Jira's
 * permission list doesn't report; so the writes are left ungated, like Xray's test run update.
 */
export const ZEPHYR_CATALOG: ToolCatalog = {
  toolsets: {
    zephyr_test_cases: { description: 'Zephyr test cases: search them with TQL, read one with its steps and latest result, the ones covering a Jira issue, and create them', default: false },
    zephyr_test_cycles: { description: 'Zephyr test cycles: search, read and create them, read and record their results, and a project\'s environments', default: false },
    zephyr_test_plans: { description: 'Zephyr test plans: search, read and create them', default: false },
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
    zephyr_recordTestResult: { toolset: 'zephyr_test_cycles', access: 'write' },
    zephyr_createTestCase: { toolset: 'zephyr_test_cases', access: 'write' },
    zephyr_createTestCycle: { toolset: 'zephyr_test_cycles', access: 'write' },
    zephyr_createTestPlan: { toolset: 'zephyr_test_plans', access: 'write' },
  },
};
