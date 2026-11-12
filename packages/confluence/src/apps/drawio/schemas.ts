import { z } from 'zod';

const pageId = z.string().regex(/^\d+$/, 'Expected a page id such as 98765').describe('The id of the page the diagram is attached to');

export const drawioToolSchemas = {
  searchDiagrams: {
    name: z.string().min(1).optional().describe('Text in the diagram\'s name'),
    spaceKeys: z.array(z.string().min(1)).optional().describe('Only these spaces, e.g. ["ENG", "OPS"]'),
    mine: z.boolean().optional().describe('Only diagrams you changed last'),
    limit: z.number().int().min(1).max(100).optional().describe('Most diagrams to return (default: the server page size)'),
  },
  listPageDiagrams: {
    pageId: pageId.describe('The page whose diagrams to list'),
  },
  getDiagram: {
    pageId,
    diagramName: z.string().min(1).describe('The diagram\'s name, from drawio_listPageDiagrams or drawio_searchDiagrams'),
    revision: z.number().int().min(1).optional().describe('An earlier revision; leave out for the latest'),
    format: z.enum(['summary', 'xml']).optional()
      .describe('summary (default): each page\'s shapes and connections by label. xml: each page\'s draw.io model'),
  },
};
