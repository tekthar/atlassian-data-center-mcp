import { z } from 'zod';

const zephyrKey = (what: string, example: string) =>
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-[A-Z]?\d+$/, `Expected a Zephyr key such as ${example}`).describe(`Key of the ${what}, e.g. '${example}'`);

const projectKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Expected a project key such as QA').describe('Project key, e.g. \'QA\'');

const issueKeys = z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected Jira issue keys such as QA-12')).optional()
  .describe('Jira issues to link, e.g. ["QA-12"]');

const isoDate = z.string().datetime({ offset: true }).optional();

const folder = z.string().startsWith('/').optional().describe('Folder path, e.g. "/Regression/Login"; it must exist');

const status = (what: string, example: string) => z.string().min(1).optional().describe(`${what} status as the project names it, e.g. "${example}"`);

export const zephyrWriteSchemas = {
  recordTestResult: {
    testCycleKey: zephyrKey('test cycle', 'QA-R4'),
    testCaseKey: zephyrKey('test case in that cycle', 'QA-T12'),
    status: z.string().min(1).describe('Result status as the project names it, e.g. "Pass", "Fail" or "Blocked"'),
    comment: z.string().optional().describe('Comment on the result (HTML allowed)'),
    environment: z.string().optional().describe('Environment name, from zephyr_getEnvironments'),
    executionTime: z.number().int().min(0).optional().describe('How long it took, in milliseconds'),
    executedBy: z.string().optional().describe('Jira user key of who ran it; leave out for you'),
    stepResults: z.array(z.object({
      index: z.number().int().min(0).describe('0-based step index'),
      status: z.string().min(1).describe('Step status, e.g. "Pass"'),
      comment: z.string().optional(),
    })).optional().describe('Each step\'s result'),
    issueLinks: issueKeys.describe('Defects or other Jira issues to link to the result, e.g. ["QA-31"]'),
    replaceLatest: z.boolean().optional().describe('Update the test case\'s latest result in the cycle instead of adding a new one (default false)'),
  },
  createTestCase: {
    projectKey,
    name: z.string().min(1).describe('Test case name'),
    objective: z.string().optional(),
    precondition: z.string().optional(),
    folder,
    status: status('Test case', 'Draft'),
    priority: z.string().optional().describe('Priority as the project names it, e.g. "High"'),
    labels: z.array(z.string()).optional(),
    issueLinks: issueKeys.describe('Jira issues the test case covers, e.g. ["QA-12"]'),
    steps: z.array(z.object({
      description: z.string().min(1).describe('What to do'),
      testData: z.string().optional(),
      expectedResult: z.string().optional(),
    })).optional().describe('Step-by-step script'),
    plainText: z.string().optional().describe('A plain-text script instead of steps'),
  },
  createTestCycle: {
    projectKey,
    name: z.string().min(1).describe('Test cycle name'),
    description: z.string().optional(),
    folder,
    testPlanKey: zephyrKey('test plan to add the cycle to', 'QA-P2').optional(),
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/).optional().describe('Jira issue the cycle is for, e.g. a release story'),
    plannedStartDate: isoDate.describe('ISO 8601, e.g. "2026-11-20T09:00:00Z"'),
    plannedEndDate: isoDate.describe('ISO 8601, e.g. "2026-11-27T17:00:00Z"'),
    testCaseKeys: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-T\d+$/, 'Expected test case keys such as QA-T12')).optional()
      .describe('Test cases to run in the cycle, e.g. ["QA-T12", "QA-T13"]'),
  },
  createTestPlan: {
    projectKey,
    name: z.string().min(1).describe('Test plan name'),
    objective: z.string().optional(),
    folder,
    status: status('Test plan', 'Draft'),
    labels: z.array(z.string()).optional(),
    issueLinks: issueKeys.describe('Jira issues the plan covers, e.g. ["QA-12"]'),
    testCycleKeys: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-R\d+$/, 'Expected test cycle keys such as QA-R4')).optional()
      .describe('Test cycles to add to the plan, e.g. ["QA-R4"]'),
  },
};
