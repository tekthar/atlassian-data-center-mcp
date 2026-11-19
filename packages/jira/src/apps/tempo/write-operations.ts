import { stripNoise } from '../../tools/context.js';
import { callTempo } from './client.js';
import { userKeyOrMine } from './user.js';

type Body = Record<string, unknown>;

const defined = (body: Body): Body => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

const seconds = (hours: number | undefined) => (hours === undefined ? undefined : Math.round(hours * 3600));

/** Tempo reads `yyyy-MM-dd` or `yyyy-MM-dd'T'HH:mm:ss.SSS`; a day and time from the tool gains its seconds. */
const tempoDate = (started: string | undefined) => (started && started.includes('T') ? `${started}:00.000` : started);

export interface LogTimeInput {
  issueKey: string;
  started: string;
  hours: number;
  comment?: string;
  billableHours?: number;
  remainingEstimateHours?: number;
  endDate?: string;
  includeNonWorkingDays?: boolean;
  workerKey?: string;
}

/** Logs time on an issue, under the JSON names Tempo's TimesheetWorklogBean reads. */
export async function logTime(input: LogTimeInput) {
  const body = defined({
    worker: await userKeyOrMine(input.workerKey),
    originTaskId: input.issueKey,
    started: tempoDate(input.started),
    timeSpentSeconds: seconds(input.hours),
    billableSeconds: seconds(input.billableHours),
    remainingEstimate: seconds(input.remainingEstimateHours),
    comment: input.comment,
    endDate: input.endDate,
    includeNonWorkingDays: input.includeNonWorkingDays,
  });
  return stripNoise(await callTempo({ method: 'POST', url: '/worklogs', body }, `Issue ${input.issueKey}`));
}

export interface WorklogChanges {
  started?: string;
  hours?: number;
  billableHours?: number;
  comment?: string;
  remainingEstimateHours?: number;
}

/** The changes under the keys Tempo's WorklogChangesBean reads; keys left out keep their values. */
export const worklogChanges = (changes: WorklogChanges): Body => defined({
  started: tempoDate(changes.started),
  timeSpentSeconds: seconds(changes.hours),
  billableSeconds: seconds(changes.billableHours),
  comment: changes.comment,
  remainingEstimate: seconds(changes.remainingEstimateHours),
});

export const updateWorklog = async (worklogId: number, changes: Body) =>
  stripNoise(await callTempo({ method: 'PUT', url: '/worklogs/{worklogId}', path: { worklogId }, body: changes }, `Worklog ${worklogId}`));

export async function deleteWorklog(worklogId: number) {
  await callTempo({ method: 'DELETE', url: '/worklogs/{worklogId}', path: { worklogId } }, `Worklog ${worklogId}`);
  return { deleted: true, worklogId };
}

export interface ApprovalAction {
  action: 'submit' | 'approve' | 'reject' | 'reopen';
  periodStartDate: string;
  userKey: string;
  comment?: string;
  reviewerKey?: string;
}

/** Posts an action on a timesheet: the ApprovalBean Tempo reads, with users named by key. */
export const postApproval = async ({ action, periodStartDate, userKey, comment, reviewerKey }: ApprovalAction) => stripNoise(await callTempo({
  method: 'POST',
  url: '/timesheet-approval',
  body: {
    user: { key: userKey },
    period: { dateFrom: periodStartDate },
    action: defined({ name: action, comment, reviewer: reviewerKey ? { key: reviewerKey } : undefined }),
  },
}, `The timesheet of ${userKey} from ${periodStartDate}`));

export const submitTimesheet = async (input: Omit<ApprovalAction, 'action' | 'userKey'> & { userKey?: string }) =>
  postApproval({ ...input, action: 'submit', userKey: await userKeyOrMine(input.userKey) });
