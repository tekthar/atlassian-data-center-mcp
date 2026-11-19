import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { TEMPO_CATALOG } from '../../apps/tempo/catalog.js';
import { registerTempoWriteTools } from '../../apps/tempo/write-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    return routes[options.url];
  });
}

const sent = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;
const BASE = '/tempo-timesheets/4';

function setup() {
  const recorder = createRecordingRegistrar();
  registerTempoWriteTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('Tempo write tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued write, gating worklog changes on Jira\'s worklog permissions and deleting as destructive', () => {
    const changes = Object.entries(TEMPO_CATALOG.tools).filter(([, entry]) => entry.access !== 'read').map(([name]) => name);

    expect(setup().registrar.registeredTools().sort()).toEqual(changes.sort());
    expect(TEMPO_CATALOG.tools.tempo_logTime.anyOfPermissions).toEqual(['WORK_ON_ISSUES']);
    expect(TEMPO_CATALOG.tools.tempo_deleteWorklog).toMatchObject({ access: 'destructive', anyOfPermissions: ['DELETE_OWN_WORKLOGS', 'DELETE_ALL_WORKLOGS'] });
  });

  it('logs time as you under Tempo\'s JSON names, in seconds, with the start time Tempo parses', async () => {
    routeRequests({ '/api/2/myself': { key: 'JIRAUSER10000' }, [`${BASE}/worklogs`]: [{ tempoWorklogId: 41 }] });

    const result = await setup().callJson('tempo_logTime', { issueKey: 'PROJ-12', started: '2026-11-16T09:30', hours: 1.5, billableHours: 1, comment: 'Review' });

    expect(sent(1)).toMatchObject({ method: 'POST', url: `${BASE}/worklogs` });
    expect(sent(1).body).toEqual({
      worker: 'JIRAUSER10000', originTaskId: 'PROJ-12', started: '2026-11-16T09:30:00.000', timeSpentSeconds: 5400, billableSeconds: 3600, comment: 'Review',
    });
    expect(result.data).toEqual([{ tempoWorklogId: 41 }]);
  });

  it('logs a day\'s time for someone else without looking you up, and the same time each day up to endDate', async () => {
    routeRequests({ [`${BASE}/worklogs`]: [] });

    await setup().callJson('tempo_logTime', { issueKey: 'PROJ-12', started: '2026-11-16', hours: 8, endDate: '2026-11-20', workerKey: 'JIRAUSER10001' });

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(sent().body).toEqual({ worker: 'JIRAUSER10001', originTaskId: 'PROJ-12', started: '2026-11-16', timeSpentSeconds: 28800, endDate: '2026-11-20' });
  });

  it('refuses a start that isn\'t a day or a day and time, and more than a day\'s hours', async () => {
    const tools = setup();

    await expect(tools.call('tempo_logTime', { issueKey: 'PROJ-12', started: '16/11/2026', hours: 1 })).rejects.toThrow();
    await expect(tools.call('tempo_logTime', { issueKey: 'PROJ-12', started: '2026-11-16', hours: 30 })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('changes only the fields given, and refuses an update with nothing to change', async () => {
    routeRequests({ [`${BASE}/worklogs/{worklogId}`]: { tempoWorklogId: 41 } });
    const tools = setup();

    await tools.callJson('tempo_updateWorklog', { worklogId: 41, hours: 2, comment: 'Review and fixes' });
    const nothing = await tools.callJson('tempo_updateWorklog', { worklogId: 41 });

    expect(sent()).toMatchObject({ method: 'PUT', path: { worklogId: 41 }, body: { timeSpentSeconds: 7200, comment: 'Review and fixes' } });
    expect(Object.keys(sent().body ?? {})).toEqual(['timeSpentSeconds', 'comment']);
    expect(nothing.error).toContain('Give at least one of');
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('deletes a worklog by id', async () => {
    routeRequests({ [`${BASE}/worklogs/{worklogId}`]: undefined });

    const result = await setup().callJson('tempo_deleteWorklog', { worklogId: 41 });

    expect(sent()).toMatchObject({ method: 'DELETE', path: { worklogId: 41 } });
    expect(result.data).toEqual({ deleted: true, worklogId: 41 });
  });

  it('submits your timesheet to a reviewer, and reviews someone else\'s, as the ApprovalBean Tempo reads', async () => {
    routeRequests({ '/api/2/myself': { key: 'JIRAUSER10000' }, [`${BASE}/timesheet-approval`]: { status: 'waiting_for_approval' } });
    const tools = setup();

    const submitted = await tools.callJson('tempo_submitTimesheet', { periodStartDate: '2026-11-01', reviewerKey: 'JIRAUSER10005', comment: 'All in' });
    await tools.callJson('tempo_reviewTimesheet', { userKey: 'JIRAUSER10001', periodStartDate: '2026-11-01', action: 'reject' });

    expect(sent(1).body).toEqual({
      user: { key: 'JIRAUSER10000' }, period: { dateFrom: '2026-11-01' }, action: { name: 'submit', comment: 'All in', reviewer: { key: 'JIRAUSER10005' } },
    });
    expect(sent(2).body).toEqual({ user: { key: 'JIRAUSER10001' }, period: { dateFrom: '2026-11-01' }, action: { name: 'reject' } });
    expect(submitted.data).toEqual({ status: 'waiting_for_approval' });
  });
});
