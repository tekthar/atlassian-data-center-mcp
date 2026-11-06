import { z } from 'zod';
import type { PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as xray from './operations.js';
import { invalid, respond } from './read-tools.js';
import { xrayToolSchemas as schemas } from './schemas.js';

function registerAddTestsTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('xray_addTestsToTestExecution', {
    description: `Add Xray tests to a test execution in the ${context.instanceType}. Each added test gets a test run in the execution.`,
    inputSchema: z.object(schemas.addTestsToTestExecution),
  }, async ({ testExecKey, testKeys }) => respond(
    () => xray.addToIssue('/api/testexec/{key}/test', testExecKey, `Test execution ${testExecKey}`, { add: testKeys }),
    'Error adding tests to Xray test execution',
  ));

  tools.registerTool('xray_addTestsToTestPlan', {
    description: `Add Xray tests to a test plan in the ${context.instanceType}.`,
    inputSchema: z.object(schemas.addTestsToTestPlan),
  }, async ({ testPlanKey, testKeys }) => respond(
    () => xray.addToIssue('/api/testplan/{key}/test', testPlanKey, `Test plan ${testPlanKey}`, { add: testKeys }),
    'Error adding tests to Xray test plan',
  ));

  tools.registerTool('xray_addTestsToTestSet', {
    description: `Add Xray tests to a test set in the ${context.instanceType}.`,
    inputSchema: z.object(schemas.addTestsToTestSet),
  }, async ({ testSetKey, testKeys }) => respond(
    () => xray.addToIssue('/api/testset/{key}/test', testSetKey, `Test set ${testSetKey}`, { add: testKeys }),
    'Error adding tests to Xray test set',
  ));
}

function registerAddExecutionsTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('xray_addTestExecutionsToTestPlan', {
    description: `Add Xray test executions to a test plan in the ${context.instanceType}, optionally adding their tests to the plan too.`,
    inputSchema: z.object(schemas.addTestExecutionsToTestPlan),
  }, async ({ testPlanKey, testExecKeys, addTestsToPlan }) => respond(
    () => xray.addToIssue('/api/testplan/{key}/testexecution', testPlanKey, `Test plan ${testPlanKey}`,
      { add: testExecKeys, addTestsToPlan: addTestsToPlan ?? false }),
    'Error adding test executions to Xray test plan',
  ));
}

function registerUpdateTestRunTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('xray_updateTestRun', {
    description: `Record the result of an Xray test run in the ${context.instanceType}: its status, comment, assignee, linked defects and step results. Only the fields you give change. Read the run with xray_getTestRun first to get its step result ids.`,
    inputSchema: z.object(schemas.updateTestRun),
  }, async ({ id, ...update }) => {
    const changes = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) return invalid('Give at least one of status, comment, assignee, defects or steps.');
    return respond(() => xray.updateTestRun(id, changes), 'Error updating Xray test run');
  });
}

export function registerXrayWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerAddTestsTools(tools, context);
  registerAddExecutionsTool(tools, context);
  registerUpdateTestRunTool(tools, context);
}
