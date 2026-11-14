import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { BIGPICTURE_CATALOG } from '../../apps/bigpicture/catalog.js';
import { DEFAULT_BOX_ICON } from '../../apps/bigpicture/write-operations.js';
import { registerBigPictureWriteTools } from '../../apps/bigpicture/write-tools.js';

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

const sent = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;
const BASE = '/softwareplant-bigpicture/1.0/public';

function setup() {
  const recorder = createRecordingRegistrar();
  registerBigPictureWriteTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('BigPicture write tools', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedRequest.mockResolvedValue(undefined);
  });

  it('registers every catalogued write tool, gating only the issue field write on a Jira permission', () => {
    const changes = Object.entries(BIGPICTURE_CATALOG.tools).filter(([, entry]) => entry.access !== 'read');

    expect(setup().registrar.registeredTools().sort()).toEqual(changes.map(([name]) => name).sort());
    expect(BIGPICTURE_CATALOG.tools.bigpicture_updateIssueField.anyOfPermissions).toEqual(['EDIT_ISSUES']);
    expect(BIGPICTURE_CATALOG.tools.bigpicture_removeTeamMember.access).toBe('destructive');
  });

  it.each([
    ['DATE', '2026-11-16', '{"value":"2026-11-16"}'],
    ['STRING', 'At risk', '{"value":"At risk"}'],
    ['BOOLEAN', true, '{"value":true}'],
    ['NUMBER', 5, '{"number":5}'],
    ['PERCENTAGE', 40, '{"number":40}'],
    ['USER', { dataTypeId: 'USER', key: 'JIRAUSER10000' }, '{"dataTypeId":"USER","key":"JIRAUSER10000"}'],
  ])('sends a %s field value as the JSON of its value object', async (dataType, value, fieldValue) => {
    const result = await setup().callJson('bigpicture_updateIssueField', { issueKey: 'PROJ-12', fieldName: 'Field', dataType, value });

    expect(sent()).toMatchObject({
      method: 'PUT', url: `${BASE}/ppm/task/core/task/{issueKey}/field`, path: { issueKey: 'PROJ-12' },
      body: { fieldName: 'Field', fieldValue, dataTypeId: dataType },
    });
    expect(result.data).toEqual({ updated: true, issueKey: 'PROJ-12', fieldName: 'Field' });
  });

  it.each([
    ['NUMBER', '5', 'A NUMBER value must be a number.'],
    ['DATE', '16/11/2026', 'A DATE value must be a date such as "2026-11-16".'],
    ['BOOLEAN', 'yes', 'A BOOLEAN value must be true or false.'],
    ['USER', 'JIRAUSER10000', 'Give the value of a USER field as an object'],
  ])('refuses a plain %s value of the wrong kind without calling BigPicture', async (dataType, value, error) => {
    const result = await setup().callJson('bigpicture_updateIssueField', { issueKey: 'PROJ-12', fieldName: 'Field', dataType, value });

    expect(result.error).toContain(error);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('adds a box under its parent with BigPicture\'s field names, and its default icon when none is given', async () => {
    mockedRequest.mockResolvedValue({ createdBoxId: '31' });
    const tools = setup();
    const box = { parentBoxId: '2', boxTypeId: 'PROJECT', name: 'Checkout revamp', startDate: '2026-12-01', endDate: '2027-02-26' };

    const result = await tools.callJson('bigpicture_addBox', box);
    await tools.callJson('bigpicture_addBox', { ...box, iconId: 'font-awesome-rocket@blue' });

    expect(sent(0)).toMatchObject({ method: 'POST', url: `${BASE}/ppm/box` });
    expect(sent(0).body).toEqual({
      parentBoxId: '2', boxTypeId: 'PROJECT', boxName: 'Checkout revamp', boxStartDate: '2026-12-01', boxEndDate: '2027-02-26', boxIconId: DEFAULT_BOX_ICON,
    });
    expect(sent(1).body?.boxIconId).toBe('font-awesome-rocket@blue');
    expect(result.data).toEqual({ createdBoxId: '31' });
  });

  it('refuses box dates and icons in the wrong format before calling BigPicture', async () => {
    const tools = setup();
    const box = { parentBoxId: '2', boxTypeId: 'PROJECT', name: 'Box', startDate: '2026-12-01', endDate: '2027-02-26' };

    await expect(tools.call('bigpicture_addBox', { ...box, startDate: '01/12/2026' })).rejects.toThrow();
    await expect(tools.call('bigpicture_addBox', { ...box, iconId: 'rocket' })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('adds and changes a team membership period, leaving out what isn\'t given', async () => {
    const tools = setup();

    await tools.callJson('bigpicture_addTeamMember', { teamId: 7, boxId: '2', individualId: 'EXT_USER@1@JIRAUSER10000', startDate: '2026-12-01', percentageAvailability: 50 });
    await tools.callJson('bigpicture_addTeamMember', { teamId: 8, individualId: 'EXT_USER@1@JIRAUSER10001', startDate: '2026-12-01' });
    await tools.callJson('bigpicture_updateTeamMember', { teamId: 7, boxId: '2', individualId: 'EXT_USER@1@JIRAUSER10000', startDate: '2026-12-01', newStartDate: '2026-12-08' });

    expect(sent(0)).toMatchObject({ method: 'POST', url: `${BASE}/ppm/team/{teamId}/memberships`, path: { teamId: 7 } });
    expect(sent(0).body).toEqual({ boxId: '2', membership: { individualId: 'EXT_USER@1@JIRAUSER10000', startDate: '2026-12-01', percentageAvailability: 50 } });
    expect(sent(1).body).toEqual({ membership: { individualId: 'EXT_USER@1@JIRAUSER10001', startDate: '2026-12-01' } });
    expect(sent(2)).toMatchObject({ method: 'PUT', path: { teamId: 7 } });
    expect(sent(2).body).toEqual({ boxId: '2', membership: { individualId: 'EXT_USER@1@JIRAUSER10000', startDate: '2026-12-01', newStartDate: '2026-12-08' } });
  });

  it('refuses an availability over 100 percent', async () => {
    await expect(setup().call('bigpicture_addTeamMember', { teamId: 7, individualId: 'EXT_USER@1@JIRAUSER10000', startDate: '2026-12-01', percentageAvailability: 150 }))
      .rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('removes a team member by individualId, in the team\'s box', async () => {
    await setup().callJson('bigpicture_removeTeamMember', { teamId: 7, boxId: '2', individualId: 'EXT_USER@1@JIRAUSER10000' });

    expect(sent()).toMatchObject({
      method: 'DELETE', url: `${BASE}/ppm/team/{teamId}/memberships/{individualId}`,
      path: { teamId: 7, individualId: 'EXT_USER@1@JIRAUSER10000' }, query: { boxId: '2' },
    });
  });

  it('explains a 404 in terms of the team and BigPicture', async () => {
    mockedRequest.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    const result = await setup().callJson('bigpicture_addTeamMember', { teamId: 99, individualId: 'EXT_USER@1@JIRAUSER10000', startDate: '2026-12-01' });

    expect(result.error).toContain('Team 99 was not found (404)');
  });
});
