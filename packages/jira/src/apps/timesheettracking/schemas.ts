import { z } from 'zod';

const issueKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12');
const isoDate = (what: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-23').describe(what);

export const timesheetTrackingToolSchemas = {
  getWorkPlans: {
    userKey: z.string().min(1).optional().describe('The person, by Jira user key; leave out for yourself'),
    startDate: isoDate('First day, YYYY-MM-DD'),
    endDate: isoDate('Last day, YYYY-MM-DD, included'),
    jql: z.string().min(1).optional().describe('Only work planned on issues this JQL finds, e.g. "project = PROJ"'),
  },
  getIssueWorkPlans: {
    issueKey: issueKey.describe('The issue, e.g. PROJ-12'),
  },
  getTimers: {
    issueKey: issueKey.optional().describe('Only the timers on this issue; leave out for every running timer you may see'),
  },
};
