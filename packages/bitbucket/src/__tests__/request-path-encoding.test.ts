import { request } from '../bitbucket-client/core/request.js';
import type { OpenAPIConfig } from '../bitbucket-client/core/OpenAPI.js';

const config: OpenAPIConfig = {
  BASE: 'https://bitbucket.example.com/rest',
  VERSION: 'latest',
  WITH_CREDENTIALS: false,
  CREDENTIALS: 'include',
};

const PR_URL = '/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}';

describe('bitbucket request path encoding', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn(async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function reopen(pullRequestId: string) {
    return request(config, {
      method: 'POST',
      url: `${PR_URL}/reopen`,
      path: { projectKey: 'APP', repositorySlug: 'web', pullRequestId },
      query: { version: '3' },
      body: { version: 3 },
      mediaType: 'application/json',
    });
  }

  it('cannot turn a reopen into a merge or a decline', async () => {
    await reopen('7/merge?version=3#');
    await reopen('7/decline?version=3#');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://bitbucket.example.com/rest/api/latest/projects/APP/repos/web/pull-requests/7%2Fmerge%3Fversion%3D3%23/reopen?version=3',
      'https://bitbucket.example.com/rest/api/latest/projects/APP/repos/web/pull-requests/7%2Fdecline%3Fversion%3D3%23/reopen?version=3',
    ]);
  });

  it('refuses a pull request id that climbs into another repository', async () => {
    await expect(reopen('../../../../OPS/repos/infra/pull-requests/9')).rejects.toThrow('Refusing path parameter "pullRequestId"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps slashes in file paths and encodes each segment', async () => {
    await request(config, {
      method: 'GET',
      url: '/api/latest/projects/{projectKey}/repos/{repositorySlug}/browse/{path}',
      path: { projectKey: 'APP', repositorySlug: 'web', path: 'src/main/a b#.ts' },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://bitbucket.example.com/rest/api/latest/projects/APP/repos/web/browse/src/main/a%20b%23.ts',
    );
  });

  it('refuses dot segments in file paths', async () => {
    await expect(request(config, {
      method: 'GET',
      url: '/api/latest/projects/{projectKey}/repos/{repositorySlug}/browse/{path}',
      path: { projectKey: 'APP', repositorySlug: 'web', path: 'src/../../secret' },
    })).rejects.toThrow('Refusing path parameter "path"');
  });
});
