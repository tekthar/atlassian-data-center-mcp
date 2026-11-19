import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as tempo from './operations.js';
import { tempoToolSchemas as schemas } from './schemas.js';

function registerWorklogTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempo_searchWorklogs', {
    description: `Search the time logged with Tempo in the ${context.instanceType} between two dates, by person, issue, project, epic, Tempo team, account or saved filter. Returns the total hours and billable hours of every match, and lists the first worklogs with their issue, worker, start, time and comment.`,
    inputSchema: z.object(schemas.searchWorklogs),
  }, async (search) => respond(() => tempo.searchWorklogs(search, context.getPageSize()), 'Error searching Tempo worklogs'));

  tools.registerTool('tempo_getWorklog', {
    description: `Get one Tempo worklog from the ${context.instanceType} by its Tempo id: issue, worker, start, time spent, billable time, comment and work attributes.`,
    inputSchema: z.object(schemas.getWorklog),
  }, async ({ worklogId }) => respond(() => tempo.getWorklog(worklogId), 'Error fetching Tempo worklog'));
}

function registerTimesheetTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempo_getPeriods', {
    description: `Get Tempo's timesheet periods in the ${context.instanceType} between two dates, or the current period when no dates are given: each period's key and dates.`,
    inputSchema: z.object(schemas.getPeriods),
  }, async ({ from, to }) => respond(() => tempo.getPeriods(from, to), 'Error fetching Tempo periods'));

  tools.registerTool('tempo_getTimesheetApproval', {
    description: `Get the approval status of a person's Tempo timesheet in the ${context.instanceType} for a period: open, ready to submit, waiting for approval or approved, with the seconds worked, submitted and required, and the reviewer's last action. Leave out the person for you, and the period for the current one.`,
    inputSchema: z.object(schemas.getTimesheetApproval),
  }, async ({ userKey, periodStartDate }) =>
    respond(() => tempo.getTimesheetApproval(userKey, periodStartDate), 'Error fetching Tempo timesheet approval'));

  tools.registerTool('tempo_getTeamTimesheetApprovals', {
    description: `Get the timesheet approval status of every member of a Tempo team in the ${context.instanceType} for a period.`,
    inputSchema: z.object(schemas.getTeamTimesheetApprovals),
  }, async ({ teamId, periodStartDate }) =>
    respond(() => tempo.getTeamTimesheetApprovals(teamId, periodStartDate), 'Error fetching Tempo team timesheet approvals'));

  tools.registerTool('tempo_getPendingTimesheetApprovals', {
    description: `List the Tempo timesheets waiting for a reviewer's approval in the ${context.instanceType}. Leave out the reviewer for you.`,
    inputSchema: z.object(schemas.getPendingTimesheetApprovals),
  }, async ({ reviewerKey }) =>
    respond(() => tempo.getPendingTimesheetApprovals(reviewerKey), 'Error fetching pending Tempo timesheets'));

  tools.registerTool('tempo_getSuggestedReviewers', {
    description: `List the people Tempo suggests to approve a timesheet in the ${context.instanceType}, for tempo_submitTimesheet. Leave out the person for your own timesheet.`,
    inputSchema: z.object(schemas.getSuggestedReviewers),
  }, async ({ userKey }) => respond(() => tempo.getSuggestedReviewers(userKey), 'Error fetching Tempo suggested reviewers'));
}

export function registerTempoReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerWorklogTools(tools, context);
  registerTimesheetTools(tools, context);
}
