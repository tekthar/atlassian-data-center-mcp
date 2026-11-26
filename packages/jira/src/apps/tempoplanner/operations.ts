import { IssueService, ProjectService } from '../../jira-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { userKeyOrMine } from '../user-key.js';
import { callTempoPlanner } from './client.js';

/*
 * Plans are AllocationBeans: the assignee (key and type), the plan item (an issue, project, epic, version, component
 * or sprint), start and end dates, seconds a day, total seconds and commitment, and a planApproval whose statusCode
 * PlanWorkflowStatus.getCode gives: 0 no change, 1 awaiting review, 2 rejected, 3 approved.
 */

const APPROVAL_STATUSES: Record<number, string> = { 0: 'no change', 1: 'awaiting review', 2: 'rejected', 3: 'approved' };
const REVIEW_CODES = { awaiting: 1, rejected: 2, approved: 3 } as const;

export const defined = (entries: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && value !== ''));

export const hours = (seconds: unknown) => (typeof seconds === 'number' ? Math.round((seconds / 3600) * 100) / 100 : undefined);
const person = (value: unknown) => asRecord(value).displayName ?? asRecord(value).key;

export interface PlanQuery {
  from: string;
  to: string;
  users?: string[];
  teamId?: number;
  issueKey?: string;
  projectKey?: string;
}

function describeApproval(value: unknown) {
  const approval = asRecord(value);
  if (typeof approval.statusCode !== 'number') return undefined;
  return defined({
    status: APPROVAL_STATUSES[approval.statusCode] ?? approval.statusCode,
    requester: person(approval.requester),
    reviewer: person(approval.reviewer),
    message: asRecord(approval.latestAction).message,
  });
}

function describePlan(value: unknown) {
  const plan = asRecord(value);
  const { key, type } = asRecord(plan.assignee);
  const item = asRecord(plan.planItem);
  return defined({
    id: plan.id,
    assignee: defined({ type, key }),
    planItem: defined({ type: item.type, key: item.key, name: item.summary ?? item.name, projectKey: item.projectKey }),
    start: plan.start,
    end: plan.end,
    hoursPerDay: hours(plan.secondsPerDay),
    totalHours: hours(plan.totalPlannedSeconds ?? plan.seconds),
    commitmentPercent: plan.commitment,
    includeNonWorkingDays: plan.includeNonWorkingDays || undefined,
    description: plan.description,
    repeats: asRecord(plan.recurrence).rule ? defined({ rule: asRecord(plan.recurrence).rule, until: asRecord(plan.recurrence).endDate }) : undefined,
    approval: describeApproval(plan.planApproval),
  });
}

async function assigneeQuery({ users, teamId, issueKey, projectKey }: PlanQuery) {
  if (teamId !== undefined) return { assigneeKeys: [String(teamId)], assigneeType: 'team' };
  if (users?.length) return { assigneeKeys: users, assigneeType: 'user' };
  if (issueKey || projectKey) return {};
  return { assigneeKeys: [await userKeyOrMine(undefined)], assigneeType: 'user' };
}

async function planItemQuery({ issueKey, projectKey }: PlanQuery) {
  if (issueKey) return { planItemId: asRecord(await IssueService.getIssue1(issueKey, undefined, 'summary')).id, planItemType: 'ISSUE' };
  if (projectKey) return { planItemId: asRecord(await ProjectService.getProject(projectKey)).id, planItemType: 'PROJECT' };
  return {};
}

/** Plans in a period for people, a team, an issue or a project; your own when none is named. */
export async function getPlans(query: PlanQuery) {
  const found = await callTempoPlanner({
    method: 'GET', url: '/allocation',
    query: { ...(await assigneeQuery(query)), ...(await planItemQuery(query)), startDate: query.from, endDate: query.to },
  }, 'The plans');
  const plans = asArray(found).map(describePlan);
  return { from: query.from, to: query.to, total: plans.length, plans };
}

/** One plan by id. */
export async function getPlan(id: number) {
  return describePlan(await callTempoPlanner({ method: 'GET', url: '/allocation/{allocationId}', path: { allocationId: id } }, `Plan ${id}`));
}

/** Plans you review: awaiting your approval, or the ones you approved or rejected. */
export async function getPlansForReview(status: keyof typeof REVIEW_CODES = 'awaiting', includePast = false) {
  const found = await callTempoPlanner({
    method: 'POST', url: '/plan-approval/plans-for-review', body: { statusCodes: [REVIEW_CODES[status]], includePastPlans: includePast },
  }, 'Plans for review');
  const plans = asArray(found).map(describePlan);
  return { status, total: plans.length, plans };
}
