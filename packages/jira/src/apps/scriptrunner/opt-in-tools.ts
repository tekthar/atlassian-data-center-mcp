import { z } from 'zod';
import { isTruthy, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import { invalid, respond } from '../respond.js';
import { registerBehaviourEditTools } from './behaviour-tools.js';
import * as scriptRunner from './opt-in-operations.js';
import { scriptRunnerToolSchemas as schemas } from './schemas.js';

type Env = Record<string, string | undefined>;

/** The setting that turns on each tool that runs or saves code; one setting covers every behaviour change. All are off unless set to true. */
export const SCRIPTRUNNER_OPT_IN_SETTINGS = {
  scriptrunner_runConsoleScript: 'JIRA_SCRIPTRUNNER_CONSOLE_ENABLED',
  scriptrunner_runBuiltInScript: 'JIRA_SCRIPTRUNNER_BUILTIN_RUN_ENABLED',
  scriptrunner_saveScriptFile: 'JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED',
  scriptrunner_saveBehaviour: 'JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED',
  scriptrunner_setBehaviourEnabled: 'JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED',
  scriptrunner_mapBehaviour: 'JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED',
  scriptrunner_unmapBehaviour: 'JIRA_SCRIPTRUNNER_BEHAVIOURS_EDIT_ENABLED',
} as const;

function registerConsoleTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_runConsoleScript', {
    description: `Run Groovy in ScriptRunner's script console on the ${context.instanceType}, with full access to Jira's Java API and the server it runs on. A script can change or delete anything, and nothing undoes it: read the script before running it. Give inline script, or scriptPath to run a file from a script root. Returns the script's last value as output, and its log; a failure returns the exception, the top of its stack trace and the log.`,
    inputSchema: z.object(schemas.runConsoleScript),
  }, async ({ script, scriptPath }) => {
    if ((script === undefined) === (scriptPath === undefined)) return invalid('Give either script or scriptPath, not both.');
    return respond(() => scriptRunner.runConsoleScript(script === undefined ? { scriptPath } : { script }), 'Error running ScriptRunner console script');
  });
}

function registerBuiltInRunTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_runBuiltInScript', {
    description: `Run a ScriptRunner built-in script on the ${context.instanceType}, such as a bulk fix or copying a project, with the given parameter values. Many change Jira data in bulk, and nothing undoes them. Get the parameters with scriptrunner_getBuiltInScriptParams first.`,
    inputSchema: z.object(schemas.runBuiltInScript),
  }, async ({ className, values }) =>
    respond(() => scriptRunner.runBuiltInScript(className, values), 'Error running ScriptRunner built-in script'));
}

function registerFileSaveTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_saveScriptFile', {
    description: `Create a file in a ScriptRunner script root on the ${context.instanceType}, or replace one with overwrite: true. Listeners, jobs and anything else that uses the file run the new code from then on. Read the current file with scriptrunner_getScriptFile before replacing it.`,
    inputSchema: z.object(schemas.saveScriptFile),
  }, async ({ rootPath, filePath, content, overwrite }) =>
    respond(() => scriptRunner.saveScriptFile(rootPath, filePath, content, overwrite ?? false), 'Error saving ScriptRunner script file'));
}

/** Registers the tools that run or save code, each only when its own setting is true. */
export function registerScriptRunnerOptInTools(tools: PolicyRegistrar, context: JiraToolContext, env: Env = process.env): void {
  if (isTruthy(env[SCRIPTRUNNER_OPT_IN_SETTINGS.scriptrunner_runConsoleScript])) registerConsoleTool(tools, context);
  if (isTruthy(env[SCRIPTRUNNER_OPT_IN_SETTINGS.scriptrunner_runBuiltInScript])) registerBuiltInRunTool(tools, context);
  if (isTruthy(env[SCRIPTRUNNER_OPT_IN_SETTINGS.scriptrunner_saveScriptFile])) registerFileSaveTool(tools, context);
  if (isTruthy(env[SCRIPTRUNNER_OPT_IN_SETTINGS.scriptrunner_saveBehaviour])) registerBehaviourEditTools(tools, context);
}
