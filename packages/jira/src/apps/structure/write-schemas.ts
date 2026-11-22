import { z } from 'zod';

const structureId = z.number().int().positive().describe('The structure id, from structure_getStructures');
const rowId = z.number().int().positive();
const underRowId = rowId.optional().describe('The row to put them under, from structure_getStructureRows; leave out for the top level');
const afterRowId = rowId.optional().describe('The row, at the same level, to put them right after; leave out to put them last');

export const MAX_ROWS_PER_CHANGE = 50;

export const structureWriteSchemas = {
  addIssues: {
    structureId,
    issueKeys: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected Jira issue keys such as PROJ-12'))
      .min(1).max(MAX_ROWS_PER_CHANGE).describe('The issues to add, in order, e.g. ["PROJ-12", "PROJ-13"]'),
    underRowId,
    afterRowId,
  },
  moveRows: {
    structureId,
    rowIds: z.array(rowId).min(1).max(MAX_ROWS_PER_CHANGE).describe('The rows to move, from structure_getStructureRows; each moves with the rows under it'),
    underRowId,
    afterRowId,
  },
  createStructure: {
    name: z.string().trim().min(1).max(255).describe('The new structure\'s name'),
    description: z.string().max(4000).optional().describe('What the structure is for'),
  },
  addFolder: {
    structureId,
    name: z.string().trim().min(1).max(255).describe('The folder\'s name'),
    underRowId,
    afterRowId,
  },
  removeRows: {
    structureId,
    rowIds: z.array(rowId).min(1).max(MAX_ROWS_PER_CHANGE).describe('The rows to remove, from structure_getStructureRows; the rows under each go too'),
  },
};
