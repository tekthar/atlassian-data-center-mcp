import { z } from 'zod';

export const MAX_EXECUTIONS = 100;

const projectKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Expected a Jira project key such as PROJ').describe('The project key, e.g. PROJ');
const versionId = z.number().int().min(-1)
  .describe('The fix version\'s id, from jira_getProjectVersions; -1 for Unscheduled');
const issueKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12');

export const zephyrEssentialToolSchemas = {
  getCycles: { projectKey, versionId },
  getCycleFolders: {
    cycleId: z.number().int().positive().describe('The cycle id, from zephyressential_getCycles'),
    projectKey,
    versionId,
  },
  getRequirementCoverage: {
    issueKeys: z.array(issueKey).min(1).max(50).describe('The requirements (stories, epics...) to check, e.g. ["PROJ-7", "PROJ-8"]'),
    versionId: versionId.optional().describe('Only executions in this fix version, by id; leave out for all'),
  },
  searchExecutions: {
    zql: z.string().min(1).describe('A ZQL query, e.g. project = "PROJ" AND fixVersion = "1.0" AND cycleName = "Sprint 5" AND executionStatus = FAIL'),
    offset: z.number().int().min(0).optional().describe('Executions to skip, for the next page (default 0)'),
    limit: z.number().int().min(1).max(MAX_EXECUTIONS).optional().describe(`Executions per page (default 20, up to ${MAX_EXECUTIONS})`),
  },
  getTestSteps: {
    issueKey: issueKey.describe('The test issue, e.g. PROJ-12'),
  },
  getStepResults: {
    executionId: z.number().int().positive().describe('The execution id, from zephyressential_searchExecutions'),
  },
};
