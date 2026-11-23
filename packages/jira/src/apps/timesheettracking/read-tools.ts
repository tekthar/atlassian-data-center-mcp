import { z } from 'zod';
import { respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as timesheet from './operations.js';
import { timesheetTrackingToolSchemas as schemas } from './schemas.js';

export function registerTimesheetTrackingReadTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('timesheettracking_getWorkPlans', {
    description: `Get a person's planned work from Timesheet Tracking for Jira in the ${context.instanceType} between two days: each plan's issue, day and hours, with the total. Only plans not yet completed, on issues you may manage. Leave out userKey for your own.`,
    inputSchema: z.object(schemas.getWorkPlans),
  }, async (search) => respond(() => timesheet.getWorkPlans(search), 'Error fetching Timesheet Tracking work plans'));

  tools.registerTool('timesheettracking_getIssueWorkPlans', {
    description: `Get the work planned on one Jira issue in Timesheet Tracking for Jira in the ${context.instanceType}: who plans to work on it, when and for how many hours, with the total.`,
    inputSchema: z.object(schemas.getIssueWorkPlans),
  }, async ({ issueKey }) => respond(() => timesheet.getIssueWorkPlans(issueKey), 'Error fetching Timesheet Tracking work plans'));

  tools.registerTool('timesheettracking_getTimers', {
    description: `List Timesheet Tracking for Jira's running timers in the ${context.instanceType}, everyone's for Jira administrators and your own otherwise, or the timers on one issue: whose they are and when they started.`,
    inputSchema: z.object(schemas.getTimers),
  }, async ({ issueKey }) => respond(() => timesheet.getTimers(issueKey), 'Error fetching Timesheet Tracking timers'));
}
