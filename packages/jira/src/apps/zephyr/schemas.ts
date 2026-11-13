import { z } from 'zod';

const key = (what: string, example: string) =>
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-[A-Z]?\d+$/, `Expected a Zephyr key such as ${example}`).describe(`Key of the ${what}, e.g. '${example}'`);

const fields = z.string().optional().describe('Comma-separated fields to return, e.g. "key,name,status"; leave out for all');

const search = (what: string, example: string) => ({
  query: z.string().min(1).describe(`TQL query for ${what}, e.g. ${example}`),
  fields,
  startAt: z.number().int().min(0).optional().describe('Index of the first result (default 0)'),
  maxResults: z.number().int().min(1).max(200).optional().describe('Results per page (default: the server page size)'),
});

export const zephyrToolSchemas = {
  getTestCase: { testCaseKey: key('test case', 'QA-T12'), fields },
  searchTestCases: search('test cases', '\'projectKey = "QA" AND folder = "/Regression" AND status = "Approved"\''),
  getLatestTestResult: { testCaseKey: key('test case', 'QA-T12') },
  getIssueTestCases: {
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as QA-12').describe('Key of the Jira issue, e.g. \'QA-12\''),
    fields,
  },
  getTestCycle: { testCycleKey: key('test cycle', 'QA-R4'), fields },
  searchTestCycles: search('test cycles', '\'projectKey = "QA" AND folder = "/Sprint 12"\''),
  getTestCycleResults: {
    testCycleKey: key('test cycle', 'QA-R4'),
    startAt: z.number().int().min(0).optional().describe('Index of the first result (default 0)'),
    maxResults: z.number().int().min(1).max(200).optional().describe('Results per page (default: the server page size)'),
    onlyLastExecutions: z.boolean().optional().describe('Only each test case\'s latest result (default false)'),
  },
  getEnvironments: {
    projectKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Expected a project key such as QA').describe('Project key, e.g. \'QA\''),
  },
  getTestPlan: { testPlanKey: key('test plan', 'QA-P2'), fields },
  searchTestPlans: search('test plans', '\'projectKey = "QA"\''),
};
