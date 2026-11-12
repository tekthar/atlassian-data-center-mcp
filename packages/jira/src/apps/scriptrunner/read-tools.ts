import { z } from 'zod';
import { type PolicyRegistrar, respond } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as scriptRunner from './operations.js';
import { scriptRunnerToolSchemas as schemas } from './schemas.js';

function registerScriptEditorTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_listScriptFiles', {
    description: `List ScriptRunner's script roots in the ${context.instanceType}, the folders its script editor shows, with the path of every file in each. Read a file with scriptrunner_getScriptFile.`,
    inputSchema: z.object(schemas.listScriptFiles),
  }, async ({ groovyOnly, includeDirectories }) =>
    respond(() => scriptRunner.listScriptFiles(groovyOnly ?? false, includeDirectories ?? false), 'Error listing ScriptRunner script files'));

  tools.registerTool('scriptrunner_getScriptFile', {
    description: `Read a file from ScriptRunner's script editor in the ${context.instanceType}: a Groovy script, class or other file in a script root. Find it with scriptrunner_listScriptFiles first.`,
    inputSchema: z.object(schemas.getScriptFile),
  }, async ({ rootPath, filePath }) =>
    respond(() => scriptRunner.getScriptFile(rootPath, filePath), 'Error reading ScriptRunner script file'));
}

function registerBuiltInScriptTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_listBuiltInScripts', {
    description: `List ScriptRunner's built-in scripts in the ${context.instanceType}, such as bulk fixes, copying a project or listing scheduled jobs, with what each does and its className. Get the parameters one asks for with scriptrunner_getBuiltInScriptParams.`,
    inputSchema: z.object(schemas.listBuiltInScripts),
  }, async ({ search }) => respond(() => scriptRunner.listBuiltInScripts(search), 'Error listing ScriptRunner built-in scripts'));

  tools.registerTool('scriptrunner_getBuiltInScriptParams', {
    description: `Get the parameters a ScriptRunner built-in script asks for in the ${context.instanceType}: each field's name, label, type, choices and help. Some fields appear only after others are set, so pass the values chosen so far. This runs nothing.`,
    inputSchema: z.object(schemas.getBuiltInScriptParams),
  }, async ({ className, values }) =>
    respond(() => scriptRunner.getBuiltInScriptParams(className, values ?? {}), 'Error fetching ScriptRunner built-in script parameters'));
}

function registerFeatureTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_getListeners', {
    description: `List the script listeners configured in ScriptRunner in the ${context.instanceType}: the events and projects each reacts to, and its inline script or script file.`,
    inputSchema: z.object(schemas.getListeners),
  }, async () => respond(() => scriptRunner.getListeners(), 'Error fetching ScriptRunner listeners'));

  tools.registerTool('scriptrunner_getJqlFunctions', {
    description: `List the JQL functions ScriptRunner adds to the ${context.instanceType}, with each one's documentation, for use as \`issueFunction in <function>(...)\` in JQL.`,
    inputSchema: z.object(schemas.getJqlFunctions),
  }, async () => respond(() => scriptRunner.getJqlFunctions(), 'Error fetching ScriptRunner JQL functions'));
}

function registerConfiguredFeatureTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_getScriptedFields', {
    description: `List ScriptRunner's scripted fields in the ${context.instanceType}, or get one by id: its custom field, template and script.`,
    inputSchema: z.object(schemas.getScriptedFields),
  }, async ({ id }) => respond(() => scriptRunner.getScriptedFields(id), 'Error fetching ScriptRunner scripted fields'));

  tools.registerTool('scriptrunner_getScheduledJobs', {
    description: `List ScriptRunner's scheduled jobs in the ${context.instanceType}, or get one by id: what it runs, as which user, and its schedule.`,
    inputSchema: z.object(schemas.getScheduledJobs),
  }, async ({ id }) => respond(() => scriptRunner.getScheduledJobs(id), 'Error fetching ScriptRunner scheduled jobs'));

  tools.registerTool('scriptrunner_getRestEndpoints', {
    description: `List the custom REST endpoints ScriptRunner serves in the ${context.instanceType}, or get one by id, with its script. They answer under /rest/scriptrunner/latest/custom/.`,
    inputSchema: z.object(schemas.getRestEndpoints),
  }, async ({ id }) => respond(() => scriptRunner.getRestEndpoints(id), 'Error fetching ScriptRunner REST endpoints'));

  tools.registerTool('scriptrunner_getFragments', {
    description: `List ScriptRunner's UI fragments in the ${context.instanceType}, such as web items, panels and resources, or get one by id with its conditions and script.`,
    inputSchema: z.object(schemas.getFragments),
  }, async ({ id }) => respond(() => scriptRunner.getFragments(id), 'Error fetching ScriptRunner fragments'));

  tools.registerTool('scriptrunner_getWorkflowFunctions', {
    description: `List the ScriptRunner conditions, validators and post functions in the ${context.instanceType}'s workflows, or in one workflow by name, with the transitions they run on.`,
    inputSchema: z.object(schemas.getWorkflowFunctions),
  }, async ({ workflowName }) => respond(() => scriptRunner.getWorkflowFunctions(workflowName), 'Error fetching ScriptRunner workflow functions'));
}

function registerBehaviourTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('scriptrunner_getBehaviours', {
    description: `List ScriptRunner behaviours in the ${context.instanceType}, or get one by id with its fields, initialiser and field scripts, and the projects and issue types it is mapped to.`,
    inputSchema: z.object(schemas.getBehaviours),
  }, async ({ id }) => respond(() => scriptRunner.getBehaviours(id), 'Error fetching ScriptRunner behaviours'));
}

export function registerScriptRunnerReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerScriptEditorTools(tools, context);
  registerBuiltInScriptTools(tools, context);
  registerFeatureTools(tools, context);
  registerConfiguredFeatureTools(tools, context);
  registerBehaviourTools(tools, context);
}
