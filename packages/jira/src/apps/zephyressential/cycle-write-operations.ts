import { asRecord } from '../../tools/context.js';
import { callZephyrEssential } from './client.js';
import { projectIdOf } from './cycle-operations.js';
import { defined } from './operations.js';

/*
 * Cycles are created and filled as ZAPI's CycleResourceDelegateImpl.createCycle and
 * ScheduleResourceDelegateImpl.addTestsToCycle do it. POST /cycle answers { id, responseMessage }, and answers 200
 * without an id when saving fails. POST /execution/addTestsToCycle answers { jobProgressToken }; the job then reports
 * on GET /execution/jobProgress/{token}, whose message is a localized cycle.operation.add.tests.warn text with six
 * <strong> slots in a fixed order: added, invalid, in another project, already in the cycle, not a test, no permission.
 */

const CREATE_IN_PROJECT = 'It needs you to browse the project and, when Zephyr\'s own permissions are turned on, to create cycles and executions there.';
const ADD_TESTS_JOB = 'add_tests_to_cycle_job_progress';
const OUTCOMES = ['added', 'invalid', 'inAnotherProject', 'alreadyThere', 'notATest', 'noPermission'] as const;

/** How long to wait for Zephyr's add-tests job before handing back its token. */
export const ADD_TESTS_WAIT = { attempts: 10, intervalMs: 1000 };

export interface NewCycle {
  projectKey: string;
  versionId: number;
  name: string;
  description?: string;
  build?: string;
  environment?: string;
  startDate?: string;
  endDate?: string;
}

export interface TestsToAdd {
  cycleId: number;
  projectKey: string;
  versionId: number;
  issueKeys: string[];
  folderId?: number;
}

/** Creates an empty test cycle in a project's version. */
export async function createCycle({ projectKey, versionId, ...cycle }: NewCycle) {
  const projectId = await projectIdOf(projectKey);
  const created = asRecord(await callZephyrEssential({
    method: 'POST', url: '/cycle', body: defined({ ...cycle, projectId: String(projectId), versionId: String(versionId) }),
  }, `Project ${projectKey} or version ${versionId}`, CREATE_IN_PROJECT));
  if (!created.id) throw new Error(`Zephyr Essential did not create the cycle: ${created.responseMessage ?? 'no reason given'}`);
  return defined({ id: Number(created.id), name: cycle.name, projectKey, versionId, message: created.responseMessage });
}

/** The issue keys in each slot of the job's message, leaving out empty slots. */
export function readAddTestsMessage(message: string) {
  const slots = [...message.matchAll(/<strong>(.*?)<\/strong>/gs)].map((match) =>
    match[1].replace(/<[^>]*>/g, '').split(',').map((key) => key.trim()).filter((key) => key && key !== '-'));
  if (!slots.length) return { message: message.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() };
  return Object.fromEntries(OUTCOMES.map((outcome, index) => [outcome, slots[index] ?? []]).filter(([, keys]) => keys.length));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJob(token: string) {
  for (let attempt = 1; ; attempt++) {
    const job = asRecord(await callZephyrEssential({
      method: 'GET', url: '/execution/jobProgress/{token}', path: { token }, query: { type: ADD_TESTS_JOB },
    }, 'The add-tests job'));
    if (job.errorMessage) throw new Error(`Zephyr Essential could not add the tests: ${job.errorMessage}`);
    if (Number(job.progress) >= 1) return { done: true as const, message: String(job.message ?? '') };
    if (attempt >= ADD_TESTS_WAIT.attempts) return { done: false as const, progress: Number(job.progress ?? 0) };
    await pause(ADD_TESTS_WAIT.intervalMs);
  }
}

/** Adds tests to a cycle, or one of its folders, as unexecuted executions, and reports what Zephyr added. */
export async function addTestsToCycle({ cycleId, projectKey, versionId, issueKeys, folderId }: TestsToAdd) {
  const projectId = await projectIdOf(projectKey);
  const started = asRecord(await callZephyrEssential({
    method: 'POST', url: '/execution/addTestsToCycle',
    body: defined({ issues: issueKeys, cycleId, projectId: Number(projectId), versionId, folderId, method: '1' }),
  }, `Cycle ${cycleId}`, CREATE_IN_PROJECT));
  const token = String(started.jobProgressToken ?? '');
  if (!token) throw new Error('Zephyr Essential did not start adding the tests.');
  const job = await waitForJob(token);
  if (!job.done) return defined({ cycleId, folderId, done: false, progress: job.progress });
  return defined({ cycleId, folderId, done: true, ...readAddTestsMessage(job.message) });
}
