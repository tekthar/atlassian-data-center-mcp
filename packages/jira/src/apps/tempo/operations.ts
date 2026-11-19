import { stripNoise } from '../../tools/context.js';
import { callTempo } from './client.js';
import { userKeyOrMine } from './user.js';

type Query = Record<string, string | number | undefined>;

const get = async (url: string, subject: string, query?: Query, path?: Record<string, string | number>) =>
  stripNoise(await callTempo({ method: 'GET', url, query, path }, subject));

export interface WorklogSearch {
  from: string;
  to: string;
  workerKeys?: string[];
  issueKeys?: string[];
  projectKeys?: string[];
  epicKeys?: string[];
  teamIds?: number[];
  accountKeys?: string[];
  filterId?: number;
  includeSubtasks?: boolean;
  limit?: number;
}

interface Worklog {
  timeSpentSeconds?: number;
  billableSeconds?: number;
  [field: string]: unknown;
}

const hours = (seconds: number) => Math.round(seconds / 36) / 100;

const sumOf = (worklogs: Worklog[], field: 'timeSpentSeconds' | 'billableSeconds') =>
  worklogs.reduce((sum, worklog) => sum + (typeof worklog[field] === 'number' ? worklog[field] : 0), 0);

/** The body Tempo's search reads, under the JSON names its SearchParamsBean declares. */
const searchBody = (search: WorklogSearch) => ({
  from: search.from,
  to: search.to,
  worker: search.workerKeys,
  taskKey: search.issueKeys,
  projectKey: search.projectKeys,
  epicKey: search.epicKeys,
  teamId: search.teamIds,
  accountKey: search.accountKeys,
  filterId: search.filterId === undefined ? undefined : [search.filterId],
  includeSubtasks: search.includeSubtasks,
});

/*
 * Tempo answers a search with every matching worklog at once, without paging. The tool totals them all and
 * lists the first `limit`, so a month of a team's time doesn't flood the answer.
 */
export async function searchWorklogs(search: WorklogSearch, pageSize: number) {
  const found = await callTempo<Worklog[] | undefined>({ method: 'POST', url: '/worklogs/search', body: searchBody(search) }, 'The worklog search');
  const worklogs = Array.isArray(found) ? found : [];
  const limit = search.limit ?? pageSize;
  return {
    total: worklogs.length,
    hours: hours(sumOf(worklogs, 'timeSpentSeconds')),
    billableHours: hours(sumOf(worklogs, 'billableSeconds')),
    worklogs: stripNoise(worklogs.slice(0, limit)),
    ...(worklogs.length > limit ? { truncated: true } : {}),
  };
}

export const getWorklog = (worklogId: number) =>
  get('/worklogs/{worklogId}', `Worklog ${worklogId}`, undefined, { worklogId });

/** The timesheet periods in a date range, or the current one when no range is given. */
export const getPeriods = (from?: string, to?: string) => (from === undefined && to === undefined
  ? get('/period/current', 'The current timesheet period')
  : get('/period', 'The timesheet periods', { dateFrom: from, dateTo: to }));

export const getTimesheetApproval = (userKey?: string, periodStartDate?: string) =>
  get('/timesheet-approval/current', `The timesheet of ${userKey ?? 'the current user'}`, { userKey, periodStartDate });

export const getTeamTimesheetApprovals = (teamId: number, periodStartDate?: string) =>
  get('/timesheet-approval', `Team ${teamId}`, { teamId, periodStartDate });

export const getPendingTimesheetApprovals = (reviewerKey?: string) =>
  get('/timesheet-approval/pending', `The timesheets waiting for ${reviewerKey ?? 'the current user'}`, { reviewerKey });

export async function getSuggestedReviewers(userKey: string | undefined) {
  const key = await userKeyOrMine(userKey);
  return get('/timesheet-approval/user/{userKey}/suggestedreviewers', `User ${key}`, undefined, { userKey: key });
}
