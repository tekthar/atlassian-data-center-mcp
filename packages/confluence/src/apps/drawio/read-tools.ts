import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { ConfluenceToolContext } from '../../tools/context.js';
import * as drawio from './operations.js';
import { drawioToolSchemas as schemas } from './schemas.js';

export function registerDrawioReadTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool('drawio_searchDiagrams', {
    description: `Find draw.io diagrams in the ${context.instanceType} by name, space or who changed them last, newest first, with the page each is on. Read one with drawio_getDiagram.`,
    inputSchema: z.object(schemas.searchDiagrams),
  }, async (search) => respond(() => drawio.searchDiagrams(search, context.getPageSize()), 'Error searching draw.io diagrams'));

  tools.registerTool('drawio_listPageDiagrams', {
    description: `List the draw.io diagrams a page in the ${context.instanceType} shows, including ones embedded from other pages, with the name and page to read each with drawio_getDiagram.`,
    inputSchema: z.object(schemas.listPageDiagrams),
  }, async ({ pageId }) => respond(() => drawio.listPageDiagrams(pageId), 'Error listing draw.io diagrams on the page'));

  tools.registerTool('drawio_getDiagram', {
    description: `Read a draw.io diagram from a page in the ${context.instanceType}: its revision and last change, and each of its pages as the shapes it holds and the connections between them, or as draw.io XML with format "xml".`,
    inputSchema: z.object(schemas.getDiagram),
  }, async (request) => respond(() => drawio.getDiagram(request), 'Error reading draw.io diagram'));
}
