import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as zephyr from './operations.js';
import { zephyrEssentialToolSchemas as schemas } from './schemas.js';

export function registerZephyrEssentialReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('zephyressential_searchExecutions', {
    description: `Find test executions in Zephyr Essential (formerly Zephyr Squad) in the ${context.instanceType} with ZQL, by project, version, cycle, folder, status, assignee or test: each one's test, cycle, status, who ran it and when, and its defects.`,
    inputSchema: z.object(schemas.searchExecutions),
  }, async ({ zql, offset, limit }) => respond(() => zephyr.searchExecutions(zql, offset, limit), 'Error searching Zephyr Essential executions'));

  tools.registerTool('zephyressential_getTestSteps', {
    description: `Get a Zephyr Essential test's steps in the ${context.instanceType}, in order: each step, its test data and the expected result.`,
    inputSchema: z.object(schemas.getTestSteps),
  }, async ({ issueKey }) => respond(() => zephyr.getTestSteps(issueKey), 'Error fetching Zephyr Essential test steps'));

  tools.registerTool('zephyressential_getStepResults', {
    description: `Get each step's result in one Zephyr Essential execution in the ${context.instanceType}: its status, comment and defects. Find the execution with zephyressential_searchExecutions.`,
    inputSchema: z.object(schemas.getStepResults),
  }, async ({ executionId }) => respond(() => zephyr.getStepResults(executionId), 'Error fetching Zephyr Essential step results'));
}
