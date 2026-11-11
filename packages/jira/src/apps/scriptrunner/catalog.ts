import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * ScriptRunner toolsets are off by default and offered through the tool search. ScriptRunner itself
 * decides who may use its routes: mostly Jira administrators, or the users its own permission
 * settings allow, and it answers anyone else with a 403. The read tools are left ungated, like every
 * read tool. Running a script, saving a script file or changing a behaviour can change anything on
 * the instance or everyone's screens, so those tools are destructive: registered only when their own setting turns them on, listed only when
 * TOOLSETS names their toolset, never offered by the tool search or jira_runCode, and hidden from
 * anyone who isn't a Jira administrator.
 */
const ADMINISTRATORS = ['ADMINISTER', 'SYSTEM_ADMIN'];

export const SCRIPTRUNNER_CATALOG: ToolCatalog = {
  toolsets: {
    scriptrunner_script_editor: { description: 'ScriptRunner script editor: list the script roots and their files, and read a file', default: false },
    scriptrunner_builtin_scripts: { description: 'ScriptRunner built-in scripts: what each does and the parameters it asks for', default: false },
    scriptrunner_features: { description: 'ScriptRunner features configured in Jira: script listeners, scripted fields, scheduled jobs, REST endpoints, UI fragments, workflow functions, and the JQL functions it adds', default: false },
    scriptrunner_behaviours: { description: 'ScriptRunner behaviours: their fields, scripts and the projects and issue types they apply to', default: false },
    scriptrunner_console: { description: 'ScriptRunner script console: run Groovy on the Jira server (opt-in)', default: false },
  },
  tools: {
    scriptrunner_listScriptFiles: { toolset: 'scriptrunner_script_editor', access: 'read' },
    scriptrunner_getScriptFile: { toolset: 'scriptrunner_script_editor', access: 'read' },
    scriptrunner_listBuiltInScripts: { toolset: 'scriptrunner_builtin_scripts', access: 'read' },
    scriptrunner_getBuiltInScriptParams: { toolset: 'scriptrunner_builtin_scripts', access: 'read' },
    scriptrunner_getListeners: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getJqlFunctions: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getScriptedFields: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getScheduledJobs: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getRestEndpoints: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getFragments: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getWorkflowFunctions: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getBehaviours: { toolset: 'scriptrunner_behaviours', access: 'read' },
    scriptrunner_runConsoleScript: { toolset: 'scriptrunner_console', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    scriptrunner_runBuiltInScript: { toolset: 'scriptrunner_builtin_scripts', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    scriptrunner_saveScriptFile: { toolset: 'scriptrunner_script_editor', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    scriptrunner_saveBehaviour: { toolset: 'scriptrunner_behaviours', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    scriptrunner_setBehaviourEnabled: { toolset: 'scriptrunner_behaviours', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    scriptrunner_mapBehaviour: { toolset: 'scriptrunner_behaviours', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    scriptrunner_unmapBehaviour: { toolset: 'scriptrunner_behaviours', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
  },
};
