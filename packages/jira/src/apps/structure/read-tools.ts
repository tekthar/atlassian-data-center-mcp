import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import { getStructureHistory } from './history.js';
import * as structure from './operations.js';
import { structureToolSchemas as schemas } from './schemas.js';

function registerStructureListTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('structure_getStructures', {
    description: `Find the structures (Structure by Tempo) shared with you in the ${context.instanceType}, by name, sorted by name. Returns each one's id, name, description and owner, and whether there are more.`,
    inputSchema: z.object(schemas.getStructures),
  }, async (search) => respond(() => structure.getStructures(search), 'Error fetching structures'));

  tools.registerTool('structure_getStructure', {
    description: `Get one structure (Structure by Tempo) in the ${context.instanceType} by id: its name, description, owner, whether you can edit it, and its sharing rules if you control it.`,
    inputSchema: z.object(schemas.getStructure),
  }, async ({ structureId }) => respond(() => structure.getStructure(structureId), 'Error fetching structure'));

  tools.registerTool('structure_getIssueStructures', {
    description: `List the structures (Structure by Tempo) in the ${context.instanceType} that hold a Jira issue, as far as you can view them, your recent structures first.`,
    inputSchema: z.object(schemas.getIssueStructures),
  }, async ({ issueKey }) => respond(() => structure.getIssueStructures(issueKey), 'Error fetching the issue\'s structures'));
}

function registerStructureRowTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('structure_getStructureRows', {
    description: `Read a structure's hierarchy (Structure by Tempo) in the ${context.instanceType}, a page of rows at a time in order: each row's rowId, depth (0 is the top level), item type (issue, folder, generator...) and item id, with values such as the issue key, summary and status. Narrow it to one row's subtree or a depth. Rows you may not read are marked inaccessible. Find the structure with structure_getStructures.`,
    inputSchema: z.object(schemas.getStructureRows),
  }, async (request) => respond(() => structure.getStructureRows(request), 'Error fetching structure rows'));

  tools.registerTool('structure_getStructureHistory', {
    description: `Get who changed a structure's rows (Structure by Tempo) in the ${context.instanceType}, and how, newest first: for each version, when, by whom or by which synchronizer, and what was added, copied, moved or removed, with the issue key and summary where the item is an issue you may see.`,
    inputSchema: z.object(schemas.getStructureHistory),
  }, async ({ structureId, beforeVersion, limit }) =>
    respond(() => getStructureHistory(structureId, beforeVersion, limit), 'Error fetching structure history'));
}

export function registerStructureReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerStructureListTools(tools, context);
  registerStructureRowTools(tools, context);
}
