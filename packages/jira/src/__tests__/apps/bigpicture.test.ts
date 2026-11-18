import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { BIGPICTURE_CATALOG } from '../../apps/bigpicture/catalog.js';
import { registerBigPictureReadTools } from '../../apps/bigpicture/read-tools.js';

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
const BASE = '/softwareplant-bigpicture/1.0/public';
const PERSON = 'EXT_USER@1@JIRAUSER10000';

function setup() {
  const recorder = createRecordingRegistrar();
  registerBigPictureReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const HIERARCHY = [{
  boxId: '1', boxName: 'Portfolio', boxArchived: false, boxChildren: [
    { boxId: '2', boxName: 'Live program', boxArchived: false, boxChildren: [] },
    { boxId: '3', boxName: 'Old program', boxArchived: true, boxChildren: [{ boxId: '4', boxName: 'Old project', boxArchived: false, boxChildren: [] }] },
  ],
}];

describe('BigPicture tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued read tool, in toolsets that are off by default', () => {
    const reads = Object.entries(BIGPICTURE_CATALOG.tools).filter(([, entry]) => entry.access === 'read').map(([name]) => name);

    expect(setup().registrar.registeredTools().sort()).toEqual(reads.sort());
    expect(Object.values(BIGPICTURE_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('gets the box hierarchy from the public API, leaving out archived boxes and what they hold', async () => {
    routeRequests({ [`${BASE}/ppm/box/box-hierarchy`]: HIERARCHY });

    const result = await setup().callJson('bigpicture_getBoxHierarchy', {});

    expect(sent()).toMatchObject({ method: 'GET', url: `${BASE}/ppm/box/box-hierarchy` });
    expect(result.data).toEqual([{ boxId: '1', boxName: 'Portfolio', boxArchived: false, boxChildren: [{ boxId: '2', boxName: 'Live program', boxArchived: false, boxChildren: [] }] }]);
  });

  it('keeps archived boxes when asked', async () => {
    routeRequests({ [`${BASE}/ppm/box/box-hierarchy`]: HIERARCHY });

    const result = await setup().callJson('bigpicture_getBoxHierarchy', { includeArchived: true });

    expect(result.data).toEqual(HIERARCHY);
  });

  it('reads one box, and box types and statuses together', async () => {
    routeRequests({
      [`${BASE}/ppm/box/boxes/{boxId}`]: { boxId: '2' },
      [`${BASE}/ppm/box/box-types`]: [{ id: 'PROGRAM' }],
      [`${BASE}/ppm/box/boxes/statuses`]: [{ id: 'ACTIVE' }],
    });
    const tools = setup();

    await tools.callJson('bigpicture_getBox', { boxId: '2' });
    const meta = await tools.callJson('bigpicture_getBoxTypesAndStatuses', {});

    expect(sent(0).path).toEqual({ boxId: '2' });
    expect(meta.data).toEqual({ types: [{ id: 'PROGRAM' }], statuses: [{ id: 'ACTIVE' }] });
  });

  it('reads a Jira issue\'s boxes and BigPicture fields by key, naming only the fields asked for', async () => {
    routeRequests({ [`${BASE}/ppm/boxarea/task/{issueKey}/boxes`]: [], [`${BASE}/ppm/task/core/task/{issueKey}/field`]: { fields: [] } });
    const tools = setup();

    await tools.callJson('bigpicture_getIssueBoxes', { issueKey: 'PROJ-12' });
    await tools.callJson('bigpicture_getIssueFields', { issueKey: 'PROJ-12', fieldNames: ['startDate', 'endDate'] });

    expect(sent(0).path).toEqual({ issueKey: 'PROJ-12' });
    expect(sent(1)).toMatchObject({ path: { issueKey: 'PROJ-12' }, query: { fieldNames: ['startDate', 'endDate'] } });
  });

  it('lists the teams of boxes, global teams, and a team\'s members in a box', async () => {
    routeRequests({ [`${BASE}/ppm/teams`]: {}, [`${BASE}/ppm/global-teams`]: {}, [`${BASE}/ppm/team/{teamId}/memberships`]: {} });
    const tools = setup();

    await tools.callJson('bigpicture_getBoxTeams', { boxIds: ['2', '5'] });
    await tools.callJson('bigpicture_getGlobalTeams', {});
    await tools.callJson('bigpicture_getTeamMembers', { teamId: 7, boxId: '2' });

    expect(sent(0).query).toEqual({ boxIds: ['2', '5'] });
    expect(sent(2)).toMatchObject({ path: { teamId: 7 }, query: { boxId: '2' } });
  });

  it('reads skills, and a person\'s skills and absences by individualId', async () => {
    routeRequests({
      [`${BASE}/ppm/skills`]: [{ id: 1, code: 'JAVA', name: 'Java' }],
      [`${BASE}/ppm/resources/{individualId}/skills`]: { items: [] },
      [`${BASE}/ppm/resources/{individualId}/absences`]: { individualId: PERSON, absences: [] },
    });
    const tools = setup();

    const skills = await tools.callJson('bigpicture_getSkills', {});
    await tools.callJson('bigpicture_getPersonSkills', { individualId: PERSON });
    await tools.callJson('bigpicture_getPersonAbsences', { individualId: PERSON });

    expect(skills.data).toEqual([{ id: 1, code: 'JAVA', name: 'Java' }]);
    expect(sent(1).path).toEqual({ individualId: PERSON });
    expect(sent(2).path).toEqual({ individualId: PERSON });
  });

  it('lists holiday and workload plans, gets one by id, and lists who each applies to', async () => {
    routeRequests({
      [`${BASE}/ppm/holiday-plans`]: [], [`${BASE}/ppm/holiday-plans/{holidayPlanId}`]: {},
      [`${BASE}/ppm/resources/holiday-plans/{holidayPlanId}/assigned-resources`]: { assignedResources: [] },
      [`${BASE}/ppm/workload-plans`]: [], [`${BASE}/ppm/workload-plans/{workloadPlanId}`]: {},
      [`${BASE}/ppm/resources/workload-plans/{workloadPlanId}/assigned-resources`]: { assignedResources: [] },
    });
    const tools = setup();

    await tools.callJson('bigpicture_getHolidayPlans', {});
    await tools.callJson('bigpicture_getHolidayPlans', { holidayPlanId: 3 });
    await tools.callJson('bigpicture_getHolidayPlanPeople', { holidayPlanId: 3 });
    await tools.callJson('bigpicture_getWorkloadPlans', { workloadPlanId: 4 });
    await tools.callJson('bigpicture_getWorkloadPlanPeople', { workloadPlanId: 4 });

    expect(sent(0).path).toBeUndefined();
    expect(sent(1).path).toEqual({ holidayPlanId: 3 });
    expect(sent(2)).toMatchObject({ url: `${BASE}/ppm/resources/holiday-plans/{holidayPlanId}/assigned-resources`, path: { holidayPlanId: 3 } });
    expect(sent(3).path).toEqual({ workloadPlanId: 4 });
    expect(sent(4).path).toEqual({ workloadPlanId: 4 });
  });

  it('asks for capacity by Jira user keys and adds each total in hours', async () => {
    routeRequests({
      [`${BASE}/ppm/resources/capacity`]: {
        startDate: '2026-12-01', capacityInSeconds: [{ userKey: 'JIRAUSER10000', dailyValues: [28800, 14400], sum: 43200 }], unknownUserKeys: ['nobody'],
      },
    });

    const result = await setup().callJson('bigpicture_getCapacity', { userKeys: ['JIRAUSER10000', 'nobody'], startDate: '2026-12-01', endDate: '2026-12-02', daily: true });

    expect(sent()).toMatchObject({ method: 'POST' });
    expect(sent().body).toEqual({ userKeys: ['JIRAUSER10000', 'nobody'], startDate: '2026-12-01', endDate: '2026-12-02', provideDailyValues: true });
    expect(result.data.capacityInSeconds).toEqual([{ userKey: 'JIRAUSER10000', dailyValues: [28800, 14400], sum: 43200, hours: 12 }]);
    expect(result.data.unknownUserKeys).toEqual(['nobody']);
  });

  it('refuses a capacity request with no people or a badly written date', async () => {
    const tools = setup();

    await expect(tools.call('bigpicture_getCapacity', { userKeys: [], startDate: '2026-12-01', endDate: '2026-12-02' })).rejects.toThrow();
    await expect(tools.call('bigpicture_getCapacity', { userKeys: ['JIRAUSER10000'], startDate: '1.12.2026', endDate: '2026-12-02' })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('lists a page of the issues a box plans, with their Key and Summary as plain values by default', async () => {
    routeRequests({
      [`${BASE}/ppm/boxarea/task/scope`]: { taskInBoxes: [{ boxId: '2', tasks: [{ taskId: '11', childTaskIds: ['15'] }, { taskId: '12' }, { taskId: '13' }] }] },
      [`${BASE}/ppm/task/core/task/field/bulk`]: { tasksFields: [
        { taskId: '11', fields: [{ name: 'Key', value: { dataTypeId: 'STRING', value: 'PROJ-1' } }, { name: 'Summary', value: { dataTypeId: 'STRING', value: 'Checkout' } }] },
        { taskId: '12', fields: [{ name: 'Key', value: { dataTypeId: 'STRING', value: 'PROJ-2' } }] },
      ] },
    });

    const result = await setup().callJson('bigpicture_getBoxIssues', { boxId: '2', limit: 2 });

    expect(sent(0)).toMatchObject({ method: 'POST', body: { boxIds: ['2'] } });
    expect(sent(1)).toMatchObject({ method: 'POST', body: { taskIdOrExtPlatformTaskKeys: ['11', '12'], fieldNames: ['Key', 'Summary'] } });
    expect(result.data).toEqual({
      boxId: '2', total: 3, startAt: 0,
      issues: [
        { taskId: '11', fields: { Key: 'PROJ-1', Summary: 'Checkout' }, childTaskIds: ['15'] },
        { taskId: '12', fields: { Key: 'PROJ-2' } },
      ],
    });
  });

  it('reads the fields asked for from where the page starts, keeping richer values as objects', async () => {
    routeRequests({
      [`${BASE}/ppm/boxarea/task/scope`]: { taskInBoxes: [{ boxId: '2', tasks: [{ taskId: '11' }, { taskId: '12' }] }] },
      [`${BASE}/ppm/task/core/task/field/bulk`]: { tasksFields: [{ taskId: '12', fields: [
        { name: 'Story Points', value: { dataTypeId: 'NUMBER', number: 5 } },
        { name: 'Assignee', value: { dataTypeId: 'USER', key: 'JIRAUSER10000', name: 'Dana' } },
      ] }] },
    });

    const result = await setup().callJson('bigpicture_getBoxIssues', { boxId: '2', startAt: 1, fieldNames: ['Story Points', 'Assignee'] });

    expect(sent(1).body).toEqual({ taskIdOrExtPlatformTaskKeys: ['12'], fieldNames: ['Story Points', 'Assignee'] });
    expect(result.data.issues).toEqual([{ taskId: '12', fields: { 'Story Points': 5, Assignee: { key: 'JIRAUSER10000', name: 'Dana' } } }]);
  });

  it('reads no fields for a box that plans nothing', async () => {
    routeRequests({ [`${BASE}/ppm/boxarea/task/scope`]: { taskInBoxes: [{ boxId: '2', tasks: [] }] } });

    const result = await setup().callJson('bigpicture_getBoxIssues', { boxId: '2' });

    expect(result.data).toEqual({ boxId: '2', total: 0, startAt: 0, issues: [] });
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('explains a 404 in terms of the subject and BigPicture', async () => {
    routeRequests({ [`${BASE}/ppm/box/boxes/{boxId}`]: Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('bigpicture_getBox', { boxId: '99' });

    expect(result.error).toContain('Box 99 was not found (404)');
  });
});
