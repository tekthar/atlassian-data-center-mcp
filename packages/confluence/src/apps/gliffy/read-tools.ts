import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { ConfluenceToolContext } from '../../tools/context.js';
import * as gliffy from './operations.js';
import { gliffyToolSchemas as schemas } from './schemas.js';

export function registerGliffyReadTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool('gliffy_searchDiagrams', {
    description: `Find Gliffy diagrams in the ${context.instanceType} by name, space or creator, with the page each is on and who changed it last. Then open one with gliffy_getDiagram.`,
    inputSchema: z.object(schemas.searchDiagrams),
  }, async (search) => respond(() => gliffy.searchDiagrams(search, context.getPageSize()), 'Error searching Gliffy diagrams'));

  tools.registerTool('gliffy_listPageDiagrams', {
    description: `List the Gliffy diagrams a page in the ${context.instanceType} shows, including ones from other pages, with the name and page to open each with gliffy_getDiagram.`,
    inputSchema: z.object(schemas.listPageDiagrams),
  }, async ({ pageId }) => respond(() => gliffy.listPageDiagrams(pageId), 'Error listing Gliffy diagrams on the page'));

  tools.registerTool('gliffy_getDiagram', {
    description: `Read a Gliffy diagram in the ${context.instanceType}, by its id or by page and name: its version and last change, and the shapes it holds and the connections between them, or Gliffy's JSON with format "json".`,
    inputSchema: z.object(schemas.getDiagram),
  }, async (request) => respond(() => gliffy.getDiagram(request), 'Error reading Gliffy diagram'));

  tools.registerTool('gliffy_getDiagramHistory', {
    description: `List a Gliffy diagram's versions in the ${context.instanceType}, newest first: who saved each and when. Read an earlier one with gliffy_getDiagram and its version.`,
    inputSchema: z.object(schemas.getDiagramHistory),
  }, async ({ diagramId, limit, start }) => respond(() => gliffy.getDiagramHistory(diagramId, limit, start), 'Error fetching Gliffy diagram history'));
}
