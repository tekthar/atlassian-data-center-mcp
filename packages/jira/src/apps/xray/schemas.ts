import { z } from 'zod';

const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

const issueKey = (what: string) =>
  z.string().regex(ISSUE_KEY, 'Expected a Jira issue key such as QA-12').describe(`Issue key of the ${what}, e.g. 'QA-12'`);

const issueKeys = (what: string) =>
  z.array(z.string().regex(ISSUE_KEY, 'Expected Jira issue keys such as QA-12')).min(1).max(100)
    .describe(`Issue keys of the ${what}, e.g. ["QA-12", "QA-13"]`);

const testRunId = z.number().int().positive().describe('Test run id, from xray_getTestExecutionTests, xray_searchTestRuns or xray_getTestRun');

const paging = {
  page: z.number().int().min(1).optional().describe('1-based page number (default 1)'),
  limit: z.number().int().min(1).max(100).optional().describe('Results per page (default: the server page size)'),
};

const collection = (what: string) => z.object({
  add: z.array(z.string().regex(ISSUE_KEY)).optional().describe(`${what} keys to add`),
  remove: z.array(z.string().regex(ISSUE_KEY)).optional().describe(`${what} keys to remove`),
});

const stepResult = z.object({
  id: z.number().int().positive().describe('Step result id, from the test run\'s steps'),
  status: z.string().min(1).optional().describe('Step status, e.g. PASS or FAIL; xray_getTestStatuses lists them'),
  comment: z.string().optional().describe('Step comment (Jira wiki markup)'),
  actualResult: z.string().optional().describe('What actually happened at this step'),
  defects: collection('Defect issue').optional(),
});

export const xrayToolSchemas = {
  getTests: {
    keys: issueKeys('tests').optional(),
    jql: z.string().min(1).optional().describe("JQL selecting tests, e.g. 'project = QA AND issuetype = Test AND labels = smoke'"),
  },
  getTestSteps: {
    testKey: issueKey('test'),
    testVersion: z.number().int().positive().optional().describe('Test version to read; omit for the current one'),
  },
  getTestRelations: { testKey: issueKey('test') },
  getTestStatuses: {},
  getTestExecutionTests: {
    testExecKey: issueKey('test execution'),
    detailed: z.boolean().optional().describe('Include each test run\'s details, such as its executor and dates (default false)'),
    ...paging,
  },
  addTestsToTestExecution: { testExecKey: issueKey('test execution'), testKeys: issueKeys('tests to add') },
  getTestPlanTests: { testPlanKey: issueKey('test plan'), ...paging },
  getTestPlanExecutions: { testPlanKey: issueKey('test plan') },
  addTestsToTestPlan: { testPlanKey: issueKey('test plan'), testKeys: issueKeys('tests to add') },
  addTestExecutionsToTestPlan: {
    testPlanKey: issueKey('test plan'),
    testExecKeys: issueKeys('test executions to add'),
    addTestsToPlan: z.boolean().optional().describe("Also add the executions' tests to the plan (default false)"),
  },
  getTestSetTests: { testSetKey: issueKey('test set'), ...paging },
  addTestsToTestSet: { testSetKey: issueKey('test set'), testKeys: issueKeys('tests to add') },
  getTestRun: {
    id: testRunId.optional(),
    testExecKey: issueKey('test execution').optional(),
    testKey: issueKey('test').optional(),
  },
  searchTestRuns: {
    testExecKey: issueKey('test execution').optional(),
    testKey: issueKey('test').optional(),
    testPlanKey: issueKey('test plan').optional(),
    savedFilterId: z.number().int().positive().optional().describe('Id of a saved Jira filter selecting test executions'),
    ...paging,
  },
  updateTestRun: {
    id: testRunId,
    status: z.string().min(1).optional().describe('New status, e.g. PASS, FAIL, EXECUTING or TODO; xray_getTestStatuses lists them'),
    comment: z.string().optional().describe('Comment on the run (Jira wiki markup); replaces the current one'),
    assignee: z.string().min(1).optional().describe('Username to assign the run to'),
    defects: collection('Defect issue').optional(),
    steps: z.array(stepResult).optional().describe('Results of individual steps'),
  },
};
