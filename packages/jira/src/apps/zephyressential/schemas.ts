import { z } from 'zod';

export const MAX_EXECUTIONS = 100;

export const zephyrEssentialToolSchemas = {
  searchExecutions: {
    zql: z.string().min(1).describe('A ZQL query, e.g. project = "PROJ" AND fixVersion = "1.0" AND cycleName = "Sprint 5" AND executionStatus = FAIL'),
    offset: z.number().int().min(0).optional().describe('Executions to skip, for the next page (default 0)'),
    limit: z.number().int().min(1).max(MAX_EXECUTIONS).optional().describe(`Executions per page (default 20, up to ${MAX_EXECUTIONS})`),
  },
  getTestSteps: {
    issueKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12').describe('The test issue, e.g. PROJ-12'),
  },
  getStepResults: {
    executionId: z.number().int().positive().describe('The execution id, from zephyressential_searchExecutions'),
  },
};
