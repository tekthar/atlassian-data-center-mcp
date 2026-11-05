import { isToolAllowed, resolveToolPolicy, type ToolCatalog, type ToolPolicy } from '@atlassian-dc-mcp/common';
import { MypermissionsService } from '../jira-client/index.js';
import { applyJiraPermissionFilter, reportToolsHiddenByPermission } from '../permissions.js';

jest.mock('../jira-client/index.js', () => ({
  MypermissionsService: { getPermissions: jest.fn() },
}));

const getPermissions = MypermissionsService.getPermissions as jest.Mock;

const catalog: ToolCatalog = {
  toolsets: {
    issues: { description: 'Issues', default: true },
    versions: { description: 'Versions', default: true },
    worklog: { description: 'Worklog', default: false },
  },
  tools: {
    getIssue: { toolset: 'issues', access: 'read' },
    deleteIssue: { toolset: 'issues', access: 'destructive', anyOfPermissions: ['DELETE_ISSUES'] },
    editComment: { toolset: 'issues', access: 'write', anyOfPermissions: ['EDIT_OWN_COMMENTS', 'EDIT_ALL_COMMENTS'] },
    createVersion: { toolset: 'versions', access: 'write', anyOfPermissions: ['ADMINISTER_PROJECTS', 'ADMINISTER'] },
    addWorklog: { toolset: 'worklog', access: 'write', anyOfPermissions: ['WORK_ON_ISSUES'] },
  },
};

const REPORTED_KEYS = ['DELETE_ISSUES', 'EDIT_OWN_COMMENTS', 'EDIT_ALL_COMMENTS', 'ADMINISTER_PROJECTS', 'ADMINISTER', 'WORK_ON_ISSUES'];

const cancelable = <T>(promise: Promise<T>) => Object.assign(promise, { cancel: jest.fn() });

const answer = (granted: string[]) => cancelable(Promise.resolve({
  permissions: Object.fromEntries(REPORTED_KEYS.map((key) => [key, { key, type: 'PROJECT', havePermission: granted.includes(key) }])),
}));

const failure = (status: number, statusText: string) =>
  cancelable(Promise.reject(Object.assign(new Error(statusText), { status, statusText, body: {} })));

const allowed = (policy: ToolPolicy) =>
  Object.entries(catalog.tools).filter(([name, entry]) => isToolAllowed(name, entry, policy)).map(([name]) => name);

async function run(env: Record<string, string> = {}, timeoutMs?: number) {
  const warn = jest.fn();
  const policy = await applyJiraPermissionFilter(catalog, resolveToolPolicy(catalog, env, () => undefined), { env, warn, timeoutMs });
  return { tools: allowed(policy), messages: warn.mock.calls.map(([message]) => String(message)) };
}

describe('applyJiraPermissionFilter', () => {
  beforeEach(() => jest.resetAllMocks());

  it('hides the gated tools the user lacks, without a warning', async () => {
    getPermissions.mockImplementation(() => answer(['EDIT_OWN_COMMENTS']));

    const { tools, messages } = await run();

    expect(tools).toEqual(['getIssue', 'editComment']);
    expect(getPermissions).toHaveBeenCalledWith(undefined, undefined);
    expect(messages).toEqual([]);
  });

  it('lets a Jira administrator manage versions without project admin rights', async () => {
    getPermissions.mockImplementation(() => answer(['ADMINISTER']));

    expect((await run()).tools).toContain('createVersion');
  });

  it('asks once per listed project and combines the answers', async () => {
    getPermissions.mockImplementation((_issueId: unknown, projectKey: string) =>
      answer(projectKey === 'ACS' ? ['DELETE_ISSUES'] : ['EDIT_ALL_COMMENTS']));

    const { tools } = await run({ JIRA_PERMISSION_PROJECTS: 'ACS, BPO' });

    expect(getPermissions.mock.calls).toEqual([[undefined, 'ACS'], [undefined, 'BPO']]);
    expect(tools).toEqual(['getIssue', 'deleteIssue', 'editComment']);
  });

  it('ignores a listed project Jira cannot answer for', async () => {
    getPermissions.mockImplementation((_issueId: unknown, projectKey: string) =>
      projectKey === 'ACS' ? answer(['DELETE_ISSUES']) : failure(404, 'Not Found'));

    const { tools, messages } = await run({ JIRA_PERMISSION_PROJECTS: 'ACS,NOPE' });

    expect(tools).toEqual(['getIssue', 'deleteIssue']);
    expect(messages[0]).toContain('project NOPE (404 Not Found)');
  });

  it('hides only admin tools when Jira cannot be asked', async () => {
    getPermissions.mockImplementation(() => failure(401, 'Unauthorized'));

    const { tools, messages } = await run();

    expect(tools).toEqual(['getIssue', 'deleteIssue', 'editComment']);
    expect(messages[0]).toContain('Could not read your Jira permissions (401 Unauthorized)');
  });

  it('gives up after the timeout and cancels the request', async () => {
    const pending = cancelable(new Promise<never>(() => undefined));
    getPermissions.mockReturnValue(pending);

    const { tools, messages } = await run({}, 10);

    expect(pending.cancel).toHaveBeenCalled();
    expect(tools).toEqual(['getIssue', 'deleteIssue', 'editComment']);
    expect(messages[0]).toContain('no answer within 10 ms');
  });

  it('does not ask Jira when PERMISSION_FILTER is off', async () => {
    const { tools } = await run({ PERMISSION_FILTER: 'off' });

    expect(getPermissions).not.toHaveBeenCalled();
    expect(tools).toEqual(['getIssue', 'deleteIssue', 'editComment', 'createVersion']);
  });

  it('does not ask Jira when no selected tool needs a permission', async () => {
    const { tools } = await run({ READ_ONLY_MODE: 'true' });

    expect(getPermissions).not.toHaveBeenCalled();
    expect(tools).toEqual(['getIssue']);
  });
});

describe('reportToolsHiddenByPermission', () => {
  it('names the hidden tools in one line', () => {
    const warn = jest.fn();

    reportToolsHiddenByPermission(['jira_deleteIssue', 'jira_createVersion'], warn);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hid 2 Jira tools: jira_deleteIssue, jira_createVersion.'));
  });

  it('stays quiet when nothing was hidden', () => {
    const warn = jest.fn();

    reportToolsHiddenByPermission([], warn);

    expect(warn).not.toHaveBeenCalled();
  });
});
