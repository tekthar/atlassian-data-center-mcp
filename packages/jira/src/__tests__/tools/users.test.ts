import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { MyselfService, UserService } from '../../jira-client/index.js';
import { registerUserTools } from '../../tools/users.js';

jest.mock('../../jira-client/index.js', () => ({
  MyselfService: { getUser: jest.fn() },
  UserService: { getUser1: jest.fn(), findUsers: jest.fn(), findAssignableUsers1: jest.fn() },
}));

const mocked = {
  getMyself: MyselfService.getUser as jest.Mock,
  getUser: UserService.getUser1 as jest.Mock,
  findUsers: UserService.findUsers as jest.Mock,
  findAssignable: UserService.findAssignableUsers1 as jest.Mock,
};

const jdoe = {
  self: 'https://jira.example.com/rest/api/2/user?username=jdoe',
  name: 'jdoe',
  key: 'JIRAUSER10100',
  displayName: 'Jane Doe',
  emailAddress: 'jane.doe@example.com',
  active: true,
  timeZone: 'Asia/Riyadh',
  avatarUrls: { '48x48': 'https://jira.example.com/avatar' },
};

const shaped = {
  name: 'jdoe',
  key: 'JIRAUSER10100',
  displayName: 'Jane Doe',
  emailAddress: 'jane.doe@example.com',
  active: true,
  timeZone: 'Asia/Riyadh',
};

const notFound = Object.assign(new Error('Not Found'), { status: 404, statusText: 'Not Found', body: {} });

function setup() {
  const recorder = createRecordingRegistrar();
  registerUserTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('jira user tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers both tools', () => {
    expect(setup().registrar.registeredTools()).toEqual(['jira_getUserProfile', 'jira_searchAssignableUsers']);
  });

  it("resolves 'me' to the authenticated user", async () => {
    mocked.getMyself.mockResolvedValue(jdoe);

    expect(await setup().callJson('jira_getUserProfile', { userIdentifier: 'me' })).toEqual({ success: true, data: shaped });
    expect(mocked.getUser).not.toHaveBeenCalled();
  });

  it('looks a user up by username first', async () => {
    mocked.getUser.mockResolvedValue(jdoe);

    await setup().callJson('jira_getUserProfile', { userIdentifier: 'jdoe' });

    expect(mocked.getUser).toHaveBeenCalledWith(false, undefined, 'jdoe');
  });

  it('falls back to the user key, then to an exact email match', async () => {
    mocked.getUser.mockRejectedValue(notFound);
    mocked.findUsers.mockResolvedValue([{ ...jdoe, emailAddress: 'other@example.com' }, jdoe]);

    const result = await setup().callJson('jira_getUserProfile', { userIdentifier: 'Jane.Doe@example.com' });

    expect(mocked.getUser).toHaveBeenNthCalledWith(2, false, 'Jane.Doe@example.com');
    expect(result).toEqual({ success: true, data: shaped });
  });

  it('reports a failure when nothing matches', async () => {
    mocked.getUser.mockRejectedValue(notFound);
    mocked.findUsers.mockResolvedValue([]);

    const result = await setup().call('jira_getUserProfile', { userIdentifier: 'ghost' });

    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('No Jira user matches "ghost"');
  });

  it('does not hide errors other than 404', async () => {
    mocked.getUser.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403, statusText: 'Forbidden', body: {} }));

    const result = await setup().callJson('jira_getUserProfile', { userIdentifier: 'jdoe' });

    expect(result.error).toBe('Error fetching user profile: 403 Forbidden');
    expect(mocked.findUsers).not.toHaveBeenCalled();
  });

  it('searches assignable users within an issue and shapes them', async () => {
    mocked.findAssignable.mockResolvedValue([jdoe]);

    const result = await setup().callJson('jira_searchAssignableUsers', { query: 'jane', issueKey: 'ACS-1' });

    expect(mocked.findAssignable).toHaveBeenCalledWith('ACS-1', 20, undefined, undefined, 'jane');
    expect(result).toEqual({ success: true, data: [shaped] });
  });

  it('requires a project or an issue to scope the search', async () => {
    const result = await setup().call('jira_searchAssignableUsers', { query: 'jane' });

    expect(result.isError).toBe(true);
    expect(mocked.findAssignable).not.toHaveBeenCalled();
  });
});
