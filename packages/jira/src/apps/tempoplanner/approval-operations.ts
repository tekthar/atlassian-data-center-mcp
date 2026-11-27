import { asArray, asRecord } from '../../tools/context.js';
import { userKeyOrMine } from '../user-key.js';
import { callTempoPlanner } from './client.js';
import { defined, describeApproval } from './operations.js';

/*
 * Plan approvals are PlanApprovalResource's: POST and PUT /plan-approval/{allocationId} take a PlanApprovalInputBean,
 * { reviewerKey, statusCode }, whose code PlanWorkflowStatus.fromCode reads as 1 requested, 2 rejected and 3 approved.
 * POST asks a reviewer and answers with no body; PUT records a decision, which PlanApprovalServiceImpl checks with
 * PlannerPermissionService.validateCanApprovePlan, and answers the PlanApprovalBean.
 */

const STATUS_CODES = { request: 1, reject: 2, approve: 3 } as const;
const APPROVE_PLANS = 'Approving or rejecting a plan needs Tempo\'s permission to approve plans for the person\'s team, and plan approval turned on in Tempo.';
const REQUEST_REVIEW = 'Asking for a review needs plan approval turned on in Tempo, and permission to plan for the person.';

/** The people who may review a person's plans in a period, as Tempo's own approval dialog lists them. */
export async function getPlanReviewers(user: string | undefined, from?: string, to?: string) {
  const userKey = await userKeyOrMine(user);
  const found = await callTempoPlanner({
    method: 'GET', url: '/plan-approval/reviewers/{userKey}', path: { userKey }, query: { from, to },
  }, `User ${userKey}'s reviewers`);
  const reviewers = asArray(found).map(asRecord).map((reviewer) => defined({ key: reviewer.key, name: reviewer.name, displayName: reviewer.displayName }));
  return { user: userKey, reviewers };
}

/** Asks a reviewer to approve a plan. */
export async function requestPlanApproval(id: number, reviewer: string) {
  await callTempoPlanner({
    method: 'POST', url: '/plan-approval/{allocationId}', path: { allocationId: id }, body: { reviewerKey: reviewer, statusCode: STATUS_CODES.request },
  }, `Plan ${id}`, REQUEST_REVIEW);
  return { id, status: 'awaiting review', reviewer };
}

/** Approves or rejects a plan, as its reviewer. */
export async function reviewPlan(id: number, decision: 'approve' | 'reject') {
  const reviewerKey = await userKeyOrMine(undefined);
  const saved = await callTempoPlanner({
    method: 'PUT', url: '/plan-approval/{allocationId}', path: { allocationId: id }, body: { reviewerKey, statusCode: STATUS_CODES[decision] },
  }, `Plan ${id}`, APPROVE_PLANS);
  return { id, approval: describeApproval(saved) ?? { status: decision === 'approve' ? 'approved' : 'rejected' } };
}
