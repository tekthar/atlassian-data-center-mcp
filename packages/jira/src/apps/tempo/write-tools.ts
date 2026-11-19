import { z } from 'zod';
import { invalidInput, respond, type PolicyRegistrar } from '@atlassian-dc-mcp/common';
import type { JiraToolContext } from '../../tools/context.js';
import * as tempo from './write-operations.js';
import { tempoWriteSchemas as schemas } from './write-schemas.js';

function registerWorklogWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempo_logTime', {
    description: `Log time on a Jira issue with Tempo in the ${context.instanceType}: the day (and start time), hours, comment, and optionally billable hours and the new remaining estimate. With endDate, logs the same time on each working day up to it. Logs as you unless workerKey names someone else. Returns the worklogs created.`,
    inputSchema: z.object(schemas.logTime),
  }, async (input) => respond(() => tempo.logTime(input), 'Error logging Tempo time'));

  tools.registerTool('tempo_updateWorklog', {
    description: `Change a Tempo worklog in the ${context.instanceType}: its day or start time, hours, billable hours, comment or the issue's remaining estimate. Only what you give changes. Find the worklog with tempo_searchWorklogs.`,
    inputSchema: z.object(schemas.updateWorklog),
  }, async ({ worklogId, ...changes }) => {
    const body = tempo.worklogChanges(changes);
    if (Object.keys(body).length === 0) return invalidInput('Give at least one of started, hours, billableHours, comment or remainingEstimateHours.');
    return respond(() => tempo.updateWorklog(worklogId, body), 'Error updating Tempo worklog');
  });

  tools.registerTool('tempo_deleteWorklog', {
    description: `Delete a Tempo worklog in the ${context.instanceType}. The time it logged is gone from the issue and from timesheets, and nothing undoes it.`,
    inputSchema: z.object(schemas.deleteWorklog),
  }, async ({ worklogId }) => respond(() => tempo.deleteWorklog(worklogId), 'Error deleting Tempo worklog'));
}

function registerTimesheetWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  tools.registerTool('tempo_submitTimesheet', {
    description: `Submit a Tempo timesheet for approval in the ${context.instanceType}: the period, the reviewer and an optional note. Submits yours unless userKey names someone else. Returns the timesheet's new status.`,
    inputSchema: z.object(schemas.submitTimesheet),
  }, async (input) => respond(() => tempo.submitTimesheet(input), 'Error submitting Tempo timesheet'));

  tools.registerTool('tempo_reviewTimesheet', {
    description: `Approve or reject a submitted Tempo timesheet in the ${context.instanceType}, or reopen an approved one, with an optional comment for its owner. Returns the timesheet's new status.`,
    inputSchema: z.object(schemas.reviewTimesheet),
  }, async (input) => respond(() => tempo.postApproval(input), 'Error reviewing Tempo timesheet'));
}

export function registerTempoWriteTools(tools: PolicyRegistrar, context: JiraToolContext): void {
  registerWorklogWriteTools(tools, context);
  registerTimesheetWriteTools(tools, context);
}
