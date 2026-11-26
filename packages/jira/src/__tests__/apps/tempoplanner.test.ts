import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { TEMPO_PLANNER_CATALOG } from '../../apps/tempoplanner/catalog.js';
import { registerTempoPlannerReadTools } from '../../apps/tempoplanner/read-tools.js';

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

const BASE = '/tempo-planning/1';

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    const route = routes[`${options.method} ${options.url}`];
    if (route === undefined) throw new Error(`Unexpected request to ${options.method} ${options.url}`);
    if (route instanceof Error) throw route;
    return route;
  });
}

const sentTo = (method: string, url: string) =>
  mockedRequest.mock.calls.map((call) => call[1] as RequestOptions).filter((options) => options.method === method && options.url === url);

function setup() {
  const recorder = createRecordingRegistrar();
  registerTempoPlannerReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const ANNA = { key: 'JIRAUSER10000', name: 'anna', displayName: 'Anna Berg', avatar: 'https://jira/avatar' };
const BO = { key: 'JIRAUSER10001', name: 'bo', displayName: 'Bo Lin', avatar: 'https://jira/avatar' };

const allocation = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  assignee: { key: 'JIRAUSER10000', type: 'user', userKey: 'JIRAUSER10000' },
  planItem: { id: 10010, key: 'PROJ-12', type: 'ISSUE', summary: 'Checkout redesign', projectKey: 'PROJ', projectId: 10000, iconUrl: 'https://jira/icon', avatarUrls: {} },
  scope: { id: 10000, type: 'project' },
  commitment: 50,
  secondsPerDay: 14400,
  totalPlannedSeconds: 72000,
  seconds: 72000,
  isTotalPlan: false,
  includeNonWorkingDays: false,
  start: '2026-11-30',
  startTime: '09:00',
  end: '2026-12-04',
  description: 'Front end',
  created: '2026-11-20 10:00:00.0',
  createdBy: 'JIRAUSER10000',
  children: [],
  ...extra,
});

const PLAN_12 = {
  id: 41, assignee: { type: 'user', key: 'JIRAUSER10000' }, planItem: { type: 'ISSUE', key: 'PROJ-12', name: 'Checkout redesign', projectKey: 'PROJ' },
  start: '2026-11-30', end: '2026-12-04', hoursPerDay: 4, totalHours: 20, commitmentPercent: 50, description: 'Front end',
};

