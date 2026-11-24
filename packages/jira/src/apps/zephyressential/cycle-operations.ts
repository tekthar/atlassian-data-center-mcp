import { ProjectService } from '../../jira-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { callZephyrEssential } from './client.js';

/*
 * Cycles, folders and coverage, as ZAPI's CycleResourceDelegateImpl and TraceabilityResource build them:
 * GET /cycle answers an object of cycles by id (-1 is the ad hoc cycle) beside recordsCount, each with
 * executionSummaries.executionSummary counts by status; GET /cycle/{id}/folders answers the cycle's folders with the
 * same summaries; GET /traceability/testsByRequirement answers each requirement with its tests, their executionStat
 * and defectStat, and totalDefects.
 */

const defined = (entries: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && value !== ''));

const projectIdOf = async (projectKey: string) => asRecord(await ProjectService.getProject(projectKey)).id;

/** Execution counts by status name, from executionSummaries.executionSummary. */
const countsByStatus = (summaries: unknown) => Object.fromEntries(asArray(asRecord(summaries).executionSummary)
  .map(asRecord).map((summary) => [summary.statusName ?? summary.statusKey, summary.count]));

function describeCycle(id: string, value: unknown) {
  const cycle = asRecord(value);
  return defined({
    id: Number(id),
    name: cycle.name,
    version: cycle.versionName,
    description: cycle.description,
    build: cycle.build,
    environment: cycle.environment,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    totalExecutions: cycle.totalExecutions,
    totalExecuted: cycle.totalExecuted,
    byStatus: countsByStatus(cycle.executionSummaries),
  });
}

/** A version's test cycles, with how many executions each has and how they ended. */
export async function getCycles(projectKey: string, versionId: number) {
  const projectId = await projectIdOf(projectKey);
  const found = asRecord(await callZephyrEssential({
    method: 'GET', url: '/cycle', query: { projectId, versionId },
  }, `Project ${projectKey}'s cycles`));
  const cycles = Object.entries(found).filter(([id]) => /^-?\d+$/.test(id)).map(([id, cycle]) => describeCycle(id, cycle));
  return { projectKey, versionId, cycles };
}

/** A cycle's folders, with their executions by status. */
export async function getCycleFolders(cycleId: number, projectKey: string, versionId: number) {
  const projectId = await projectIdOf(projectKey);
  const found = await callZephyrEssential({
    method: 'GET', url: '/cycle/{cycleId}/folders', path: { cycleId }, query: { projectId, versionId },
  }, `Cycle ${cycleId}'s folders`);
  return {
    cycleId,
    folders: asArray(found).map(asRecord).map((folder) => defined({
      id: folder.folderId,
      name: folder.folderName,
      description: folder.folderDescription,
      totalExecutions: folder.totalExecutions,
      totalExecuted: folder.totalExecuted,
      byStatus: countsByStatus(folder.executionSummaries),
    })),
  };
}

const statusName = (status: unknown) => (typeof status === 'object' && status !== null ? asRecord(status).name : status);

function describeTest(value: unknown) {
  const entry = asRecord(value);
  const test = asRecord(entry.test);
  const executions = asRecord(entry.executionStat);
  return defined({
    test: test.key,
    summary: test.summary,
    executions: executions.total,
    byStatus: Object.fromEntries(asArray(executions.statuses).map(asRecord).map((item) => [statusName(item.status), item.count])),
    defects: asRecord(entry.defectStat).total,
  });
}

/** The tests covering each requirement, with their executions by status and their defects. */
export async function getRequirementCoverage(issueKeys: string[], versionId?: number) {
  const found = await callZephyrEssential({
    method: 'GET', url: '/traceability/testsByRequirement', query: { requirementIdOrKeyList: issueKeys.join(','), versionId },
  }, 'The requirements\' coverage');
  return {
    requirements: asArray(found).map(asRecord).map((item) => {
      const requirement = asRecord(item.requirement);
      const tests = asArray(item.tests).map(describeTest);
      return defined({ requirement: requirement.key, summary: requirement.summary, status: statusName(requirement.status), tests, totalDefects: item.totalDefects });
    }),
  };
}
