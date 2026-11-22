import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as structure from './write-operations.js';
import { structureWriteSchemas as schemas } from './write-schemas.js';

const EFFECTS = 'In a structure built by generators, a change can also change issues, such as a grouping field, the rank, or a link a generator made; the result lists what Structure did.';

export function registerStructureWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('structure_addIssues', {
    description: `Add Jira issues to a structure (Structure by Tempo) in the ${context.instanceType}, under a row or at the top level, after a row or last. Returns each new row's rowId. Find the rows with structure_getStructureRows. ${EFFECTS}`,
    inputSchema: z.object(schemas.addIssues),
  }, async ({ structureId, issueKeys, underRowId, afterRowId }) =>
    respond(() => structure.addIssues(structureId, issueKeys, underRowId, afterRowId), 'Error adding issues to the structure'));

  tools.registerTool('structure_moveRows', {
    description: `Move rows of a structure (Structure by Tempo) in the ${context.instanceType}, each with the rows under it, under another row or to the top level, after a row or last. ${EFFECTS}`,
    inputSchema: z.object(schemas.moveRows),
  }, async ({ structureId, rowIds, underRowId, afterRowId }) =>
    respond(() => structure.moveRows(structureId, rowIds, underRowId, afterRowId), 'Error moving structure rows'));

  tools.registerTool('structure_removeRows', {
    description: `Remove rows from a structure (Structure by Tempo) in the ${context.instanceType}, with every row under them. The issues stay in Jira. ${EFFECTS}`,
    inputSchema: z.object(schemas.removeRows),
  }, async ({ structureId, rowIds }) => respond(() => structure.removeRows(structureId, rowIds), 'Error removing structure rows'));
}
