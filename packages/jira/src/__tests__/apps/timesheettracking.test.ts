import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { TIMESHEET_TRACKING_CATALOG } from '../../apps/timesheettracking/catalog.js';
import { registerTimesheetTrackingReadTools } from '../../apps/timesheettracking/read-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

const BASE = '/reportrest/1.0';

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    const route = routes[`${options.method} ${options.url}`];
    if (route === undefined) throw new Error(`Unexpected request to ${options.method} ${options.url}`);
    if (route instanceof Error) throw route;
    return route;
  });
}

const sent = () => mockedRequest.mock.calls.map((call) => call[1] as RequestOptions);

function setup() {
  const recorder = createRecordingRegistrar();
  registerTimesheetTrackingReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const ANNA = { id: 1, key: 'JIRAUSER10000', username: 'anna', displayName: 'Anna Berg' };
const plan = (id: string, issueKey: string, seconds: number, extra: Record<string, unknown> = {}) => ({
  id, uniqueId: `${id}-u`, issue: { id: 10001, key: issueKey, summary: `Work on ${issueKey}`, project: { key: 'PROJ' } },
  author: ANNA, creator: ANNA, comment: '', timePlanned: seconds, started: '2026/11/24 09:00:00', startedWithTimeZone: '2026-11-24T09:00:00+01:00',
  isCompleted: false, recurrenceRuleId: null, color: '#fff', ...extra,
});

describe('Timesheet Tracking tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all reading, in a toolset that is off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(TIMESHEET_TRACKING_CATALOG.tools).sort());
    expect(Object.values(TIMESHEET_TRACKING_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(TIMESHEET_TRACKING_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('gets your own work plans by default, with the app\'s date format and an empty JQL, and totals the hours', async () => {
    routeRequests({
      'GET /api/2/myself': { key: 'JIRAUSER10000', name: 'anna' },
      [`POST ${BASE}/workplan/get-workplans`]: [plan('1', 'PROJ-1', 9000), plan('2', 'PROJ-2', 3600, { comment: 'review', recurrenceRuleId: 'r1' })],
    });

    const result = await setup().callJson('timesheettracking_getWorkPlans', { startDate: '2026-11-23', endDate: '2026-11-29' });

    expect(sent().find((options) => options.url.endsWith('get-workplans'))?.body).toEqual({
      userKey: 'JIRAUSER10000', startedDate: '23/11/2026', endDate: '29/11/2026', jql: '',
    });
    expect(result.data).toEqual({
      userKey: 'JIRAUSER10000', startDate: '2026-11-23', endDate: '2026-11-29', totalHours: 3.5,
      workPlans: [
        { id: '1-u', issueKey: 'PROJ-1', summary: 'Work on PROJ-1', person: 'Anna Berg', userKey: 'JIRAUSER10000', started: '2026/11/24 09:00:00', hours: 2.5 },
        { id: '2-u', issueKey: 'PROJ-2', summary: 'Work on PROJ-2', person: 'Anna Berg', userKey: 'JIRAUSER10000', started: '2026/11/24 09:00:00', hours: 1, comment: 'review', recurring: true },
      ],
    });
  });

  it('gets someone else\'s plans on the issues a JQL finds, without looking up the caller', async () => {
    routeRequests({ [`POST ${BASE}/workplan/get-workplans`]: [] });

    await setup().callJson('timesheettracking_getWorkPlans', { userKey: 'JIRAUSER10001', startDate: '2026-12-01', endDate: '2026-12-01', jql: 'project = PROJ' });

    expect(sent()).toEqual([expect.objectContaining({ body: { userKey: 'JIRAUSER10001', startedDate: '01/12/2026', endDate: '01/12/2026', jql: 'project = PROJ' } })]);
  });

  it('refuses dates in another format before calling the app', async () => {
    await expect(setup().call('timesheettracking_getWorkPlans', { startDate: '23/11/2026', endDate: '2026-11-29' })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('gets the work planned on an issue, by anyone', async () => {
    routeRequests({ [`GET ${BASE}/workplan/get-issue-workplans`]: [plan('3', 'PROJ-7', 1800, { isCompleted: true, completedAt: '2026/11/20 17:00:00' })] });

    const result = await setup().callJson('timesheettracking_getIssueWorkPlans', { issueKey: 'PROJ-7' });

    expect(sent()[0].query).toEqual({ issueKey: 'PROJ-7' });
    expect(result.data).toMatchObject({ issueKey: 'PROJ-7', totalHours: 0.5, workPlans: [{ id: '3-u', hours: 0.5, completed: true, completedAt: '2026/11/20 17:00:00' }] });
  });

  it('lists the running timers, or the timers on an issue, and only through the reading routes', async () => {
    const timer = { id: '9', issue: { key: 'PROJ-1', summary: 'Checkout' }, user: ANNA, started: '2026/11/23 08:00:00', startedWithTimeZone: '2026-11-23T08:00:00Z', isCompleted: false };
    routeRequests({ [`GET ${BASE}/timer`]: [timer], [`POST ${BASE}/timer/get-issue-timers`]: [{ ...timer, isCompleted: true, completedAt: '2026/11/23 09:30:00' }] });
    const tools = setup();

    const running = await tools.callJson('timesheettracking_getTimers', {});
    const onIssue = await tools.callJson('timesheettracking_getTimers', { issueKey: 'PROJ-1' });

    expect(running.data).toEqual({ timers: [{ issueKey: 'PROJ-1', summary: 'Checkout', person: 'Anna Berg', userKey: 'JIRAUSER10000', started: '2026-11-23T08:00:00Z' }] });
    expect(onIssue.data).toMatchObject({ issueKey: 'PROJ-1', timers: [{ stopped: true, stoppedAt: '2026/11/23 09:30:00' }] });
    expect(sent().map((options) => `${options.method} ${options.url}`).filter((route) => /delete/.test(route))).toEqual([]);
    expect(sent()[1].body).toEqual({ issueKey: 'PROJ-1' });
  });

  it('explains a refusal in terms of the app\'s access settings', async () => {
    routeRequests({ [`GET ${BASE}/timer`]: Object.assign(new Error('Forbidden'), { status: 403 }) });

    const result = await setup().callJson('timesheettracking_getTimers', {});

    expect(result.error).toContain('Timesheet Tracking refused this (403)');
  });
});
