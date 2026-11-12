import { z } from 'zod';

const issueKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as ENG-12')
  .describe('Key of the issue the diagram is attached to, e.g. \'ENG-12\'');

export const drawioToolSchemas = {
  listIssueDiagrams: { issueKey },
  getDiagram: {
    issueKey,
    diagramName: z.string().min(1).describe('The diagram\'s name, from drawio_listIssueDiagrams'),
    format: z.enum(['summary', 'xml']).optional()
      .describe('summary (default): each page\'s shapes and connections by label. xml: each page\'s draw.io model'),
  },
};
