import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/*
 * Structure toolsets are off by default and offered through the tool search once Structure is found. Structure
 * decides what each user may see: it returns only the structures shared with them, and marks the rows they can't
 * read.
 */
export const STRUCTURE_CATALOG: ToolCatalog = {
  toolsets: {
    structure_hierarchies: {
      description: 'Structure by Tempo: structures, the hierarchies of issues and folders teams plan in, their rows with issue values, and the structures an issue is in',
      default: false,
    },
  },
  tools: {
    structure_getStructures: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getStructure: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getStructureRows: { toolset: 'structure_hierarchies', access: 'read' },
    structure_getIssueStructures: { toolset: 'structure_hierarchies', access: 'read' },
  },
};
