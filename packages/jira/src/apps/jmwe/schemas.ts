import { z } from 'zod';

const actionId = (list: string) => z.string().regex(/^[\w.-]+$/, `Expected an action id from ${list}`)
  .optional().describe(`One action by id, from ${list}; leave out for all`);

export const jmweToolSchemas = {
  getWorkflowExtensions: {
    workflowName: z.string().min(1).optional().describe('One workflow by name, with the JMWE extensions on each of its transitions; leave out for every workflow that uses JMWE'),
  },
  getSharedItems: {
    kind: z.enum(['actions', 'conditions', 'validators', 'scripts']).describe('Which shared items: actions, conditions, validators or scripts'),
    id: z.string().regex(/^[\w .-]+$/, 'Expected an id, or a script name').optional()
      .describe('One item by id (a number for conditions and validators), or a script by name; leave out for all'),
    includeContent: z.boolean().optional().describe('In the list, include each item\'s configuration and scripts (default false)'),
  },
  getEventBasedActions: { actionId: actionId('jmwe_getEventBasedActions') },
  getScheduledActions: { actionId: actionId('jmwe_getScheduledActions') },
  getScheduledActionStatus: {},
  getLogs: {
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').optional().describe('Only logs for this issue'),
    extensionName: z.string().min(1).optional().describe('Only logs of this workflow extension or action, by name'),
    triggeredBy: z.string().min(1).optional().describe('Only logs triggered by this user'),
    errors: z.boolean().optional().describe('Include errors (default true)'),
    warnings: z.boolean().optional().describe('Include warnings (default true)'),
    successes: z.boolean().optional().describe('Include successful runs (default false)'),
    skipped: z.boolean().optional().describe('Include runs skipped by a condition (default false)'),
    page: z.number().int().min(1).optional().describe('1-based page (default 1)'),
    pageSize: z.number().int().min(1).max(100).optional().describe('Logs per page (default 20)'),
  },
  getLogDetails: {
    correlationId: z.string().regex(/^[\w-]+$/, 'Expected a correlation id from jmwe_getLogs').describe('The correlationId of a log entry, from jmwe_getLogs'),
  },
};
