import type { ToolCatalog } from '@atlassian-dc-mcp/common';

/* draw.io's toolset is off by default and offered through the tool search once draw.io is found. */
export const DRAWIO_CATALOG: ToolCatalog = {
  toolsets: {
    drawio_diagrams: { description: 'draw.io diagrams: find them, list a page\'s diagrams, and read one as shapes and connections or as XML', default: false },
  },
  tools: {
    drawio_searchDiagrams: { toolset: 'drawio_diagrams', access: 'read' },
    drawio_listPageDiagrams: { toolset: 'drawio_diagrams', access: 'read' },
    drawio_getDiagram: { toolset: 'drawio_diagrams', access: 'read' },
  },
};
