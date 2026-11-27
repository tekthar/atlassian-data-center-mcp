import { z } from 'zod';
import { invalidInput, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as approvals from './approval-operations.js';
import * as plans from './plan-write-operations.js';
import { tempoPlannerToolSchemas as schemas } from './schemas.js';

function registerApprovalTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempoplanner_requestPlanApproval', {
    description: `Ask for someone's approval of a Tempo plan in Capacity Planner in the ${context.instanceType}. Find who may approve it with tempoplanner_getPlanApprovers.`,
    inputSchema: z.object(schemas.requestPlanApproval),
  }, async ({ id, reviewer }) => respond(() => approvals.requestPlanApproval(id, reviewer), 'Error asking for Tempo plan approval'));

  tools.registerTool('tempoplanner_approveOrRejectPlan', {
    description: `Approve or reject a Tempo plan in Capacity Planner in the ${context.instanceType}, as its reviewer. Find the plans waiting for you with tempoplanner_getPlansForReview.`,
    inputSchema: z.object(schemas.approveOrRejectPlan),
  }, async ({ id, decision }) => respond(() => approvals.reviewPlan(id, decision), 'Error reviewing Tempo plan'));
}

export function registerTempoPlannerWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerApprovalTools(tools, context);
  tools.registerTool('tempoplanner_updatePlan', {
    description: `Change a Tempo plan in Capacity Planner in the ${context.instanceType}: its dates, hours a day (a person's plan) or percent of the team (a team's plan), description, or whether it covers non-working days. Everything else stays as it is. Find the plan with tempoplanner_getPlans.`,
    inputSchema: z.object(schemas.updatePlan),
  }, async ({ id, ...changes }) => {
    if (Object.values(changes).every((value) => value === undefined)) return invalidInput('Give at least one change.');
    if (changes.start && changes.end && changes.start > changes.end) return invalidInput('start must not be after end.');
    return respond(() => plans.updatePlan(id, changes), 'Error changing Tempo plan');
  });

  tools.registerTool('tempoplanner_deletePlan', {
    description: `Delete a Tempo plan in Capacity Planner in the ${context.instanceType}, by its id from tempoplanner_getPlans. It can't be undone.`,
    inputSchema: z.object(schemas.deletePlan),
  }, async ({ id }) => respond(() => plans.deletePlan(id), 'Error deleting Tempo plan'));
}
