import { z } from 'zod';
import { invalidInput, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as zephyr from './write-operations.js';
import { zephyrWriteSchemas as schemas } from './write-schemas.js';

function registerResultTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('zephyr_recordTestResult', {
    description: `Record a Zephyr test result in the ${context.instanceType}: a test case's status in a test cycle, with an optional comment, environment, time, step results and linked defects. Each call adds an execution; replaceLatest updates the latest one instead. Statuses are the project's, such as Pass or Fail.`,
    inputSchema: z.object(schemas.recordTestResult),
  }, async ({ testCycleKey, testCaseKey, replaceLatest, ...result }) =>
    respond(() => zephyr.recordTestResult(testCycleKey, testCaseKey, result, replaceLatest ?? false), 'Error recording Zephyr test result'));
}

function registerCreateTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('zephyr_createTestCase', {
    description: `Create a Zephyr test case in the ${context.instanceType}, with steps or a plain-text script, and links to the Jira issues it covers. Returns its key.`,
    inputSchema: z.object(schemas.createTestCase),
  }, async (input) => {
    if (input.steps?.length && input.plainText) return invalidInput('Give steps or plainText, not both.');
    return respond(() => zephyr.createTestCase(input), 'Error creating Zephyr test case');
  });

  tools.registerTool('zephyr_createTestCycle', {
    description: `Create a Zephyr test cycle in the ${context.instanceType} with the test cases to run, optionally in a test plan and with planned dates. Returns its key; record results with zephyr_recordTestResult.`,
    inputSchema: z.object(schemas.createTestCycle),
  }, async (input) => respond(() => zephyr.createTestCycle(input), 'Error creating Zephyr test cycle'));

  tools.registerTool('zephyr_createTestPlan', {
    description: `Create a Zephyr test plan in the ${context.instanceType}, with its test cycles and the Jira issues it covers. Returns its key.`,
    inputSchema: z.object(schemas.createTestPlan),
  }, async (input) => respond(() => zephyr.createTestPlan(input), 'Error creating Zephyr test plan'));
}

export function registerZephyrWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerResultTool(tools, context);
  registerCreateTools(tools, context);
}
