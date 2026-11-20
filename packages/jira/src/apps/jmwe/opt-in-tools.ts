import { z } from 'zod';
import { isTruthy, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import { runScheduledAction } from './opt-in-operations.js';

type Env = Record<string, string | undefined>;

/** The setting that turns on each JMWE tool that runs something. Off unless set to true. */
export const JMWE_OPT_IN_SETTINGS = {
  jmwe_runScheduledAction: 'JIRA_JMWE_SCHEDULED_ACTION_RUN_ENABLED',
} as const;

function registerRunTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('jmwe_runScheduledAction', {
    description: `Start a JMWE scheduled action now on the ${context.instanceType}, outside its schedule. It runs in the background over the issues it selects and can change every one of them, and nothing undoes it. Read the action with jmwe_getScheduledActions first, and follow the run with jmwe_getScheduledActionStatus.`,
    inputSchema: z.object({
      actionId: z.string().regex(/^[\w.-]+$/, 'Expected an action id from jmwe_getScheduledActions').describe('The scheduled action\'s id, from jmwe_getScheduledActions'),
    }),
  }, async ({ actionId }) => respond(() => runScheduledAction(actionId), 'Error running JMWE scheduled action'));
}

/** Registers the JMWE tools that run something, each only when its own setting is true. */
export function registerJmweOptInTools(tools: PolicyRegistrar, context: JiraToolContext, env: Env = process.env): void {
  if (isTruthy(env[JMWE_OPT_IN_SETTINGS.jmwe_runScheduledAction])) registerRunTool(tools, context);
}
