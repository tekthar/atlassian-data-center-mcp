import { z } from 'zod';

const structureId = z.number().int().positive().describe('The structure id, from structure_getStructures');

/** Attributes Structure can give as text for the rows of a structure; see CoreAttributeSpecs in its API. */
export const ROW_ATTRIBUTES = [
  'key', 'summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'creator', 'created', 'updated',
  'duedate', 'project', 'labels', 'components', 'fixVersions', 'versions', 'description',
] as const;

export const DEFAULT_ROW_ATTRIBUTES: (typeof ROW_ATTRIBUTES)[number][] = ['key', 'summary', 'status'];

export const MAX_ROWS = 500;

export const structureToolSchemas = {
  getStructures: {
    name: z.string().min(1).optional().describe('Only structures whose name contains this text, ignoring case, or whose id contains it'),
    permission: z.enum(['view', 'edit', 'automate', 'admin']).optional()
      .describe('Only structures you have at least this access to: view (the default), edit, automate, or admin (Structure\'s Control)'),
    archived: z.boolean().optional().describe('Include archived structures (default false)'),
    limit: z.number().int().min(1).max(100).optional().describe('Structures per page (default 25; Structure allows up to 100)'),
    page: z.number().int().min(1).optional().describe('1-based page (default 1)'),
  },
  getStructure: { structureId },
  getStructureRows: {
    structureId,
    attributes: z.array(z.enum(ROW_ATTRIBUTES)).min(1).max(10).optional()
      .describe(`Values to give for each row, as text (default ${DEFAULT_ROW_ATTRIBUTES.join(', ')}). A folder's name is its summary.`),
    underRowId: z.number().int().optional().describe('Only this row and the rows under it, by rowId from an earlier call'),
    maxDepth: z.number().int().min(0).optional().describe('Only rows down to this depth; 0 is the top level'),
    offset: z.number().int().min(0).optional().describe('Rows to skip, for the next page (default 0)'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe(`Rows per page (default 100, up to ${MAX_ROWS})`),
  },
  getStructureHistory: {
    structureId,
    beforeVersion: z.number().int().min(1).optional()
      .describe('Only versions older than this one; for the next page, the nextBeforeVersion of the last call'),
    limit: z.number().int().min(1).max(100).optional().describe('Versions per page (default 20, up to 100)'),
  },
  getIssueStructures: {
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').describe('The Jira issue key, e.g. PROJ-12'),
  },
};
