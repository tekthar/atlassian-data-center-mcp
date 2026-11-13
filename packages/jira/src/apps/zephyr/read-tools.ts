import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as zephyr from './operations.js';
import { zephyrToolSchemas as schemas } from './schemas.js';

function registerTestCaseTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  const pageSize = () => context.getPageSize();
  tools.registerTool('zephyr_getTestCase', {
    description: `Get a Zephyr test case from the ${context.instanceType}: its objective, precondition, steps or script, status, folder, and linked issues.`,
    inputSchema: z.object(schemas.getTestCase),
  }, async ({ testCaseKey, fields }) => respond(() => zephyr.getTestCase(testCaseKey, fields), 'Error fetching Zephyr test case'));

  tools.registerTool('zephyr_searchTestCases', {
    description: `Search Zephyr test cases in the ${context.instanceType} with TQL, Zephyr's query language, such as projectKey = "QA" AND folder = "/Regression".`,
    inputSchema: z.object(schemas.searchTestCases),
  }, async (search) => respond(() => zephyr.searchTestCases(search, pageSize()), 'Error searching Zephyr test cases'));

  tools.registerTool('zephyr_getLatestTestResult', {
    description: `Get the latest Zephyr result of a test case in the ${context.instanceType}: its status, the test cycle it ran in, who ran it and when, and each step's result.`,
    inputSchema: z.object(schemas.getLatestTestResult),
  }, async ({ testCaseKey }) => respond(() => zephyr.getLatestTestResult(testCaseKey), 'Error fetching the latest Zephyr test result'));

  tools.registerTool('zephyr_getIssueTestCases', {
    description: `List the Zephyr test cases that cover a Jira issue in the ${context.instanceType}, such as a story's tests.`,
    inputSchema: z.object(schemas.getIssueTestCases),
  }, async ({ issueKey, fields }) => respond(() => zephyr.getIssueTestCases(issueKey, fields), 'Error fetching the issue\'s Zephyr test cases'));
}

function registerTestCycleTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  const pageSize = () => context.getPageSize();
  tools.registerTool('zephyr_getTestCycle', {
    description: `Get a Zephyr test cycle from the ${context.instanceType}: its status, folder, planned dates, environment and the test cases it runs. Zephyr's API calls it a test run; keys look like QA-R4.`,
    inputSchema: z.object(schemas.getTestCycle),
  }, async ({ testCycleKey, fields }) => respond(() => zephyr.getTestCycle(testCycleKey, fields), 'Error fetching Zephyr test cycle'));

  tools.registerTool('zephyr_searchTestCycles', {
    description: `Search Zephyr test cycles in the ${context.instanceType} with TQL, such as projectKey = "QA" AND folder = "/Sprint 12".`,
    inputSchema: z.object(schemas.searchTestCycles),
  }, async (search) => respond(() => zephyr.searchTestCycles(search, pageSize()), 'Error searching Zephyr test cycles'));

  tools.registerTool('zephyr_getTestCycleResults', {
    description: `List the execution results of a Zephyr test cycle in the ${context.instanceType}: each test case's status, who ran it, when, and its step results. Set onlyLastExecutions for each test case's latest result only.`,
    inputSchema: z.object(schemas.getTestCycleResults),
  }, async ({ testCycleKey, ...page }) => respond(() => zephyr.getTestCycleResults(testCycleKey, page, pageSize()), 'Error fetching Zephyr test cycle results'));

  tools.registerTool('zephyr_getEnvironments', {
    description: `List the Zephyr test environments of a project in the ${context.instanceType}, such as browsers or platforms that results are recorded against.`,
    inputSchema: z.object(schemas.getEnvironments),
  }, async ({ projectKey }) => respond(() => zephyr.getEnvironments(projectKey), 'Error fetching Zephyr environments'));
}

function registerTestPlanTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('zephyr_getTestPlan', {
    description: `Get a Zephyr test plan from the ${context.instanceType}: its objective, status, folder, linked issues and test cycles.`,
    inputSchema: z.object(schemas.getTestPlan),
  }, async ({ testPlanKey, fields }) => respond(() => zephyr.getTestPlan(testPlanKey, fields), 'Error fetching Zephyr test plan'));

  tools.registerTool('zephyr_searchTestPlans', {
    description: `Search Zephyr test plans in the ${context.instanceType} with TQL, such as projectKey = "QA".`,
    inputSchema: z.object(schemas.searchTestPlans),
  }, async (search) => respond(() => zephyr.searchTestPlans(search, context.getPageSize()), 'Error searching Zephyr test plans'));
}

export function registerZephyrReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerTestCaseTools(tools, context);
  registerTestCycleTools(tools, context);
  registerTestPlanTools(tools, context);
}
