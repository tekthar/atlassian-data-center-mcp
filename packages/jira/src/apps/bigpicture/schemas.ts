import { z } from 'zod';

export const boxId = z.string().regex(/^[\w-]+$/, 'Expected a box id from bigpicture_getBoxHierarchy').describe('A box id, from bigpicture_getBoxHierarchy');

export const issueKey = z.string().regex(/^([A-Za-z][A-Za-z0-9_]*-\d+|\d+)$/, 'Expected a Jira issue key such as PROJ-12, or a BigPicture task id')
  .describe('The Jira issue key, e.g. \'PROJ-12\'; a BigPicture task id works too');

export const isoDate = (what: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-16').describe(`${what}, e.g. '2026-11-16'`);

/** BigPicture's resource key for a person, `EXT_USER@<platform>@<user key>`, which its API calls individualId. */
export const individualId = z.string().min(1)
  .describe('The person\'s individualId (BigPicture\'s resource key) exactly as bigpicture_getTeamMembers lists it, or as the resourceKey bigpicture_getHolidayPlanPeople or bigpicture_getWorkloadPlanPeople list');

const planId = (plan: string, listTool: string) => z.number().int().positive().describe(`The ${plan} id, from ${listTool}`);

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
  getSkills: {},
  getPersonSkills: { individualId },
  getPersonAbsences: { individualId },
  getHolidayPlans: { holidayPlanId: planId('holiday plan', 'bigpicture_getHolidayPlans').optional().describe('One holiday plan by id; leave out for all') },
  getHolidayPlanPeople: { holidayPlanId: planId('holiday plan', 'bigpicture_getHolidayPlans') },
  getWorkloadPlans: { workloadPlanId: planId('workload plan', 'bigpicture_getWorkloadPlans').optional().describe('One workload plan by id; leave out for all') },
  getWorkloadPlanPeople: { workloadPlanId: planId('workload plan', 'bigpicture_getWorkloadPlans') },
  getCapacity: {
    userKeys: z.array(z.string().min(1)).min(1).describe('Jira user keys of the people, e.g. ["JIRAUSER10000"]'),
    startDate: isoDate('First day of the period'),
    endDate: isoDate('Last day of the period, on or after the first'),
    daily: z.boolean().optional().describe('Also give each day\'s capacity (default false)'),
  },
};
