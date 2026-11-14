import { z } from 'zod';

const boxId = z.string().regex(/^[\w-]+$/, 'Expected a box id from bigpicture_getBoxHierarchy').describe('A box id, from bigpicture_getBoxHierarchy');

const issueKey = z.string().regex(/^([A-Za-z][A-Za-z0-9_]*-\d+|\d+)$/, 'Expected a Jira issue key such as PROJ-12, or a BigPicture task id')
  .describe('The Jira issue key, e.g. \'PROJ-12\'; a BigPicture task id works too');

export const bigPictureToolSchemas = {
  getBoxHierarchy: {
    includeArchived: z.boolean().optional().describe('Also list archived boxes (default false)'),
  },
  getBox: { boxId },
  getBoxTypesAndStatuses: {},
  getIssueBoxes: { issueKey },
  getIssueFields: {
    issueKey,
    fieldNames: z.array(z.string().min(1)).optional().describe('Only these fields, by the names bigpicture_getAvailableFields lists; leave out for all'),
  },
  getAvailableFields: {},
  getBoxTeams: {
    boxIds: z.array(boxId).min(1).describe('The boxes whose teams to list'),
  },
  getGlobalTeams: {},
  getTeamMembers: {
    teamId: z.number().int().positive().describe('A team id, from bigpicture_getBoxTeams or bigpicture_getGlobalTeams'),
    boxId: boxId.optional().describe('The box the team works in, for its members there'),
  },
};
