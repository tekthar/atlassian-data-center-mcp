import { stripNoise } from '../../tools/context.js';
import { callXray } from './client.js';

/** Query values Xray accepts; undefined values are left out of the URL. */
type Query = Record<string, string | number | boolean | undefined>;

export interface PageInput {
  page?: number;
  limit?: number;
}

const pageQuery = ({ page, limit }: PageInput, pageSize: number): Query => ({ page: page ?? 1, limit: limit ?? pageSize });

const get = async (version: '1.0' | '2.0', url: string, subject: string, path?: Record<string, unknown>, query?: Query) =>
  stripNoise(await callXray(version, { method: 'GET', url, path, query }, subject));

export function getTests(keys: string[] | undefined, jql: string | undefined) {
  return get('1.0', '/api/test', 'The Xray tests', undefined, { keys: keys?.join(';'), jql });
}

export function getTestSteps(testKey: string, testVersion: number | undefined) {
  return get('2.0', '/api/test/{testKey}/steps', `Test ${testKey}`, { testKey }, { testVersion });
}

export async function getTestRelations(testKey: string) {
  const subject = `Test ${testKey}`;
  const related = (part: string) => get('1.0', `/api/test/{testKey}/${part}`, subject, { testKey });
  const [preconditions, testExecutions, testPlans, testSets] = await Promise.all(
    ['preconditions', 'testexecutions', 'testplans', 'testsets'].map(related),
  );
  return { testKey, preconditions, testExecutions, testPlans, testSets };
}

export async function getTestStatuses() {
  const [testStatuses, stepStatuses] = await Promise.all([
    get('1.0', '/api/settings/teststatuses', 'Xray test statuses'),
    get('1.0', '/api/settings/teststepstatuses', 'Xray test step statuses'),
  ]);
  return { testStatuses, stepStatuses };
}

export function getTestExecutionTests(testExecKey: string, detailed: boolean | undefined, paging: PageInput, pageSize: number) {
  return get('1.0', '/api/testexec/{testExecKey}/test', `Test execution ${testExecKey}`, { testExecKey },
    { detailed: detailed ?? false, ...pageQuery(paging, pageSize) });
}

export function getTestPlanTests(testPlanKey: string, paging: PageInput, pageSize: number) {
  return get('1.0', '/api/testplan/{testPlanKey}/test', `Test plan ${testPlanKey}`, { testPlanKey }, pageQuery(paging, pageSize));
}

export function getTestPlanExecutions(testPlanKey: string) {
  return get('1.0', '/api/testplan/{testPlanKey}/testexecution', `Test plan ${testPlanKey}`, { testPlanKey });
}

export function getTestSetTests(testSetKey: string, paging: PageInput, pageSize: number) {
  return get('1.0', '/api/testset/{testSetKey}/test', `Test set ${testSetKey}`, { testSetKey }, pageQuery(paging, pageSize));
}

/** One test run, by id or by its test execution and test. */
export function getTestRun(input: { id?: number; testExecKey?: string; testKey?: string }) {
  if (input.id !== undefined) return get('2.0', '/api/testrun/{id}', `Test run ${input.id}`, { id: input.id });
  return get('2.0', '/api/testrun', `The run of test ${input.testKey} in test execution ${input.testExecKey}`, undefined,
    { testExecIssueKey: input.testExecKey, testIssueKey: input.testKey });
}

export interface TestRunSearch extends PageInput {
  testExecKey?: string;
  testKey?: string;
  testPlanKey?: string;
  savedFilterId?: number;
}

export function searchTestRuns(search: TestRunSearch, pageSize: number) {
  const { testExecKey, testKey, testPlanKey, savedFilterId } = search;
  return get('2.0', '/api/testruns', 'The Xray test runs', undefined,
    { testExecKey, testKey, testPlanKey, savedFilterId, ...pageQuery(search, pageSize) });
}

/** Adds issues to a test execution, plan or set; the add and remove lists are what Xray's CollectionBean reads. */
export async function addToIssue(url: string, key: string, subject: string, body: Record<string, unknown>) {
  const response = await callXray('1.0', { method: 'POST', url, path: { key }, body }, subject);
  return { key, added: body.add, response: stripNoise(response) ?? null };
}

export interface TestRunUpdate {
  status?: string;
  comment?: string;
  assignee?: string;
  defects?: { add?: string[]; remove?: string[] };
  steps?: Array<{ id: number; status?: string; comment?: string; actualResult?: string; defects?: { add?: string[]; remove?: string[] } }>;
}

export async function updateTestRun(id: number, update: TestRunUpdate) {
  const response = await callXray('2.0', { method: 'PUT', url: '/api/testrun/{id}', path: { id }, body: update }, `Test run ${id}`);
  return { id, updated: Object.keys(update), response: stripNoise(response) ?? null };
}
