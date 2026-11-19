import { z } from 'zod';

const started = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Expected a day such as 2026-11-16, or a day and time such as 2026-11-16T09:30')
  .describe('The day the work was done, e.g. \'2026-11-16\', or the day and start time, e.g. \'2026-11-16T09:30\'');

const hours = (what: string) => z.number().positive().max(24).describe(`${what}, in hours, e.g. 1.5`);

const periodStartDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-01')
  .describe('The first day of the timesheet period, from tempo_getPeriods or tempo_getTimesheetApproval');

const comment = z.string().min(1).optional();

export const tempoWriteSchemas = {
  logTime: {
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').describe('The issue the time was spent on, e.g. \'PROJ-12\''),
    started,
    hours: hours('Time spent'),
    comment: comment.describe('What the time was spent on; some Tempo settings require one'),
    billableHours: z.number().min(0).max(24).optional().describe('Billable time, in hours; Tempo assumes all of it when left out'),
    remainingEstimateHours: z.number().min(0).optional().describe('The issue\'s new remaining estimate, in hours'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Log the same time on every day up to this one, e.g. \'2026-11-20\''),
    includeNonWorkingDays: z.boolean().optional().describe('With endDate, log on weekends and holidays too (default false)'),
    workerKey: z.string().min(1).optional().describe('Jira user key of who did the work; leave out for you'),
  },
  updateWorklog: {
    worklogId: z.number().int().positive().describe('The Tempo worklog id, tempoWorklogId in search results'),
    started: started.optional(),
    hours: hours('New time spent').optional(),
    billableHours: z.number().min(0).max(24).optional().describe('New billable time, in hours'),
    comment: comment.describe('New comment'),
    remainingEstimateHours: z.number().min(0).optional().describe('The issue\'s new remaining estimate, in hours'),
  },
  deleteWorklog: {
    worklogId: z.number().int().positive().describe('The Tempo worklog id, tempoWorklogId in search results'),
  },
  submitTimesheet: {
    periodStartDate,
    reviewerKey: z.string().min(1).describe('Jira user key of who should approve it, e.g. from tempo_getSuggestedReviewers'),
    comment: comment.describe('A note for the reviewer'),
    userKey: z.string().min(1).optional().describe('Jira user key of whose timesheet to submit; leave out for yours'),
  },
  reviewTimesheet: {
    userKey: z.string().min(1).describe('Jira user key of whose timesheet it is'),
    periodStartDate,
    action: z.enum(['approve', 'reject', 'reopen']).describe('approve or reject a submitted timesheet, or reopen an approved one'),
    comment: comment.describe('Why, for the timesheet\'s owner'),
  },
};
