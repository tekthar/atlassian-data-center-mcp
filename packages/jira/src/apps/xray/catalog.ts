import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Xray toolsets are off by default and offered through the tool search, so an instance with
 * Xray pays for these schemas only when a test question comes up. Adding tests to a test
 * execution, plan or set edits that issue, so it needs Edit Issues. Updating a test run is left
 * ungated: Xray's own settings decide who may execute tests, and Jira can't report them.
 * Removing tests is left out for now: removing a test from an execution deletes its test run.
 */
export const XRAY_CATALOG: ToolCatalog = {
  toolsets: {
    xray_tests: { description: 'Xray tests: steps, the executions, plans, sets and preconditions they belong to, and test statuses', default: false },
    xray_test_executions: { description: 'Xray test executions: their tests and run statuses, and adding tests', default: false },
    xray_test_plans: { description: 'Xray test plans: their tests and test executions, and adding either', default: false },
    xray_test_sets: { description: 'Xray test sets: their tests, and adding tests', default: false },
    xray_test_runs: { description: 'Xray test runs: read and search results, and record a status, comment, defects or step results', default: false },
  },
  tools: {
    xray_getTests: { toolset: 'xray_tests', access: 'read' },
    xray_getTestSteps: { toolset: 'xray_tests', access: 'read' },
    xray_getTestRelations: { toolset: 'xray_tests', access: 'read' },
    xray_getTestStatuses: { toolset: 'xray_tests', access: 'read' },
    xray_getTestExecutionTests: { toolset: 'xray_test_executions', access: 'read' },
    xray_addTestsToTestExecution: { toolset: 'xray_test_executions', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
    xray_getTestPlanTests: { toolset: 'xray_test_plans', access: 'read' },
    xray_getTestPlanExecutions: { toolset: 'xray_test_plans', access: 'read' },
    xray_addTestsToTestPlan: { toolset: 'xray_test_plans', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
    xray_addTestExecutionsToTestPlan: { toolset: 'xray_test_plans', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
    xray_getTestSetTests: { toolset: 'xray_test_sets', access: 'read' },
    xray_addTestsToTestSet: { toolset: 'xray_test_sets', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
    xray_getTestRun: { toolset: 'xray_test_runs', access: 'read' },
    xray_searchTestRuns: { toolset: 'xray_test_runs', access: 'read' },
    xray_updateTestRun: { toolset: 'xray_test_runs', access: 'write' },
  },
};
