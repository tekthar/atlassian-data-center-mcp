import { z } from 'zod';

const date = (what: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-16').describe(`${what}, e.g. '2026-11-16'`);

const keys = (what: string, example: string, pattern: RegExp) =>
  z.array(z.string().regex(pattern, `Expected ${what} such as ${example}`)).min(1).optional().describe(`Only these ${what}, e.g. ["${example}"]`);

const userKey = z.string().min(1);

export const tempoToolSchemas = {
  searchWorklogs: {
    from: date('First day to include'),
    to: date('Last day to include'),
    workerKeys: z.array(userKey).min(1).optional().describe('Only time logged by these people, by Jira user key, e.g. ["JIRAUSER10000"]'),
    issueKeys: keys('issues', 'PROJ-12', /^[A-Za-z][A-Za-z0-9_]*-\d+$/),
    projectKeys: keys('projects', 'PROJ', /^[A-Za-z][A-Za-z0-9_]*$/),
    epicKeys: keys('epics', 'PROJ-5', /^[A-Za-z][A-Za-z0-9_]*-\d+$/),
    teamIds: z.array(z.number().int().positive()).min(1).optional().describe('Only time logged by the members of these Tempo teams'),
    accountKeys: z.array(z.string().min(1)).min(1).optional().describe('Only time logged against these Tempo accounts'),
    filterId: z.number().int().positive().optional().describe('Only issues a saved Jira filter selects'),
    includeSubtasks: z.boolean().optional().describe('With issueKeys or epicKeys, include their sub-tasks\' worklogs (default false)'),
    limit: z.number().int().min(1).max(500).optional().describe('Most worklogs to list; the totals count them all (default: the server page size)'),
  },
  getWorklog: {
    worklogId: z.number().int().positive().describe('The Tempo worklog id, tempoWorklogId in search results'),
  },
  getPeriods: {
    from: date('First day of the range').optional(),
    to: date('Last day of the range').optional(),
  },
  getTimesheetApproval: {
    userKey: userKey.optional().describe('Jira user key of the person; leave out for you'),
    periodStartDate: date('Start of the timesheet period; leave out for the current one').optional(),
  },
  getTeamTimesheetApprovals: {
    teamId: z.number().int().positive().describe('The Tempo team id'),
    periodStartDate: date('Start of the timesheet period; leave out for the current one').optional(),
  },
  getPendingTimesheetApprovals: {
    reviewerKey: userKey.optional().describe('Jira user key of the reviewer; leave out for you'),
  },
};
