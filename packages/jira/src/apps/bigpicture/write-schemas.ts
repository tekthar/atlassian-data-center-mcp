import { z } from 'zod';
import { boxId, issueKey } from './schemas.js';

const date = (what: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-16').describe(`${what}, e.g. '2026-11-16'`);

const teamId = z.number().int().positive().describe('The team id, from bigpicture_getBoxTeams or bigpicture_getGlobalTeams');

const individualId = z.string().min(1)
  .describe('The person\'s individualId exactly as bigpicture_getTeamMembers lists it for this or another team');

const teamBoxId = boxId.optional().describe('The box the team works in; leave out for a global team');

const availability = z.number().int().min(0).max(100).optional()
  .describe('Percent of their time the person gives the team from that date; BigPicture assumes 100 when left out');

export const bigPictureWriteSchemas = {
  updateIssueField: {
    issueKey,
    fieldName: z.string().min(1).describe('The field\'s name as bigpicture_getAvailableFields lists it, e.g. "Story Points"'),
    dataType: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Expected a data type such as DATE')
      .describe('The field\'s dataType from bigpicture_getAvailableFields, e.g. "DATE", "NUMBER" or "STRING"'),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())])
      .describe('The new value: text or a YYYY-MM-DD date as a string, a number or percentage as a number, yes or no as a boolean. For other types, the value object as bigpicture_getIssueFields returns it.'),
  },
  addBox: {
    parentBoxId: boxId.describe('The box to add it under, from bigpicture_getBoxHierarchy'),
    boxTypeId: z.string().min(1).describe('The box type, e.g. "PROJECT", from bigpicture_getBoxTypesAndStatuses'),
    name: z.string().min(1).max(255).describe('The new box\'s name'),
    startDate: date('First day of the box'),
    endDate: date('Last day of the box, on or after the start'),
    iconId: z.string().regex(/^[^@]+@[^@]+$/, 'Expected an icon id such as font-awesome-box-open@lightPurple').optional()
      .describe('Icon and color as "<icon>@<color>"; leave out for BigPicture\'s default box icon'),
  },
  addTeamMember: {
    teamId,
    boxId: teamBoxId,
    individualId,
    startDate: date('The day the person joins the team'),
    percentageAvailability: availability,
  },
  updateTeamMember: {
    teamId,
    boxId: teamBoxId,
    individualId,
    startDate: date('The start date of the membership period to change, as bigpicture_getTeamMembers lists it'),
    newStartDate: date('A new start date for that period').optional(),
    percentageAvailability: availability,
  },
  removeTeamMember: {
    teamId,
    boxId: teamBoxId,
    individualId,
  },
};
