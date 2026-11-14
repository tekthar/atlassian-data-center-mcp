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

  it('registers every catalogued tool, all read-only, in toolsets that are off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(BIGPICTURE_CATALOG.tools).sort());
    expect(Object.values(BIGPICTURE_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
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

  it('explains a 404 in terms of the subject and BigPicture', async () => {
    routeRequests({ [`${BASE}/ppm/box/boxes/{boxId}`]: Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('bigpicture_getBox', { boxId: '99' });

    expect(result.error).toContain('Box 99 was not found (404)');
  });
});
