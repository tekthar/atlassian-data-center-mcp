import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as cycles from './cycle-operations.js';
import * as zephyr from './operations.js';
import { zephyrEssentialToolSchemas as schemas } from './schemas.js';

function registerCycleTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('zephyressential_getCycles', {
    description: `List a version's test cycles in Zephyr Essential (formerly Zephyr Squad) in the ${context.instanceType}: each cycle's build, environment and dates, and how many executions it has, how many ran and how they ended. -1 is the ad hoc cycle. Get version ids with jira_getProjectVersions.`,
    inputSchema: z.object(schemas.getCycles),
  }, async ({ projectKey, versionId }) => respond(() => cycles.getCycles(projectKey, versionId), 'Error fetching Zephyr Essential cycles'));

  tools.registerTool('zephyressential_getCycleFolders', {
    description: `List the folders of a Zephyr Essential test cycle in the ${context.instanceType}, with each folder's executions by status.`,
    inputSchema: z.object(schemas.getCycleFolders),
  }, async ({ cycleId, projectKey, versionId }) =>
    respond(() => cycles.getCycleFolders(cycleId, projectKey, versionId), 'Error fetching Zephyr Essential folders'));

  tools.registerTool('zephyressential_getRequirementCoverage', {
    description: `Check test coverage of requirements in Zephyr Essential in the ${context.instanceType}: for each story or other requirement, the tests linked to it, their executions by status, and their defects.`,
    inputSchema: z.object(schemas.getRequirementCoverage),
  }, async ({ issueKeys, versionId }) =>
    respond(() => cycles.getRequirementCoverage(issueKeys, versionId), 'Error fetching Zephyr Essential coverage'));
}

export function registerZephyrEssentialReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerCycleTools(tools, context);
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
