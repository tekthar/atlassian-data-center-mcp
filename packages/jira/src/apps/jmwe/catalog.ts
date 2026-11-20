import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * JMWE toolsets are off by default and offered through the tool search once JMWE is found. These tools only
 * read; JMWE decides who may, and most of its configuration is for Jira administrators. Running a scheduled
 * action, running Groovy and changing configuration are left out.
 */
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
    jmwe_getLogs: { toolset: 'jmwe_logs', access: 'read' },
    jmwe_getLogDetails: { toolset: 'jmwe_logs', access: 'read' },
  },
};
