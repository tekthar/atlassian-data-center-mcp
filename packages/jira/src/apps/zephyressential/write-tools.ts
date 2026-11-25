import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as cycles from './cycle-write-operations.js';
import * as zephyr from './write-operations.js';
import { zephyrEssentialToolSchemas as schemas } from './schemas.js';

function registerCycleWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('zephyressential_createCycle', {
    description: `Create an empty Zephyr Essential (formerly Zephyr Squad) test cycle in a project's version in the ${context.instanceType}, with an optional build, environment and dates. Add tests to it with zephyressential_addTestsToCycle. Get version ids with jira_getProjectVersions.`,
    inputSchema: z.object(schemas.createCycle),
  }, async (input) => respond(() => cycles.createCycle(input), 'Error creating Zephyr Essential cycle'));

  tools.registerTool('zephyressential_addTestsToCycle', {
    description: `Add tests to a Zephyr Essential test cycle, or one of its folders, in the ${context.instanceType}, ready to run. Says which tests were added and why any were not: invalid, in another project, already there, or not a test. If Zephyr is still adding them after about 10 seconds, check later with zephyressential_searchExecutions.`,
    inputSchema: z.object(schemas.addTestsToCycle),
  }, async (input) => respond(() => cycles.addTestsToCycle(input), 'Error adding tests to Zephyr Essential cycle'));
}

export function registerZephyrEssentialWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerCycleWriteTools(tools, context);
  tools.registerTool('zephyressential_recordResult', {
    description: `Record a Zephyr Essential (formerly Zephyr Squad) test result in the ${context.instanceType}: mark an execution as passed, failed, in progress or blocked, with an optional comment and the defects to link. Find the execution with zephyressential_searchExecutions. Zephyr refuses a change to an execution whose workflow is complete.`,
    inputSchema: z.object(schemas.recordResult),
  }, async ({ executionId, ...result }) => respond(() => zephyr.recordResult(executionId, result), 'Error recording Zephyr Essential result'));

  tools.registerTool('zephyressential_recordStepResult', {
    description: `Record a test step's result in a Zephyr Essential execution in the ${context.instanceType}: mark the step as passed, failed, in progress or blocked, with an optional comment and the defects to link. Get the step result ids with zephyressential_getStepResults.`,
    inputSchema: z.object(schemas.recordStepResult),
  }, async ({ stepResultId, ...result }) =>
    respond(() => zephyr.recordStepResult(stepResultId, result), 'Error recording Zephyr Essential step result'));
}
