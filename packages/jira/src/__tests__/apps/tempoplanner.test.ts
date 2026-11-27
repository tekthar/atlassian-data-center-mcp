import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { TEMPO_PLANNER_CATALOG } from '../../apps/tempoplanner/catalog.js';
import { registerTempoPlannerReadTools } from '../../apps/tempoplanner/read-tools.js';
import { registerTempoPlannerWriteTools } from '../../apps/tempoplanner/write-tools.js';

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
  const context = { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 };
  registerTempoPlannerReadTools(recorder.registrar, context);
  registerTempoPlannerWriteTools(recorder.registrar, context);
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

  it('registers every catalogued tool, reading apart from changing and deleting a plan, in a toolset that is off by default', () => {
    expect(Object.keys(TEMPO_PLANNER_CATALOG.tools)).toHaveLength(6);
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(TEMPO_PLANNER_CATALOG.tools).sort());
    expect(Object.entries(TEMPO_PLANNER_CATALOG.tools).filter(([, entry]) => entry.access !== 'read').map(([name, entry]) => [name, entry.access]))
      .toEqual([['tempoplanner_updatePlan', 'write'], ['tempoplanner_deletePlan', 'destructive']]);
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

  const schedule = (assigneeKey: string) => ({
    assigneeKey,
    planLogs: [
      { allocationId: 41, day: '2026-11-30', timePlannedSeconds: 7200 },
      { allocationId: 44, day: '2026-11-30', timePlannedSeconds: 3600 },
      { allocationId: 41, day: '2026-12-01', timePlannedSeconds: 14400 },
    ],
    daySchedules: [
      { date: '2026-11-30', requiredSeconds: 28800, type: 'WORKING_DAY' },
      { date: '2026-12-01', requiredSeconds: 28800, type: 'WORKING_DAY' },
      { date: '2026-12-02', requiredSeconds: 0, type: 'HOLIDAY_AND_NON_WORKING_DAY', holiday: { name: 'National day', durationSeconds: 28800 } },
    ],
    totalAvailability: 9,
    plannedPercentage: 43.75,
    totalCapacity: 16,
    totalPlannedHours: 7,
    totalAvailableSeconds: 32400,
  });

  it('checks your own capacity by default, with each day\'s required and planned hours', async () => {
    routeRequests({
      'GET /api/2/myself': { key: 'JIRAUSER10000', name: 'anna' },
      [`POST ${BASE}/planSchedule/users`]: [schedule('JIRAUSER10000')],
    });

    const result = await setup().callJson('tempoplanner_getCapacity', { from: '2026-11-30', to: '2026-12-02' });

    expect(sentTo('POST', `${BASE}/planSchedule/users`)[0].body).toEqual({
      assigneeKeys: ['JIRAUSER10000'], startDate: '2026-11-30', endDate: '2026-12-02', withPlanItemInfo: false,
    });
    expect(result.data).toEqual({
      from: '2026-11-30',
      to: '2026-12-02',
      totalsCountFrom: 'today',
      people: [{
        assignee: 'JIRAUSER10000', capacityHours: 16, plannedHours: 7, availableHours: 9, plannedPercent: 43.75,
        days: [
          { date: '2026-11-30', type: 'working day', requiredHours: 8, plannedHours: 3 },
          { date: '2026-12-01', type: 'working day', requiredHours: 8, plannedHours: 4 },
          { date: '2026-12-02', type: 'holiday', holiday: 'National day', requiredHours: 0, plannedHours: 0 },
        ],
      }],
    });
  });

  it('checks a team\'s capacity as a whole by its id', async () => {
    routeRequests({ [`GET ${BASE}/planSchedule/forTeam`]: schedule('7') });

    const result = await setup().callJson('tempoplanner_getCapacity', { from: '2026-11-30', to: '2026-12-02', teamId: 7 });

    expect(sentTo('GET', `${BASE}/planSchedule/forTeam`)[0].query).toEqual({ teamId: 7, from: '2026-11-30', to: '2026-12-02' });
    expect(result.data.team).toMatchObject({ teamId: 7, capacityHours: 16, plannedHours: 7, availableHours: 9 });
  });

  it('refuses people with a team, and more than 92 days, before calling Tempo', async () => {
    const tools = setup();

    expect((await tools.callJson('tempoplanner_getCapacity', { from: '2026-11-01', to: '2026-11-30', users: ['JIRAUSER10000'], teamId: 7 })).error)
      .toBe('Give users or teamId, not both.');
    expect((await tools.callJson('tempoplanner_getCapacity', { from: '2026-01-01', to: '2026-06-30' })).error).toBe('Ask for up to 92 days at a time.');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('changes a person\'s plan, sending it back whole with its own assignee, plan item and scope', async () => {
    const saved = allocation(41, { end: '2026-12-11', secondsPerDay: 21600, totalPlannedSeconds: 216000 });
    routeRequests({
      [`GET ${BASE}/allocation/{allocationId}`]: allocation(41),
      [`PUT ${BASE}/allocation/{allocationId}`]: saved,
    });

    const result = await setup().callJson('tempoplanner_updatePlan', { id: 41, end: '2026-12-11', hoursPerDay: 6 });

    const [sent] = sentTo('PUT', `${BASE}/allocation/{allocationId}`);
    expect(sent.path).toEqual({ allocationId: 41 });
    expect(sent.body).toEqual({
      assignee: { key: 'JIRAUSER10000', type: 'user' },
      planItem: { id: 10010, type: 'ISSUE' },
      scope: { id: 10000, type: 'project' },
      start: '2026-11-30', startTime: '09:00', end: '2026-12-11', secondsPerDay: 21600, includeNonWorkingDays: false, description: 'Front end',
    });
    expect(result.data).toMatchObject({ id: 41, end: '2026-12-11', hoursPerDay: 6, totalHours: 60 });
  });

  it('changes a team\'s plan as a percent of the team, keeping how it repeats', async () => {
    const teamPlan = allocation(42, {
      assignee: { key: '7', type: 'team' }, scope: { id: 7, type: 'team' }, commitment: 50, recurrence: { rule: 'WEEKLY', endDate: '2026-12-31' },
    });
    routeRequests({
      [`GET ${BASE}/allocation/{allocationId}`]: teamPlan,
      [`PUT ${BASE}/allocation/{allocationId}`]: { ...teamPlan, commitment: 30 },
    });

    await setup().callJson('tempoplanner_updatePlan', { id: 42, percentOfTeam: 30 });

    const { body } = sentTo('PUT', `${BASE}/allocation/{allocationId}`)[0];
    expect(body).toMatchObject({ assignee: { key: '7', type: 'team' }, scope: { id: 7, type: 'team' }, commitment: 30, recurrence: { rule: 'WEEKLY', endDate: '2026-12-31' } });
    expect(body).not.toHaveProperty('secondsPerDay');
  });

  it('refuses hours a day on a team\'s plan and any change to a total plan, without saving', async () => {
    routeRequests({ [`GET ${BASE}/allocation/{allocationId}`]: allocation(42, { assignee: { key: '7', type: 'team' } }) });
    const forTeam = await setup().callJson('tempoplanner_updatePlan', { id: 42, hoursPerDay: 4 });
    routeRequests({ [`GET ${BASE}/allocation/{allocationId}`]: allocation(43, { isTotalPlan: true }) });
    const forTotal = await setup().callJson('tempoplanner_updatePlan', { id: 43, end: '2026-12-11' });

    expect(forTeam.error).toContain('Give percentOfTeam instead of hoursPerDay.');
    expect(forTotal.error).toContain('This plan spreads a total of hours over its days.');
    expect(sentTo('PUT', `${BASE}/allocation/{allocationId}`)).toHaveLength(0);
  });

  it('refuses no change, or a start after the end, before calling Tempo', async () => {
    const tools = setup();

    expect((await tools.callJson('tempoplanner_updatePlan', { id: 41 })).error).toBe('Give at least one change.');
    expect((await tools.callJson('tempoplanner_updatePlan', { id: 41, start: '2026-12-12', end: '2026-12-11' })).error).toBe('start must not be after end.');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('deletes a plan by id', async () => {
    routeRequests({ [`DELETE ${BASE}/allocation/{allocationId}`]: '' });

    const result = await setup().callJson('tempoplanner_deletePlan', { id: 41 });

    expect(sentTo('DELETE', `${BASE}/allocation/{allocationId}`)[0].path).toEqual({ allocationId: 41 });
    expect(result.data).toEqual({ deleted: 41 });
  });
});
