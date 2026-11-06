import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { XRAY_CATALOG } from '../../apps/xray/catalog.js';
import { registerXrayReadTools } from '../../apps/xray/read-tools.js';
import { registerXrayWriteTools } from '../../apps/xray/write-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

const apiError = (status: number, statusText: string, body: unknown = {}) =>
  Object.assign(new Error(statusText), { status, statusText, body });

/** Answer each Xray URL template with a fixed response, or reject with an error. */
function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    const response = routes[options.url];
    if (response instanceof Error) throw response;
    return response;
  });
}

const sent = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;

function setup(pageSize = 25) {
  const recorder = createRecordingRegistrar();
  const context = { instanceType: 'JIRA Data Center edition instance', getPageSize: () => pageSize };
  registerXrayReadTools(recorder.registrar, context);
  registerXrayWriteTools(recorder.registrar, context);
  return recorder;
}

describe('Xray tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, in toolsets that are off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(XRAY_CATALOG.tools).sort());
    expect(Object.values(XRAY_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('gets tests by key from /raven/1.0, joining keys with semicolons', async () => {
    routeRequests({ '/raven/1.0/api/test': [{ key: 'QA-1', type: 'Manual', self: 'https://jira/x' }] });

    const result = await setup().callJson('xray_getTests', { keys: ['QA-1', 'QA-2'] });

    expect(sent()).toMatchObject({ method: 'GET', url: '/raven/1.0/api/test', query: { keys: 'QA-1;QA-2' } });
    expect(result).toEqual({ success: true, data: [{ key: 'QA-1', type: 'Manual' }] });
  });

  it('refuses to get tests without keys or JQL', async () => {
    const result = await setup().callJson('xray_getTests', {});

    expect(result).toEqual({ success: false, error: 'Give keys or jql to choose the tests.' });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('reads test steps from the v2 API', async () => {
    routeRequests({ '/raven/2.0/api/test/{testKey}/steps': { steps: [] } });

    await setup().callJson('xray_getTestSteps', { testKey: 'QA-1' });

    expect(sent()).toMatchObject({ url: '/raven/2.0/api/test/{testKey}/steps', path: { testKey: 'QA-1' } });
  });

  it('collects the executions, plans, sets and preconditions of a test', async () => {
    routeRequests({
      '/raven/1.0/api/test/{testKey}/preconditions': [{ key: 'QA-9' }],
      '/raven/1.0/api/test/{testKey}/testexecutions': [{ key: 'QA-20' }],
      '/raven/1.0/api/test/{testKey}/testplans': [],
      '/raven/1.0/api/test/{testKey}/testsets': [{ key: 'QA-30' }],
    });

    const result = await setup().callJson('xray_getTestRelations', { testKey: 'QA-1' });

    expect(result.data).toEqual({
      testKey: 'QA-1', preconditions: [{ key: 'QA-9' }], testExecutions: [{ key: 'QA-20' }], testPlans: [], testSets: [{ key: 'QA-30' }],
    });
  });

  it('pages test execution tests with the server page size by default', async () => {
    routeRequests({ '/raven/1.0/api/testexec/{testExecKey}/test': [] });

    await setup(40).callJson('xray_getTestExecutionTests', { testExecKey: 'QA-20' });

    expect(sent().query).toEqual({ detailed: false, page: 1, limit: 40 });
  });

  it('finds a test run by test execution and test when no id is given', async () => {
    routeRequests({ '/raven/2.0/api/testrun': { id: 7, status: 'PASS' } });

    await setup().callJson('xray_getTestRun', { testExecKey: 'QA-20', testKey: 'QA-1' });

    expect(sent().query).toEqual({ testExecIssueKey: 'QA-20', testIssueKey: 'QA-1' });
  });

  it('refuses a test run lookup without an id or both keys', async () => {
    const result = await setup().callJson('xray_getTestRun', { testKey: 'QA-1' });

    expect(result.success).toBe(false);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('adds tests to a test execution with the body Xray reads', async () => {
    routeRequests({ '/raven/1.0/api/testexec/{key}/test': undefined });

    const result = await setup().callJson('xray_addTestsToTestExecution', { testExecKey: 'QA-20', testKeys: ['QA-1', 'QA-2'] });

    expect(sent()).toMatchObject({ method: 'POST', path: { key: 'QA-20' }, body: { add: ['QA-1', 'QA-2'] } });
    expect(result.data).toEqual({ key: 'QA-20', added: ['QA-1', 'QA-2'], response: null });
  });

  it('adds test executions to a test plan, without their tests unless asked', async () => {
    routeRequests({ '/raven/1.0/api/testplan/{key}/testexecution': undefined });

    await setup().callJson('xray_addTestExecutionsToTestPlan', { testPlanKey: 'QA-40', testExecKeys: ['QA-20'] });

    expect(sent().body).toEqual({ add: ['QA-20'], addTestsToPlan: false });
  });

  it('updates a test run on the v2 API, sending only the fields given', async () => {
    routeRequests({ '/raven/2.0/api/testrun/{id}': { id: 7, warnings: [] } });

    const result = await setup().callJson('xray_updateTestRun', { id: 7, status: 'FAIL', defects: { add: ['QA-99'] } });

    expect(sent()).toMatchObject({ method: 'PUT', path: { id: 7 }, body: { status: 'FAIL', defects: { add: ['QA-99'] } } });
    expect(Object.keys(sent().body ?? {})).toEqual(['status', 'defects']);
    expect(result.data.updated).toEqual(['status', 'defects']);
  });

  it('refuses a test run update with nothing to change', async () => {
    const result = await setup().callJson('xray_updateTestRun', { id: 7 });

    expect(result.success).toBe(false);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('explains a 404 in terms of the subject and Xray', async () => {
    routeRequests({ '/raven/1.0/api/testplan/{testPlanKey}/testexecution': apiError(404, 'Not Found') });

    const result = await setup().callJson('xray_getTestPlanExecutions', { testPlanKey: 'QA-40' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Test plan QA-40 was not found (404)');
    expect(result.error).toContain('Xray is installed');
  });

  it('rejects malformed issue keys before calling Xray', async () => {
    await expect(setup().call('xray_getTestSteps', { testKey: 'not a key' })).rejects.toThrow('Expected a Jira issue key');
  });
});
