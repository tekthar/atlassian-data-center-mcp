import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as jmwe from './operations.js';
import { jmweToolSchemas as schemas } from './schemas.js';

function registerWorkflowTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('jmwe_getWorkflowExtensions', {
    description: `List the workflows in the ${context.instanceType} that use JMWE, or get one workflow's JMWE post-functions, conditions and validators by transition.`,
    inputSchema: z.object(schemas.getWorkflowExtensions),
  }, async ({ workflowName }) => respond(() => jmwe.getWorkflowExtensions(workflowName), 'Error fetching JMWE workflow extensions'));

  tools.registerTool('jmwe_getSharedItems', {
    description: `List JMWE's shared actions, conditions, validators or scripts in the ${context.instanceType}, or get one with its configuration and script.`,
    inputSchema: z.object(schemas.getSharedItems),
  }, async ({ kind, id, includeContent }) =>
    respond(() => jmwe.getSharedItems(kind, id, includeContent ?? false), 'Error fetching JMWE shared items'));
}

function registerActionTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('jmwe_getEventBasedActions', {
    description: `List JMWE's event-based actions in the ${context.instanceType}, the actions it runs when issues change, or get one with its configuration.`,
    inputSchema: z.object(schemas.getEventBasedActions),
  }, async ({ actionId }) => respond(() => jmwe.getEventBasedActions(actionId), 'Error fetching JMWE event-based actions'));

  tools.registerTool('jmwe_getScheduledActions', {
    description: `List JMWE's scheduled actions in the ${context.instanceType}, the actions it runs on a schedule, or get one with its configuration.`,
    inputSchema: z.object(schemas.getScheduledActions),
  }, async ({ actionId }) => respond(() => jmwe.getScheduledActions(actionId), 'Error fetching JMWE scheduled actions'));

  tools.registerTool('jmwe_getScheduledActionStatus', {
    description: `Get how JMWE's scheduled actions last ran in the ${context.instanceType}: whether each is running, when it last ran and on how many issues, its last error and its next run.`,
    inputSchema: z.object(schemas.getScheduledActionStatus),
  }, async () => respond(() => jmwe.getScheduledActionStatus(), 'Error fetching JMWE scheduled action status'));
}

function registerLogTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('jmwe_getLogs', {
    description: `Search JMWE's execution logs in the ${context.instanceType}: errors and warnings by default, by issue, extension or user, a page at a time. Use it to find out why a JMWE post-function or action did or didn't run.`,
    inputSchema: z.object(schemas.getLogs),
  }, async (search) => respond(() => jmwe.getLogs(search), 'Error fetching JMWE logs'));

  tools.registerTool('jmwe_getLogDetails', {
    description: `Get every log entry of one JMWE execution in the ${context.instanceType}, by the correlationId jmwe_getLogs gives.`,
    inputSchema: z.object(schemas.getLogDetails),
  }, async ({ correlationId }) => respond(() => jmwe.getLogDetails(correlationId), 'Error fetching JMWE log details'));
}

export function registerJmweReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerWorkflowTools(tools, context);
  registerActionTools(tools, context);
  registerLogTools(tools, context);
}
