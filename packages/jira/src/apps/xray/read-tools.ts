import { z } from 'zod';
import type { PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import { invalid, respond } from '../respond.js';
import * as xray from './operations.js';
import { xrayToolSchemas as schemas } from './schemas.js';

function registerTestTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('xray_getTests', {
    description: `Get Xray tests from the ${context.instanceType} by issue key or JQL, with each test's type, steps or definition, and preconditions. Give keys or jql.`,
    inputSchema: z.object(schemas.getTests),
  }, async ({ keys, jql }) => {
    if (!keys?.length && !jql) return invalid('Give keys or jql to choose the tests.');
    return respond(() => xray.getTests(keys, jql), 'Error fetching Xray tests');
  });

  tools.registerTool('xray_getTestSteps', {
    description: `Get the steps of an Xray manual test in the ${context.instanceType}: each step's action, data, expected result and attachments.`,
    inputSchema: z.object(schemas.getTestSteps),
  }, async ({ testKey, testVersion }) => respond(() => xray.getTestSteps(testKey, testVersion), 'Error fetching Xray test steps'));

  tools.registerTool('xray_getTestRelations', {
    description: `List the Xray test executions, test plans, test sets and preconditions an Xray test belongs to in the ${context.instanceType}.`,
    inputSchema: z.object(schemas.getTestRelations),
  }, async ({ testKey }) => respond(() => xray.getTestRelations(testKey), 'Error fetching Xray test relations'));

  tools.registerTool('xray_getTestStatuses', {
    description: `List the Xray test run and test step statuses configured in the ${context.instanceType}, such as PASS, FAIL, TODO and EXECUTING. Use these names with xray_updateTestRun.`,
    inputSchema: z.object(schemas.getTestStatuses),
  }, async () => respond(() => xray.getTestStatuses(), 'Error fetching Xray test statuses'));
}

function registerContainerReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  const pageSize = () => context.getPageSize();
  tools.registerTool('xray_getTestExecutionTests', {
    description: `List the tests of an Xray test execution in the ${context.instanceType}, with each test run's id and status. Pass a test run id to xray_getTestRun or xray_updateTestRun.`,
    inputSchema: z.object(schemas.getTestExecutionTests),
  }, async ({ testExecKey, detailed, ...paging }) =>
    respond(() => xray.getTestExecutionTests(testExecKey, detailed, paging, pageSize()), 'Error fetching Xray test execution tests'));

  tools.registerTool('xray_getTestPlanTests', {
    description: `List the tests of an Xray test plan in the ${context.instanceType}, with each test's latest status across the plan's executions.`,
    inputSchema: z.object(schemas.getTestPlanTests),
  }, async ({ testPlanKey, ...paging }) =>
    respond(() => xray.getTestPlanTests(testPlanKey, paging, pageSize()), 'Error fetching Xray test plan tests'));

  tools.registerTool('xray_getTestPlanExecutions', {
    description: `List the Xray test executions of a test plan in the ${context.instanceType}.`,
    inputSchema: z.object(schemas.getTestPlanExecutions),
  }, async ({ testPlanKey }) => respond(() => xray.getTestPlanExecutions(testPlanKey), 'Error fetching Xray test plan executions'));

  tools.registerTool('xray_getTestSetTests', {
    description: `List the tests of an Xray test set in the ${context.instanceType}.`,
    inputSchema: z.object(schemas.getTestSetTests),
  }, async ({ testSetKey, ...paging }) =>
    respond(() => xray.getTestSetTests(testSetKey, paging, pageSize()), 'Error fetching Xray test set tests'));
}

function registerTestRunReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('xray_getTestRun', {
    description: `Get one Xray test run from the ${context.instanceType}, by id or by its test execution and test: status, comment, defects, evidence and step results.`,
    inputSchema: z.object(schemas.getTestRun),
  }, async (input) => {
    if (input.id === undefined && !(input.testExecKey && input.testKey)) {
      return invalid('Give the test run id, or both testExecKey and testKey.');
    }
    return respond(() => xray.getTestRun(input), 'Error fetching Xray test run');
  });

  tools.registerTool('xray_searchTestRuns', {
    description: `Search Xray test runs in the ${context.instanceType} by test execution, test, test plan or saved filter, with paging. Give at least one of them.`,
    inputSchema: z.object(schemas.searchTestRuns),
  }, async (search) => {
    if (!search.testExecKey && !search.testKey && !search.testPlanKey && search.savedFilterId === undefined) {
      return invalid('Give testExecKey, testKey, testPlanKey or savedFilterId to choose the test runs.');
    }
    return respond(() => xray.searchTestRuns(search, context.getPageSize()), 'Error searching Xray test runs');
  });
}

export function registerXrayReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerTestTools(tools, context);
  registerContainerReadTools(tools, context);
  registerTestRunReadTools(tools, context);
}
