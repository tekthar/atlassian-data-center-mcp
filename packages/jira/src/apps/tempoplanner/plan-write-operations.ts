import { asRecord } from '../../tools/context.js';
import { callTempoPlanner } from './client.js';
import { defined, describePlan } from './operations.js';

/*
 * PUT /allocation/{id} replaces a plan with an AllocationInputBean, so a change reads the plan first and sends it back
 * whole, with its own assignee, plan item and scope. Allocation.AllocationBuilder takes a team's plan as a commitment
 * (a percent of the team) and a person's as secondsPerDay, and validate() refuses a plan without a scope type.
 */

export interface PlanChanges {
  start?: string;
  end?: string;
  hoursPerDay?: number;
  percentOfTeam?: number;
  description?: string;
  includeNonWorkingDays?: boolean;
}

const isTeamPlan = (plan: Record<string, unknown>) => String(asRecord(plan.assignee).type).toLowerCase() === 'team';

/** Why these changes can't be made to this plan, or nothing when they can. */
function refusal(plan: Record<string, unknown>, changes: PlanChanges): string | undefined {
  if (plan.isTotalPlan === true) return 'This plan spreads a total of hours over its days. Change it in Tempo, or delete it and plan again.';
  if (isTeamPlan(plan) && changes.hoursPerDay !== undefined) return 'This is a team\'s plan, which Tempo keeps as a percent of the team. Give percentOfTeam instead of hoursPerDay.';
  if (!isTeamPlan(plan) && changes.percentOfTeam !== undefined) return 'This is a person\'s plan. Give hoursPerDay instead of percentOfTeam.';
  return undefined;
}

function changedPlan(plan: Record<string, unknown>, changes: PlanChanges) {
  const { key, type } = asRecord(plan.assignee);
  const recurrence = asRecord(plan.recurrence);
  return defined({
    assignee: { key, type },
    planItem: { id: asRecord(plan.planItem).id, type: asRecord(plan.planItem).type },
    scope: { id: asRecord(plan.scope).id, type: asRecord(plan.scope).type },
    start: changes.start ?? plan.start,
    startTime: plan.startTime,
    end: changes.end ?? plan.end,
    ...(isTeamPlan(plan)
      ? { commitment: changes.percentOfTeam ?? plan.commitment }
      : { secondsPerDay: changes.hoursPerDay !== undefined ? Math.round(changes.hoursPerDay * 3600) : plan.secondsPerDay }),
    includeNonWorkingDays: changes.includeNonWorkingDays ?? plan.includeNonWorkingDays,
    description: changes.description ?? plan.description,
    recurrence: recurrence.rule ? defined({ rule: recurrence.rule, endDate: recurrence.endDate }) : undefined,
  });
}

/** Changes a plan's dates, hours or percent, description or whether it covers non-working days, keeping the rest. */
export async function updatePlan(id: number, changes: PlanChanges) {
  const path = { allocationId: id };
  const plan = asRecord(await callTempoPlanner({ method: 'GET', url: '/allocation/{allocationId}', path }, `Plan ${id}`));
  const refused = refusal(plan, changes);
  if (refused) throw new Error(refused);
  const saved = await callTempoPlanner({ method: 'PUT', url: '/allocation/{allocationId}', path, body: changedPlan(plan, changes) }, `Plan ${id}`);
  return describePlan(saved);
}

/** Deletes one plan. */
export async function deletePlan(id: number) {
  await callTempoPlanner({ method: 'DELETE', url: '/allocation/{allocationId}', path: { allocationId: id } }, `Plan ${id}`);
  return { deleted: id };
}
