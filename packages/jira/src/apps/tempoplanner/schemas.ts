import { z } from 'zod';

const isoDate = (what: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date such as 2026-11-26').describe(what);

export const tempoPlannerToolSchemas = {
  getPlans: {
    from: isoDate('First day, YYYY-MM-DD'),
    to: isoDate('Last day, YYYY-MM-DD, included'),
    users: z.array(z.string().min(1)).min(1).max(50).optional()
      .describe('People, by Jira user key or username. With no team, issue or project, your own plans are given'),
    teamId: z.number().int().positive().optional().describe('A Tempo team\'s plans, by id from tempo_getTeams'),
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').optional()
      .describe('Only plans for this issue, e.g. PROJ-12'),
    projectKey: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Expected a Jira project key such as PROJ').optional()
      .describe('Only plans for this project as a whole, e.g. PROJ'),
  },
  getPlan: {
    id: z.number().int().positive().describe('The plan\'s id, from tempoplanner_getPlans'),
  },
  getCapacity: {
    from: isoDate('First day, YYYY-MM-DD'),
    to: isoDate('Last day, YYYY-MM-DD, included; up to 92 days after from'),
    users: z.array(z.string().min(1)).min(1).max(20).optional().describe('People, by Jira user key; leave out, with no team, for yourself'),
    teamId: z.number().int().positive().optional().describe('A Tempo team as a whole, by id from tempo_getTeams'),
  },
  updatePlan: {
    id: z.number().int().positive().describe('The plan\'s id, from tempoplanner_getPlans'),
    start: isoDate('New first day, YYYY-MM-DD').optional(),
    end: isoDate('New last day, YYYY-MM-DD, included').optional(),
    hoursPerDay: z.number().positive().max(24).optional().describe('New hours a day, for a person\'s plan'),
    percentOfTeam: z.number().min(1).max(100).optional().describe('New percent of the team, for a team\'s plan'),
    description: z.string().optional(),
    includeNonWorkingDays: z.boolean().optional().describe('Whether the plan also covers weekends and holidays'),
  },
  getPlanApprovers: {
    user: z.string().min(1).optional().describe('Whose plans, by Jira user key; leave out for yours'),
    from: isoDate('First day the reviewer must cover, YYYY-MM-DD; default today').optional(),
    to: isoDate('Last day, YYYY-MM-DD, included; default today').optional(),
  },
  requestPlanApproval: {
    id: z.number().int().positive().describe('The plan\'s id, from tempoplanner_getPlans'),
    reviewer: z.string().min(1).describe('Who should review it, by Jira user key from tempoplanner_getPlanApprovers'),
  },
  approveOrRejectPlan: {
    id: z.number().int().positive().describe('The plan\'s id, from tempoplanner_getPlansForReview'),
    decision: z.enum(['approve', 'reject']).describe('approve or reject'),
  },
  deletePlan: {
    id: z.number().int().positive().describe('The plan\'s id, from tempoplanner_getPlans'),
  },
  getPlansForReview: {
    status: z.enum(['awaiting', 'approved', 'rejected']).optional().describe('Which plans: awaiting your review (default), or ones you approved or rejected'),
    includePast: z.boolean().optional().describe('Also plans that have ended (default false)'),
  },
};