describe('Tempo Capacity Planner tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all reading, in a toolset that is off by default', () => {
    expect(Object.keys(TEMPO_PLANNER_CATALOG.tools)).toHaveLength(3);
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(TEMPO_PLANNER_CATALOG.tools).sort());
    expect(Object.values(TEMPO_PLANNER_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(TEMPO_PLANNER_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('gets your own plans for a period by default, in hours', async () => {
    routeRequests({
      'GET /api/2/myself': { key: 'JIRAUSER10000', name: 'anna' },
      [`GET ${BASE}/allocation`]: [allocation(41)],
    });

    const result = await setup().callJson('tempoplanner_getPlans', { from: '2026-11-30', to: '2026-12-06' });

    expect(sentTo('GET', `${BASE}/allocation`)[0].query).toEqual({
      assigneeKeys: ['JIRAUSER10000'], assigneeType: 'user', startDate: '2026-11-30', endDate: '2026-12-06',
    });
    expect(result.data).toEqual({ from: '2026-11-30', to: '2026-12-06', total: 1, plans: [PLAN_12] });
  });

  it('gets a team\'s plans by its id, with how a plan repeats and its approval', async () => {
    routeRequests({
      [`GET ${BASE}/allocation`]: [allocation(42, {
        assignee: { key: '7', type: 'team' },
        recurrence: { rule: 'WEEKLY', endDate: '2026-12-31' },
        planApproval: { requester: ANNA, reviewer: BO, actor: ANNA, statusCode: 1, latestAction: { key: 'request', message: 'Please check' } },
      })],
    });

    const result = await setup().callJson('tempoplanner_getPlans', { from: '2026-11-30', to: '2026-12-06', teamId: 7 });

    expect(sentTo('GET', `${BASE}/allocation`)[0].query).toEqual({ assigneeKeys: ['7'], assigneeType: 'team', startDate: '2026-11-30', endDate: '2026-12-06' });
    expect(result.data.plans[0]).toMatchObject({
      id: 42,
      assignee: { type: 'team', key: '7' },
      repeats: { rule: 'WEEKLY', until: '2026-12-31' },
      approval: { status: 'awaiting review', requester: 'Anna Berg', reviewer: 'Bo Lin', message: 'Please check' },
    });
  });

  it('gets everyone\'s plans for an issue or a project by its id', async () => {
    routeRequests({
      'GET /api/2/issue/{issueIdOrKey}': { id: '10010', key: 'PROJ-12' },
      'GET /api/2/project/{projectIdOrKey}': { id: '10000', key: 'PROJ' },
      [`GET ${BASE}/allocation`]: [],
    });

    await setup().callJson('tempoplanner_getPlans', { from: '2026-11-01', to: '2026-11-30', issueKey: 'PROJ-12' });
    await setup().callJson('tempoplanner_getPlans', { from: '2026-11-01', to: '2026-11-30', users: ['anna', 'bo'], projectKey: 'PROJ' });

    const [forIssue, forProject] = sentTo('GET', `${BASE}/allocation`).map((options) => options.query);
    expect(forIssue).toEqual({ planItemId: '10010', planItemType: 'ISSUE', startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(forProject).toEqual({
      assigneeKeys: ['anna', 'bo'], assigneeType: 'user', planItemId: '10000', planItemType: 'PROJECT', startDate: '2026-11-01', endDate: '2026-11-30',
    });
  });

  it('refuses a person and a team together, an issue and a project together, and a period that ends before it starts', async () => {
    const tools = setup();

    expect((await tools.callJson('tempoplanner_getPlans', { from: '2026-11-01', to: '2026-11-30', users: ['anna'], teamId: 7 })).error).toBe('Give users or teamId, not both.');
    expect((await tools.callJson('tempoplanner_getPlans', { from: '2026-11-01', to: '2026-11-30', issueKey: 'PROJ-12', projectKey: 'PROJ' })).error)
      .toBe('Give issueKey or projectKey, not both.');
    expect((await tools.callJson('tempoplanner_getPlans', { from: '2026-12-01', to: '2026-11-30' })).error).toBe('from must not be after to.');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('gets one plan by id', async () => {
    routeRequests({ [`GET ${BASE}/allocation/{allocationId}`]: allocation(41) });

    const result = await setup().callJson('tempoplanner_getPlan', { id: 41 });

    expect(sentTo('GET', `${BASE}/allocation/{allocationId}`)[0].path).toEqual({ allocationId: 41 });
    expect(result.data).toEqual(PLAN_12);
  });

  it('lists the plans awaiting your review, or the ones you approved', async () => {
    routeRequests({
      [`POST ${BASE}/plan-approval/plans-for-review`]: [allocation(43, {
        assignee: { key: 'JIRAUSER10001', type: 'user' },
        planApproval: { requester: BO, reviewer: ANNA, statusCode: 3, latestAction: { key: 'approve', message: '' } },
      })],
    });

    await setup().callJson('tempoplanner_getPlansForReview', {});
    const result = await setup().callJson('tempoplanner_getPlansForReview', { status: 'approved', includePast: true });

    expect(sentTo('POST', `${BASE}/plan-approval/plans-for-review`).map((options) => options.body)).toEqual([
      { statusCodes: [1], includePastPlans: false },
      { statusCodes: [3], includePastPlans: true },
    ]);
    expect(result.data).toMatchObject({ status: 'approved', total: 1, plans: [{ id: 43, approval: { status: 'approved', requester: 'Bo Lin', reviewer: 'Anna Berg' } }] });
  });

  it('explains a refusal in terms of Tempo\'s permissions', async () => {
    routeRequests({ [`GET ${BASE}/allocation`]: Object.assign(new Error('Forbidden'), { status: 403 }) });

    const result = await setup().callJson('tempoplanner_getPlans', { from: '2026-11-01', to: '2026-11-30', teamId: 7 });

    expect(result.error).toContain('Tempo refused this (403). Seeing other people\'s plans needs Tempo\'s permission to view their plans');
  });
});
