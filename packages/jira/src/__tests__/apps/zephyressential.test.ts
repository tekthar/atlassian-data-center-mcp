import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { ZEPHYR_ESSENTIAL_CATALOG } from '../../apps/zephyressential/catalog.js';
import { registerZephyrEssentialReadTools } from '../../apps/zephyressential/read-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

const BASE = '/zapi/latest';

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    const route = routes[options.url];
    if (route === undefined) throw new Error(`Unexpected request to ${options.url}`);
    if (route instanceof Error) throw route;
    return route;
  });
}

const sentTo = (url: string) => mockedRequest.mock.calls.map((call) => call[1] as RequestOptions).filter((options) => options.url === url);

function setup() {
  const recorder = createRecordingRegistrar();
  registerZephyrEssentialReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const FAIL = { id: 2, name: 'FAIL', description: 'Test was failed', color: '#CC3300', type: 0 };
const PASS = { id: 1, name: 'PASS', description: 'Test was executed and passed successfully.', color: '#75B000', type: 0 };

describe('Zephyr Essential tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all reading, in a toolset that is off by default', () => {
    expect(Object.keys(ZEPHYR_ESSENTIAL_CATALOG.tools)).toHaveLength(6);
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(ZEPHYR_ESSENTIAL_CATALOG.tools).sort());
    expect(Object.values(ZEPHYR_ESSENTIAL_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(ZEPHYR_ESSENTIAL_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('searches executions with ZQL a page at a time, keeping what an agent needs from each', async () => {
    routeRequests({
      [`${BASE}/zql/executeSearch`]: {
        executions: [{
          id: 501, orderId: 1, cycleId: 7, cycleName: 'Sprint 5', issueId: '10010', issueKey: 'PROJ-12', issueSummary: 'Log in with SSO', projectKey: 'PROJ',
          versionName: '1.0', status: FAIL, statusId: 2, executedOn: '23/Nov/26 4:05 PM', executedBy: 'anna', executedByDisplay: 'Anna Berg',
          assigneeDisplay: 'Bo Lin', comment: 'Redirect loops', folderName: '', defects: [{ key: 'PROJ-40', summary: 'SSO loop', status: 'Open' }],
          testStepBean: [], canViewIssue: true,
        }],
        executionStatuses: [PASS, FAIL], totalCount: 21, offset: 0, currentIndex: 1, maxResultAllowed: 20,
      },
    });

    const result = await setup().callJson('zephyressential_searchExecutions', { zql: 'project = "PROJ" AND executionStatus = FAIL', limit: 1 });

    expect(sentTo(`${BASE}/zql/executeSearch`)[0].query).toEqual({ zqlQuery: 'project = "PROJ" AND executionStatus = FAIL', offset: 0, maxRecords: 1 });
    expect(result.data).toEqual({
      total: 21,
      offset: 0,
      nextOffset: 1,
      executions: [{
        id: 501, issueKey: 'PROJ-12', summary: 'Log in with SSO', projectKey: 'PROJ', version: '1.0', cycle: 'Sprint 5', status: 'FAIL',
        executedOn: '23/Nov/26 4:05 PM', executedBy: 'Anna Berg', assignee: 'Bo Lin', comment: 'Redirect loops', defects: ['PROJ-40'],
      }],
    });
  });

  it('refuses more than 100 executions a page before calling ZAPI', async () => {
    await expect(setup().call('zephyressential_searchExecutions', { zql: 'project = PROJ', limit: 101 })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('gets a test\'s steps by its issue\'s id, from the wrapper ZAPI answers with or a bare list', async () => {
    const step = { id: 1, orderId: 1, step: 'Open the login page', data: 'user anna', result: 'The SSO button shows', htmlStep: '<p>Open</p>', createdBy: 'anna' };
    routeRequests({ '/api/2/issue/{issueIdOrKey}': { id: '10010', key: 'PROJ-12' }, [`${BASE}/teststep/{issueId}`]: { stepBeanCollection: [step], isLastElementOnPage: true } });
    const tools = setup();

    const wrapped = await tools.callJson('zephyressential_getTestSteps', { issueKey: 'PROJ-12' });
    routeRequests({ '/api/2/issue/{issueIdOrKey}': { id: '10010', key: 'PROJ-12' }, [`${BASE}/teststep/{issueId}`]: [step] });
    const bare = await tools.callJson('zephyressential_getTestSteps', { issueKey: 'PROJ-12' });

    expect(sentTo(`${BASE}/teststep/{issueId}`)[0].path).toEqual({ issueId: '10010' });
    const expected = { issueKey: 'PROJ-12', steps: [{ id: 1, orderId: 1, step: 'Open the login page', data: 'user anna', result: 'The SSO button shows' }] };
    expect(wrapped.data).toEqual(expected);
    expect(bare.data).toEqual(expected);
  });

  it('gets an execution\'s step results with each status by name', async () => {
    routeRequests({
      [`${BASE}/stepResult`]: [
        { id: 9, executionId: 501, stepId: 1, orderId: 1, step: 'Open the login page', status: '1', comment: '', executionStatus: [PASS, FAIL], defects: [] },
        { id: 10, executionId: 501, stepId: 2, orderId: 2, step: 'Sign in', status: '2', comment: 'Loops back', executionStatus: [PASS, FAIL], defects: [{ key: 'PROJ-40', status: 'Open' }] },
      ],
    });

    const result = await setup().callJson('zephyressential_getStepResults', { executionId: 501 });

    expect(sentTo(`${BASE}/stepResult`)[0].query).toEqual({ executionId: 501 });
    expect(result.data).toEqual({
      executionId: 501,
      stepResults: [
        { stepId: 1, orderId: 1, step: 'Open the login page', status: 'PASS' },
        { stepId: 2, orderId: 2, step: 'Sign in', status: 'FAIL', comment: 'Loops back', defects: ['PROJ-40'] },
      ],
    });
  });

  it('lists a version\'s cycles by the project\'s id, with executions by status, leaving out the record count', async () => {
    const summary = (statusName: string, count: number) => ({ count, statusKey: 1, statusName, statusColor: '#75B000' });
    routeRequests({
      '/api/2/project/{projectIdOrKey}': { id: '10000', key: 'PROJ' },
      [`${BASE}/cycle`]: {
        '-1': { name: 'Ad hoc', versionName: '1.0', totalExecutions: 2, totalExecuted: 1, executionSummaries: { executionSummary: [summary('PASS', 1), summary('UNEXECUTED', 1)] } },
        7: { name: 'Sprint 5', versionName: '1.0', build: 'b-412', environment: 'staging', startDate: '18/Nov/26', endDate: '', totalExecutions: 3, totalExecuted: 3, executionSummaries: { executionSummary: [summary('PASS', 2), summary('FAIL', 1)] } },
        recordsCount: 2,
      },
    });

    const result = await setup().callJson('zephyressential_getCycles', { projectKey: 'PROJ', versionId: 10100 });

    expect(sentTo(`${BASE}/cycle`)[0].query).toEqual({ projectId: '10000', versionId: 10100 });
    expect(result.data).toEqual({
      projectKey: 'PROJ',
      versionId: 10100,
      cycles: [
        { id: 7, name: 'Sprint 5', version: '1.0', build: 'b-412', environment: 'staging', startDate: '18/Nov/26', totalExecutions: 3, totalExecuted: 3, byStatus: { PASS: 2, FAIL: 1 } },
        { id: -1, name: 'Ad hoc', version: '1.0', totalExecutions: 2, totalExecuted: 1, byStatus: { PASS: 1, UNEXECUTED: 1 } },
      ],
    });
  });

  it('lists a cycle\'s folders, and refuses a version id below -1 before calling ZAPI', async () => {
    routeRequests({
      '/api/2/project/{projectIdOrKey}': { id: '10000', key: 'PROJ' },
      [`${BASE}/cycle/{cycleId}/folders`]: [{ folderId: 3, folderName: 'Checkout', folderDescription: 'Pay flows', cycleId: 7, totalExecutions: 2, totalExecuted: 1, executionSummaries: { executionSummary: [{ statusName: 'FAIL', count: 1 }] } }],
    });
    const tools = setup();

    const result = await tools.callJson('zephyressential_getCycleFolders', { cycleId: 7, projectKey: 'PROJ', versionId: -1 });
    await expect(tools.call('zephyressential_getCycles', { projectKey: 'PROJ', versionId: -2 })).rejects.toThrow();

    expect(sentTo(`${BASE}/cycle/{cycleId}/folders`)[0]).toMatchObject({ path: { cycleId: 7 }, query: { projectId: '10000', versionId: -1 } });
    expect(result.data).toEqual({ cycleId: 7, folders: [{ id: 3, name: 'Checkout', description: 'Pay flows', totalExecutions: 2, totalExecuted: 1, byStatus: { FAIL: 1 } }] });
  });

  it('checks the tests covering each requirement, with executions by status and defects', async () => {
    routeRequests({
      [`${BASE}/traceability/testsByRequirement`]: [{
        requirement: { id: '10020', key: 'PROJ-7', summary: 'SSO login', status: 'In Progress' },
        tests: [{
          test: { id: '10010', key: 'PROJ-12', summary: 'Log in with SSO', status: 'To Do' },
          executionStat: { total: 3, statuses: [{ status: FAIL, count: 2 }, { status: PASS, count: 1 }] },
          defectStat: { total: 1, statuses: [{ status: 'Open', count: 1 }] },
          defects: [{ key: 'PROJ-40' }],
        }],
        totalDefects: 1,
      }],
    });

    const result = await setup().callJson('zephyressential_getRequirementCoverage', { issueKeys: ['PROJ-7', 'PROJ-8'] });

    expect(sentTo(`${BASE}/traceability/testsByRequirement`)[0].query).toEqual({ requirementIdOrKeyList: 'PROJ-7,PROJ-8', versionId: undefined });
    expect(result.data).toEqual({
      requirements: [{
        requirement: 'PROJ-7', summary: 'SSO login', status: 'In Progress', totalDefects: 1,
        tests: [{ test: 'PROJ-12', summary: 'Log in with SSO', executions: 3, byStatus: { FAIL: 2, PASS: 1 }, defects: 1 }],
      }],
    });
  });

  it('explains a refusal in terms of the test\'s project', async () => {
    routeRequests({ [`${BASE}/stepResult`]: Object.assign(new Error('Forbidden'), { status: 403 }) });

    const result = await setup().callJson('zephyressential_getStepResults', { executionId: 501 });

    expect(result.error).toContain('Zephyr Essential refused this (403)');
  });
});
