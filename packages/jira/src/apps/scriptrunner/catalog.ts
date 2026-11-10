import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * ScriptRunner toolsets are off by default and offered through the tool search. These tools only
 * read. ScriptRunner itself decides who may use them: most routes are for Jira administrators, or
 * for the users its own permission settings allow, and it answers anyone else with a 403.
 */
export const SCRIPTRUNNER_CATALOG: ToolCatalog = {
  toolsets: {
    scriptrunner_script_editor: { description: 'ScriptRunner script editor: list the script roots and their files, and read a file', default: false },
    scriptrunner_builtin_scripts: { description: 'ScriptRunner built-in scripts: what each does and the parameters it asks for', default: false },
    scriptrunner_features: { description: 'ScriptRunner features configured in Jira: script listeners, and the JQL functions it adds', default: false },
    scriptrunner_behaviours: { description: 'ScriptRunner behaviours: their fields, scripts and the projects and issue types they apply to', default: false },
  },
  tools: {
    scriptrunner_listScriptFiles: { toolset: 'scriptrunner_script_editor', access: 'read' },
    scriptrunner_getScriptFile: { toolset: 'scriptrunner_script_editor', access: 'read' },
    scriptrunner_listBuiltInScripts: { toolset: 'scriptrunner_builtin_scripts', access: 'read' },
    scriptrunner_getBuiltInScriptParams: { toolset: 'scriptrunner_builtin_scripts', access: 'read' },
    scriptrunner_getListeners: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getJqlFunctions: { toolset: 'scriptrunner_features', access: 'read' },
    scriptrunner_getBehaviours: { toolset: 'scriptrunner_behaviours', access: 'read' },
  },
};
