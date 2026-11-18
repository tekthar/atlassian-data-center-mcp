import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { TEMPO_CATALOG } from '../../apps/tempo/catalog.js';
import { registerTempoReadTools } from '../../apps/tempo/read-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
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
const BASE = '/tempo-timesheets/4';

function setup(pageSize = 25) {
  const recorder = createRecordingRegistrar();
  registerTempoReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => pageSize });
  return recorder;
}

const worklog = (id: number, seconds: number, billable: number) =>
  ({ tempoWorklogId: id, issue: { key: 'PROJ-12' }, worker: 'JIRAUSER10000', started: '2026-11-16 09:00:00.000', timeSpentSeconds: seconds, billableSeconds: billable, self: 'https://jira/x' });

describe('Tempo tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all read-only, in toolsets that are off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(TEMPO_CATALOG.tools).sort());
    expect(Object.values(TEMPO_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(TEMPO_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('searches worklogs under the JSON names Tempo reads, leaving out the filters not given', async () => {
    routeRequests({ [`${BASE}/worklogs/search`]: [] });

    await setup().callJson('tempo_searchWorklogs', {
      from: '2026-11-09', to: '2026-11-15', workerKeys: ['JIRAUSER10000'], projectKeys: ['PROJ'], filterId: 10200, includeSubtasks: true,
    });

    expect(sent()).toMatchObject({ method: 'POST', url: `${BASE}/worklogs/search` });
    expect(JSON.parse(JSON.stringify(sent().body))).toEqual({
      from: '2026-11-09', to: '2026-11-15', worker: ['JIRAUSER10000'], projectKey: ['PROJ'], filterId: [10200], includeSubtasks: true,
    });
  });

  it('totals the hours of every worklog found and lists only the first ones', async () => {
    routeRequests({ [`${BASE}/worklogs/search`]: [worklog(1, 3600, 3600), worklog(2, 5400, 0), worklog(3, 1800, 1800)] });

    const result = await setup().callJson('tempo_searchWorklogs', { from: '2026-11-09', to: '2026-11-15', limit: 2 });

    expect(result.data).toMatchObject({ total: 3, hours: 3, billableHours: 1.5, truncated: true });
    expect(result.data.worklogs.map((found: { tempoWorklogId: number }) => found.tempoWorklogId)).toEqual([1, 2]);
    expect(result.data.worklogs[0]).not.toHaveProperty('self');
  });

  it('refuses a search without both dates, or with a date in another format', async () => {
    const tools = setup();

    await expect(tools.call('tempo_searchWorklogs', { from: '2026-11-09' })).rejects.toThrow();
    await expect(tools.call('tempo_searchWorklogs', { from: '09/11/2026', to: '2026-11-15' })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('reads one worklog by its Tempo id', async () => {
    routeRequests({ [`${BASE}/worklogs/{worklogId}`]: worklog(7, 3600, 0) });

    await setup().callJson('tempo_getWorklog', { worklogId: 7 });

    expect(sent()).toMatchObject({ method: 'GET', path: { worklogId: 7 } });
  });

  it('reads the current period without dates, and the periods of a range with them', async () => {
    routeRequests({ [`${BASE}/period/current`]: { key: '1125' }, [`${BASE}/period`]: [] });
    const tools = setup();

    await tools.callJson('tempo_getPeriods', {});
    await tools.callJson('tempo_getPeriods', { from: '2026-10-01', to: '2026-11-30' });

    expect(sent(0).url).toBe(`${BASE}/period/current`);
    expect(sent(1).query).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-11-30' });
  });

  it('reads a person\'s, a team\'s and a reviewer\'s timesheet approvals', async () => {
    routeRequests({ [`${BASE}/timesheet-approval/current`]: {}, [`${BASE}/timesheet-approval`]: {}, [`${BASE}/timesheet-approval/pending`]: [] });
    const tools = setup();

    await tools.callJson('tempo_getTimesheetApproval', { userKey: 'JIRAUSER10000', periodStartDate: '2026-11-01' });
    await tools.callJson('tempo_getTeamTimesheetApprovals', { teamId: 4 });
    await tools.callJson('tempo_getPendingTimesheetApprovals', {});

    expect(sent(0).query).toEqual({ userKey: 'JIRAUSER10000', periodStartDate: '2026-11-01' });
    expect(sent(1).query).toEqual({ teamId: 4, periodStartDate: undefined });
    expect(sent(2).query).toEqual({ reviewerKey: undefined });
  });

  it('explains a 404 in terms of the subject and Tempo', async () => {
    routeRequests({ [`${BASE}/worklogs/{worklogId}`]: Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('tempo_getWorklog', { worklogId: 99 });

    expect(result.error).toContain('Worklog 99 was not found (404)');
  });
});
