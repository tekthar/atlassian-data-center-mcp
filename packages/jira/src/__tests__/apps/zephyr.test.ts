import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { ZEPHYR_CATALOG } from '../../apps/zephyr/catalog.js';
import { registerZephyrReadTools } from '../../apps/zephyr/read-tools.js';
import { registerZephyrWriteTools } from '../../apps/zephyr/write-tools.js';

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
  registerZephyrReadTools(recorder.registrar, context);
  registerZephyrWriteTools(recorder.registrar, context);
  return recorder;
}

describe('Zephyr tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, none destructive, in toolsets that are off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(ZEPHYR_CATALOG.tools).sort());
    expect(Object.values(ZEPHYR_CATALOG.tools).every((entry) => entry.access !== 'destructive')).toBe(true);
    expect(Object.values(ZEPHYR_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('gets a test case from /atm/1.0, with only the fields asked for', async () => {
    routeRequests({ '/atm/1.0/testcase/{testCaseKey}': { key: 'QA-T12', name: 'Login', self: 'https://jira/x' } });

    const result = await setup().callJson('zephyr_getTestCase', { testCaseKey: 'QA-T12', fields: 'key,name' });

    expect(sent()).toMatchObject({ method: 'GET', path: { testCaseKey: 'QA-T12' }, query: { fields: 'key,name' } });
    expect(result).toEqual({ success: true, data: { key: 'QA-T12', name: 'Login' } });
  });

  it('searches test cases with TQL, paging with the server page size by default', async () => {
    routeRequests({ '/atm/1.0/testcase/search': [] });

    await setup(30).callJson('zephyr_searchTestCases', { query: 'projectKey = "QA"' });

    expect(sent().query).toEqual({ query: 'projectKey = "QA"', fields: undefined, startAt: 0, maxResults: 30 });
  });

  it('reads a test cycle and its results through the API\'s test run routes', async () => {
    routeRequests({ '/atm/1.0/testrun/{testRunKey}': { key: 'QA-R4' }, '/atm/1.0/testrun/{testRunKey}/testresults/page': [] });
    const tools = setup();

    await tools.callJson('zephyr_getTestCycle', { testCycleKey: 'QA-R4' });
    await tools.callJson('zephyr_getTestCycleResults', { testCycleKey: 'QA-R4', onlyLastExecutions: true });

    expect(sent(0).path).toEqual({ testRunKey: 'QA-R4' });
    expect(sent(1)).toMatchObject({ path: { testRunKey: 'QA-R4' }, query: { startAt: 0, maxResults: 25, onlyLastExecutions: true } });
  });

  it('lists the test cases covering an issue, the latest result of one, and a project\'s environments', async () => {
    routeRequests({
      '/atm/1.0/issuelink/{issueKey}/testcases': [{ key: 'QA-T1' }],
      '/atm/1.0/testcase/{testCaseKey}/testresult/latest': { status: 'Pass' },
      '/atm/1.0/environments': [{ name: 'Chrome' }],
    });
    const tools = setup();

    await tools.callJson('zephyr_getIssueTestCases', { issueKey: 'QA-12' });
    await tools.callJson('zephyr_getLatestTestResult', { testCaseKey: 'QA-T1' });
    await tools.callJson('zephyr_getEnvironments', { projectKey: 'QA' });

    expect([sent(0).path, sent(1).path, sent(2).query]).toEqual([{ issueKey: 'QA-12' }, { testCaseKey: 'QA-T1' }, { projectKey: 'QA' }]);
  });

  it('reads and searches test plans', async () => {
    routeRequests({ '/atm/1.0/testplan/{testPlanKey}': { key: 'QA-P2' }, '/atm/1.0/testplan/search': [] });
    const tools = setup();

    await tools.callJson('zephyr_getTestPlan', { testPlanKey: 'QA-P2' });
    await tools.callJson('zephyr_searchTestPlans', { query: 'projectKey = "QA"', maxResults: 5 });

    expect(sent(0).path).toEqual({ testPlanKey: 'QA-P2' });
    expect(sent(1).query).toMatchObject({ maxResults: 5 });
  });

  it('explains a 404 in terms of the subject and Zephyr', async () => {
    routeRequests({ '/atm/1.0/testrun/{testRunKey}': Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('zephyr_getTestCycle', { testCycleKey: 'QA-R99' });

    expect(result.error).toContain('Test cycle QA-R99 was not found (404)');
    expect(result.error).toContain('Zephyr is installed');
  });

  it('rejects keys that are not Zephyr keys before calling Zephyr', async () => {
    await expect(setup().call('zephyr_getTestCase', { testCaseKey: 'not a key' })).rejects.toThrow('Expected a Zephyr key');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('records a test result as a new execution, mapping step results to Zephyr\'s script results', async () => {
    routeRequests({ '/atm/1.0/testrun/{testRunKey}/testcase/{testCaseKey}/testresult': { id: 77 } });

    const result = await setup().callJson('zephyr_recordTestResult', {
      testCycleKey: 'QA-R4', testCaseKey: 'QA-T12', status: 'Fail', comment: 'Login button missing',
      stepResults: [{ index: 0, status: 'Pass' }, { index: 1, status: 'Fail' }], issueLinks: ['QA-31'],
    });

    expect(sent()).toMatchObject({ method: 'POST', path: { testRunKey: 'QA-R4', testCaseKey: 'QA-T12' } });
    expect(sent().body).toEqual({
      status: 'Fail', comment: 'Login button missing', issueLinks: ['QA-31'],
      scriptResults: [{ index: 0, status: 'Pass' }, { index: 1, status: 'Fail' }],
    });
    expect(result).toEqual({ success: true, data: { id: 77 } });
  });

  it('updates the latest result instead when asked', async () => {
    routeRequests({ '/atm/1.0/testrun/{testRunKey}/testcase/{testCaseKey}/testresult': {} });

    await setup().callJson('zephyr_recordTestResult', { testCycleKey: 'QA-R4', testCaseKey: 'QA-T12', status: 'Pass', replaceLatest: true });

    expect(sent()).toMatchObject({ method: 'PUT', body: { status: 'Pass' } });
  });

  it('creates a test case with a step-by-step or a plain-text script, but not both', async () => {
    routeRequests({ '/atm/1.0/testcase': { key: 'QA-T40' } });
    const tools = setup();

    await tools.callJson('zephyr_createTestCase', {
      projectKey: 'QA', name: 'Log in', issueLinks: ['QA-12'], steps: [{ description: 'Open the page', expectedResult: 'Form shown' }],
    });
    await tools.callJson('zephyr_createTestCase', { projectKey: 'QA', name: 'Smoke', plainText: 'Check the home page loads' });
    const both = await tools.callJson('zephyr_createTestCase', { projectKey: 'QA', name: 'x', steps: [{ description: 'a' }], plainText: 'b' });

    expect(sent(0).body).toEqual({
      projectKey: 'QA', name: 'Log in', issueLinks: ['QA-12'],
      testScript: { type: 'STEP_BY_STEP', steps: [{ description: 'Open the page', expectedResult: 'Form shown' }] },
    });
    expect(sent(1).body).toEqual({ projectKey: 'QA', name: 'Smoke', testScript: { type: 'PLAIN_TEXT', text: 'Check the home page loads' } });
    expect(both).toEqual({ success: false, error: 'Give steps or plainText, not both.' });
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it('creates a test cycle with its test cases as the API\'s items, and a test plan with its cycles', async () => {
    routeRequests({ '/atm/1.0/testrun': { key: 'QA-R9' }, '/atm/1.0/testplan': { key: 'QA-P3' } });
    const tools = setup();

    await tools.callJson('zephyr_createTestCycle', {
      projectKey: 'QA', name: 'Sprint 12', testCaseKeys: ['QA-T12', 'QA-T13'], plannedStartDate: '2026-11-20T09:00:00Z',
    });
    await tools.callJson('zephyr_createTestPlan', { projectKey: 'QA', name: 'Release 3', testCycleKeys: ['QA-R9'] });

    expect(sent(0).body).toEqual({
      projectKey: 'QA', name: 'Sprint 12', plannedStartDate: '2026-11-20T09:00:00Z',
      items: [{ testCaseKey: 'QA-T12' }, { testCaseKey: 'QA-T13' }],
    });
    expect(sent(1).body).toEqual({ projectKey: 'QA', name: 'Release 3', testRunKeys: ['QA-R9'] });
  });

  it('rejects a planned date that is not ISO 8601, and test case keys that are not test cases', async () => {
    const tools = setup();

    await expect(tools.call('zephyr_createTestCycle', { projectKey: 'QA', name: 'x', plannedStartDate: 'next week' })).rejects.toThrow();
    await expect(tools.call('zephyr_createTestCycle', { projectKey: 'QA', name: 'x', testCaseKeys: ['QA-R4'] })).rejects.toThrow('Expected test case keys');
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});
