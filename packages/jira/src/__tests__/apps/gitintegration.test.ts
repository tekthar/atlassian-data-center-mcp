import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { GIT_INTEGRATION_CATALOG } from '../../apps/gitintegration/catalog.js';
import { registerGitIntegrationReadTools } from '../../apps/gitintegration/read-tools.js';

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

const BASE = '/gitplugin/1.0';

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    const route = routes[options.url];
    if (route === undefined) throw new Error(`Unexpected request to ${options.url}`);
    if (route instanceof Error) throw route;
    return route;
  });
}

const sentTo = (url: string) => mockedRequest.mock.calls.map((call) => call[1] as RequestOptions).filter((options) => options.url === url);

function setup() {
  const recorder = createRecordingRegistrar();
  registerGitIntegrationReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const COMMIT = {
  revision: '9f2c1e4b7a', message: 'PROJ-12 Fix the SSO redirect loop\n', createdAt: 1764240000000,
  author: { name: 'Anna Berg', email: 'anna@example.com' }, repositoryId: 3, mergeCommit: false, notes: [], branches: ['PROJ-12-sso'],
  files: [
    { path: 'src/login.ts', linesAdded: 12, linesChanged: 0, linesDeleted: 4, added: false, deleted: false },
    { path: 'src/sso.ts', linesAdded: 40, linesChanged: 0, linesDeleted: 0, added: true, deleted: false },
  ],
};

describe('Git Integration for Jira tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all reading, in a toolset that is off by default', () => {
    expect(Object.keys(GIT_INTEGRATION_CATALOG.tools)).toHaveLength(4);
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(GIT_INTEGRATION_CATALOG.tools).sort());
    expect(Object.values(GIT_INTEGRATION_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(GIT_INTEGRATION_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('gets an issue\'s commits a page at a time, with dates and changed files', async () => {
    routeRequests({ [`${BASE}/issues/{issueKey}/commits`]: { items: [COMMIT], total: 3, offset: 0, limit: 1, hasMore: true } });

    const result = await setup().callJson('gitintegration_getIssueCommits', { issueKey: 'PROJ-12', withFiles: true, limit: 1 });

    expect(sentTo(`${BASE}/issues/{issueKey}/commits`)[0]).toMatchObject({ path: { issueKey: 'PROJ-12' }, query: { showFiles: true, offset: 0, limit: 1 } });
    expect(result.data).toEqual({
      issueKey: 'PROJ-12',
      total: 3,
      offset: 0,
      nextOffset: 1,
      commits: [{
        revision: '9f2c1e4b7a', message: 'PROJ-12 Fix the SSO redirect loop', author: 'Anna Berg', authorEmail: 'anna@example.com',
        date: '2025-11-27T10:40:00.000Z', repositoryId: 3, branches: ['PROJ-12-sso'],
        files: [
          { path: 'src/login.ts', change: 'modified', linesAdded: 12, linesDeleted: 4 },
          { path: 'src/sso.ts', change: 'added', linesAdded: 40, linesDeleted: 0 },
        ],
      }],
    });
  });

  it('reads a merge commit and deleted files under either JSON spelling', async () => {
    routeRequests({ [`${BASE}/issues/{issueKey}/commits`]: { items: [{ ...COMMIT, mergeCommit: undefined, isMergeCommit: true, files: [{ path: 'old.ts', isDeleted: true }] }], total: 1 } });

    const result = await setup().callJson('gitintegration_getIssueCommits', { issueKey: 'PROJ-12' });

    expect(result.data.commits[0]).toMatchObject({ mergeCommit: true, files: [{ path: 'old.ts', change: 'deleted' }] });
    expect(result.data).not.toHaveProperty('nextOffset');
  });

  it('gets an issue\'s branches by repository, as GitKraken documents the answer', async () => {
    routeRequests({
      [`${BASE}/issuegitdetails/issue/{issueKey}`]: {
        commitCount: 53,
        repositories: [{
          repoId: 12718, repoName: 'test-repo', isGitViewerEnabled: true, isRepoApiEnabled: true,
          branches: [{
            name: 'TEST-435-branch-001', gkBranchUrl: 'gitkraken://repolink/x', glBranchUrl: 'vscode://x', isAheadBehindPresented: true,
            ahead: 2, behind: 6448, externalUrl: 'https://github.com/WilyCoyote/test-repo/tree/TEST-435-branch-001',
          }],
        }],
        enableBranchCreation: true, gkEnabled: true, glEnabled: true, notAllPermissions: false,
      },
    });

    const result = await setup().callJson('gitintegration_getIssueBranches', { issueKey: 'TEST-435' });

    expect(result.data).toEqual({
      issueKey: 'TEST-435',
      commitCount: 53,
      repositories: [{
        repositoryId: 12718, repository: 'test-repo',
        branches: [{ name: 'TEST-435-branch-001', ahead: 2, behind: 6448, url: 'https://github.com/WilyCoyote/test-repo/tree/TEST-435-branch-001' }],
      }],
    });
  });

  it('gets an issue\'s pull and merge requests together', async () => {
    routeRequests({
      [`${BASE}/issuegitdetails/issue/{issueKey}/pullRequest`]: {
        pullRequests: { isGroupAvailable: true, items: [{
          id: '42', state: 'OPEN', title: 'Fix SSO loop', description: 'Long text'.repeat(200), baseBranch: 'main', compareBranch: 'PROJ-12-sso',
          url: 'https://github.com/acme/web/pull/42', repository: { id: 3, name: 'web' }, author: { name: 'Anna Berg', username: 'anna' },
          reviewers: [{ name: 'Bo Lin', username: 'bo' }], timeline: [],
        }] },
        mergeRequests: { isGroupAvailable: true, items: [{ id: '7', state: 'MERGED', title: 'Docs', baseBranch: 'main', compareBranch: 'docs', repository: { id: 4, name: 'docs' }, author: { username: 'carl' } }] },
      },
    });

    const result = await setup().callJson('gitintegration_getIssuePullRequests', { issueKey: 'PROJ-12' });

    expect(result.data.pullRequests).toHaveLength(2);
    expect(result.data.pullRequests[0]).toMatchObject({
      id: '42', title: 'Fix SSO loop', state: 'OPEN', from: 'PROJ-12-sso', to: 'main', repository: 'web', author: 'Anna Berg', reviewers: ['Bo Lin'],
      url: 'https://github.com/acme/web/pull/42',
    });
    expect(result.data.pullRequests[0].description).toHaveLength(1000);
    expect(result.data.pullRequests[1]).toMatchObject({ id: '7', state: 'MERGED', author: 'carl', reviewers: [] });
  });

  it('lists repositories in short form, keeping no credentials, even in the origin URL', async () => {
    routeRequests({
      [`${BASE}/repository`]: {
        items: [{
          id: 3, displayName: 'web', group: 'acme', origin: 'https://deploy:s3cret@github.com/acme/web.git', mainBranch: 'main',
          integrationType: 'GITHUB', disabled: false, lastIndexedDate: 1764240000000, indexStatus: 'INDEXED',
          password: 's3cret', pat: 'ghp_x', githubAppSecret: 'x', githubAppPem: 'x', githubAppClientSecret: 'x', githubAppWebhookSecret: 'x', username: 'deploy',
        }, { id: 4, displayName: 'docs', origin: 'git@gitlab.example.com:acme/docs.git' }],
        total: 2, offset: 0, limit: 50,
      },
    });

    const result = await setup().callJson('gitintegration_getRepositories', { projectKey: 'PROJ' });

    expect(sentTo(`${BASE}/repository`)[0].query).toEqual({ projectKey: 'PROJ', short: true, offset: 0, limit: 50 });
    expect(result.data.repositories).toEqual([
      { id: 3, name: 'web', group: 'acme', origin: 'https://github.com/acme/web.git', mainBranch: 'main', hosting: 'GITHUB', lastIndexed: '2025-11-27T10:40:00.000Z', indexStatus: 'INDEXED' },
      { id: 4, name: 'docs', origin: 'git@gitlab.example.com:acme/docs.git' },
    ]);
    expect(JSON.stringify(result.data)).not.toMatch(/s3cret|ghp_x|deploy/);
  });

  it('explains a refusal in terms of the issue\'s project', async () => {
    routeRequests({ [`${BASE}/issues/{issueKey}/commits`]: Object.assign(new Error('Forbidden'), { status: 403 }) });

    const result = await setup().callJson('gitintegration_getIssueCommits', { issueKey: 'PROJ-12' });

    expect(result.error).toContain('Git Integration refused this (403)');
  });
});
