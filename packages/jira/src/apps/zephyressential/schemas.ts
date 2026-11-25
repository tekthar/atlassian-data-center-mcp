import { z } from 'zod';

export const MAX_EXECUTIONS = 100;

const projectKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Expected a Jira project key such as PROJ').describe('The project key, e.g. PROJ');
const versionId = z.number().int().min(-1)
  .describe('The fix version\'s id, from jira_getProjectVersions; -1 for Unscheduled');
const issueKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, 'Expected a Jira issue key such as PROJ-12');
const status = z.string().min(1)
  .describe('The status by name, such as PASS, FAIL, WIP or BLOCKED, or by id. Statuses this instance added work too');
const date = z.string().min(1).describe('A date as zephyressential_getCycles shows dates, in this Jira\'s date picker format, e.g. 25/Nov/26');
const defects = z.array(issueKey).max(100).optional()
  .describe('The defects to link, e.g. ["PROJ-40"]. They replace the ones linked now; [] unlinks them all. Leave out to keep them');

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
  createCycle: {
    projectKey,
    versionId,
    name: z.string().min(1).max(255).describe('The cycle\'s name, e.g. Sprint 6 regression'),
    description: z.string().optional(),
    build: z.string().optional().describe('The build under test'),
    environment: z.string().optional().describe('Where the tests run, e.g. Staging'),
    startDate: date.optional(),
    endDate: date.optional(),
  },
  addTestsToCycle: {
    cycleId: z.number().int().min(-1).describe('The cycle id, from zephyressential_getCycles or zephyressential_createCycle; -1 for the ad hoc cycle'),
    projectKey,
    versionId,
    issueKeys: z.array(issueKey).min(1).max(100).describe('The tests to add, e.g. ["PROJ-12", "PROJ-13"]'),
    folderId: z.number().int().positive().optional().describe('A folder of the cycle to add them to, from zephyressential_getCycleFolders'),
  },
  recordResult: {
    executionId: z.number().int().positive().describe('The execution id, from zephyressential_searchExecutions'),
    status,
    comment: z.string().max(750).optional().describe('What happened, up to 750 characters, as Zephyr allows'),
    defects,
  },
  recordStepResult: {
    stepResultId: z.number().int().positive().describe('The step result\'s id, from zephyressential_getStepResults'),
    status,
    comment: z.string().optional().describe('What happened at this step'),
    defects,
  },
};
