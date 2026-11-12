import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as drawio from './operations.js';
import { drawioToolSchemas as schemas } from './schemas.js';

export function registerDrawioReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('drawio_listIssueDiagrams', {
    description: `List the draw.io diagrams attached to an issue in the ${context.instanceType}, with each one's name, revision and last change. Read one with drawio_getDiagram.`,
    inputSchema: z.object(schemas.listIssueDiagrams),
  }, async ({ issueKey }) => respond(() => drawio.listIssueDiagrams(issueKey), 'Error listing draw.io diagrams on the issue'));

  tools.registerTool('drawio_getDiagram', {
    description: `Read a draw.io diagram attached to an issue in the ${context.instanceType}: its revision and last change, and each of its pages as the shapes it holds and the connections between them, or as draw.io XML with format "xml".`,
    inputSchema: z.object(schemas.getDiagram),
  }, async ({ issueKey, diagramName, format }) =>
    respond(() => drawio.getDiagram(issueKey, diagramName, format), 'Error reading draw.io diagram'));
}
