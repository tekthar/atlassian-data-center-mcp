import { z } from 'zod';

const pageId = z.string().regex(/^\d+$/, 'Expected a page id such as 98765');
const diagramId = z.string().regex(/^(att)?\d+$/, 'Expected the diagram\'s attachment id, such as 123456')
  .describe('The diagram\'s attachment id, from gliffy_searchDiagrams');

export const gliffyToolSchemas = {
  searchDiagrams: {
    name: z.string().min(1).optional().describe('Text in the diagram\'s name'),
    spaceKey: z.string().min(1).optional().describe('Only this space, e.g. "ENG"'),
    mine: z.boolean().optional().describe('Only diagrams you created'),
    sort: z.enum(['modified', 'created', 'title']).optional().describe('Newest changed, newest created, or by name; leave out for best match'),
    limit: z.number().int().min(1).max(100).optional().describe('Most diagrams to return (default: the server page size)'),
    start: z.number().int().min(0).optional().describe('Diagrams to skip, for the next page (default 0)'),
  },
  listPageDiagrams: {
    pageId: pageId.describe('The page whose Gliffy diagrams to list'),
  },
  getDiagram: {
    diagramId: diagramId.optional(),
    pageId: pageId.optional().describe('With diagramName instead of diagramId: the page the diagram is attached to'),
    diagramName: z.string().min(1).optional().describe('With pageId: the diagram\'s name, from gliffy_listPageDiagrams'),
    version: z.number().int().min(1).optional().describe('An earlier version; leave out for the latest'),
    format: z.enum(['summary', 'json']).optional()
      .describe('summary (default): the shapes and connections by label. json: Gliffy\'s own diagram document'),
  },
  getDiagramHistory: {
    diagramId,
    limit: z.number().int().min(1).max(100).optional().describe('Most versions to return, newest first (default 20)'),
    start: z.number().int().min(0).optional().describe('Versions to skip, for the next page (default 0)'),
  },
};
