import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as zephyr from './write-operations.js';
import { zephyrEssentialToolSchemas as schemas } from './schemas.js';

export function registerZephyrEssentialWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
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
