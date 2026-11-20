import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * JMWE toolsets are off by default and offered through the tool search once JMWE is found. The read tools are
 * for whoever JMWE lets read; most of its configuration is for Jira administrators. Running a scheduled action
 * follows ScriptRunner's rule: destructive, for administrators, registered only when its own setting is true,
 * listed only when TOOLSETS names its toolset, and never offered by the tool search or jira_runCode. Running
 * Groovy and changing configuration are left out.
 */
const ADMINISTRATORS = ['ADMINISTER', 'SYSTEM_ADMIN'];

export const JMWE_CATALOG: ToolCatalog = {
  toolsets: {
    jmwe_workflows: { description: 'JMWE workflow extensions: the post-functions, conditions and validators JMWE adds to workflows, and its shared actions, conditions, validators and scripts', default: false },
    jmwe_actions: { description: 'JMWE event-based and scheduled actions, and how the scheduled ones last ran', default: false },
    jmwe_logs: { description: 'JMWE execution logs: the errors and warnings of its workflow extensions and actions, by issue or extension', default: false },
  },
  tools: {
    jmwe_getWorkflowExtensions: { toolset: 'jmwe_workflows', access: 'read' },
    jmwe_getSharedItems: { toolset: 'jmwe_workflows', access: 'read' },
    jmwe_getEventBasedActions: { toolset: 'jmwe_actions', access: 'read' },
    jmwe_getScheduledActions: { toolset: 'jmwe_actions', access: 'read' },
    jmwe_getScheduledActionStatus: { toolset: 'jmwe_actions', access: 'read' },
    jmwe_runScheduledAction: { toolset: 'jmwe_actions', access: 'destructive', anyOfPermissions: ADMINISTRATORS },
    jmwe_getLogs: { toolset: 'jmwe_logs', access: 'read' },
    jmwe_getLogDetails: { toolset: 'jmwe_logs', access: 'read' },
  },
};
