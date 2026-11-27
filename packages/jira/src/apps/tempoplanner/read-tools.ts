import { z } from 'zod';
import { invalidInput, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as approvals from './approval-operations.js';
import * as capacity from './capacity-operations.js';
import * as planner from './operations.js';
import { tempoPlannerToolSchemas as schemas } from './schemas.js';

const MAX_CAPACITY_DAYS = 92;
const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

function registerCapacityTool(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempoplanner_getCapacity', {
    description: `Check a person's or a Tempo team's capacity and availability in Tempo Capacity Planner in the ${context.instanceType}: for a period, how many hours they have, how many are planned and how many are free, with each day's required and planned hours and holidays. Yours by default. Like Tempo, the totals count from today on.`,
    inputSchema: z.object(schemas.getCapacity),
  }, async (query) => {
    if (query.users?.length && query.teamId !== undefined) return invalidInput('Give users or teamId, not both.');
    if (query.from > query.to) return invalidInput('from must not be after to.');
    if (daysBetween(query.from, query.to) > MAX_CAPACITY_DAYS) return invalidInput(`Ask for up to ${MAX_CAPACITY_DAYS} days at a time.`);
    return respond(() => capacity.getCapacity(query), 'Error fetching Tempo capacity');
  });
}

export function registerTempoPlannerReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerCapacityTool(tools, context);
  tools.registerTool('tempoplanner_getPlans', {
    description: `Find who is planned to work on what, and when, in Tempo Capacity Planner in the ${context.instanceType}: the plans (allocated time) in a period for people, a Tempo team, an issue or a project, or your own planned work by default. Each with its dates, hours a day and in total, and approval.`,
    inputSchema: z.object(schemas.getPlans),
  }, async (query) => {
    if (query.users?.length && query.teamId !== undefined) return invalidInput('Give users or teamId, not both.');
    if (query.issueKey && query.projectKey) return invalidInput('Give issueKey or projectKey, not both.');
    if (query.from > query.to) return invalidInput('from must not be after to.');
    return respond(() => planner.getPlans(query), 'Error fetching Tempo plans');
  });

  tools.registerTool('tempoplanner_getPlan', {
    description: `Get one Tempo plan by its id from tempoplanner_getPlans in the ${context.instanceType}: how it repeats, and its approval.`,
    inputSchema: z.object(schemas.getPlan),
  }, async ({ id }) => respond(() => planner.getPlan(id), 'Error fetching Tempo plan'));

  tools.registerTool('tempoplanner_getPlanApprovers', {
    description: `List who may approve or reject a person's Tempo plans in Capacity Planner in the ${context.instanceType}, as Tempo's approval dialog does: yours by default, for today or a period.`,
    inputSchema: z.object(schemas.getPlanApprovers),
  }, async ({ user, from, to }) => respond(() => approvals.getPlanReviewers(user, from, to), 'Error fetching Tempo plan reviewers'));

  tools.registerTool('tempoplanner_getPlansForReview', {
    description: `List the Tempo plans you review in the ${context.instanceType}: those awaiting your approval, or ones you approved or rejected, with who asked and their message.`,
    inputSchema: z.object(schemas.getPlansForReview),
  }, async ({ status, includePast }) => respond(() => planner.getPlansForReview(status, includePast), 'Error fetching Tempo plans for review'));
}
