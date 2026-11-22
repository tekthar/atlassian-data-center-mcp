import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Structure toolsets are off by default and offered through the tool search once Structure is found. Structure
 * decides what each user may see and change: it returns only the structures shared with them, marks the rows they
 * can't read, and lets only those it gives edit access change a structure, so its writes name no Jira permission.
 * Removing rows is destructive: the rows under them go too, and in a generated structure it can delete issue links.
 */
export const STRUCTURE_CATALOG: ToolCatalog = {
  toolsets: {
    structure_hierarchies: {
      description: 'Structure by Tempo: structures, the hierarchies of issues and folders teams plan in, their rows with issue values, who changed them, the structures an issue is in, creating structures and folders, and adding, moving and removing rows',
      default: false,
    },
  },
  tools: {
    structure_getStructures: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getStructure: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getStructureRows: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getIssueStructures: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getStructureHistory: { toolset: 'structure_hierarchies', access: 'read' },
    structure_addIssues: { toolset: 'structure_hierarchies', access: 'write' },
    structure_moveRows: { toolset: 'structure_hierarchies', access: 'write' },
    structure_createStructure: { toolset: 'structure_hierarchies', access: 'write' },
    structure_addFolder: { toolset: 'structure_hierarchies', access: 'write' },
    structure_removeRows: { toolset: 'structure_hierarchies', access: 'destructive' },
  },
};
