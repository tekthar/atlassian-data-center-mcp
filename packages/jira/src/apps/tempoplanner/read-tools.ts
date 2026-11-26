import { z } from 'zod';
import { invalidInput, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as planner from './operations.js';
import { tempoPlannerToolSchemas as schemas } from './schemas.js';

export function registerTempoPlannerReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
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

  tools.registerTool('tempoplanner_getPlansForReview', {
    description: `List the Tempo plans you review in the ${context.instanceType}: those awaiting your approval, or ones you approved or rejected, with who asked and their message.`,
    inputSchema: z.object(schemas.getPlansForReview),
  }, async ({ status, includePast }) => respond(() => planner.getPlansForReview(status, includePast), 'Error fetching Tempo plans for review'));
}
