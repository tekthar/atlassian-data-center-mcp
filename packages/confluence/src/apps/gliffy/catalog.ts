import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/* Gliffy's toolset is off by default and offered through the tool search once Gliffy is found. */
export const GLIFFY_CATALOG: ToolCatalog = {
  toolsets: {
    gliffy_diagrams: { description: 'Gliffy diagrams: find them, list a page\'s diagrams, and read one as shapes and connections or as Gliffy JSON, with its history', default: false },
  },
  tools: {
    gliffy_searchDiagrams: { toolset: 'gliffy_diagrams', access: 'read' },
    gliffy_listPageDiagrams: { toolset: 'gliffy_diagrams', access: 'read' },
    gliffy_getDiagram: { toolset: 'gliffy_diagrams', access: 'read' },
    gliffy_getDiagramHistory: { toolset: 'gliffy_diagrams', access: 'read' },
  },
};
