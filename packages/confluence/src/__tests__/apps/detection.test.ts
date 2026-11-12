import { resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { CancelablePromise } from '../../confluence-client/core/CancelablePromise.js';
import { request } from '../../confluence-client/core/request.js';
import { detectConfluenceApps } from '../../apps/index.js';
import { CONFLUENCE_TOOL_CATALOG } from '../../tool-catalog.js';

jest.mock('../../confluence-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

const answer = (outcome: () => unknown) => new CancelablePromise((resolve, reject) => {
  try {
    resolve(outcome());
  } catch (error) {
    reject(error);
  }
});

async function detect(env: Record<string, string>) {
  const warnings: string[] = [];
  const policy = resolveToolPolicy(CONFLUENCE_TOOL_CATALOG, env, () => undefined);
  const apps = await detectConfluenceApps(policy, { env, warn: (message) => warnings.push(message), timeoutMs: 50 });
  return { ids: apps.map((app) => app.id), warnings };
}

describe('detectConfluenceApps', () => {
  beforeEach(() => jest.resetAllMocks());

  it('asks draw.io for its editor config when CONFLUENCE_APPS is unset, and offers it when that works', async () => {
    mockedRequest.mockReturnValue(answer(() => ({})));

    expect(await detect({})).toEqual({ ids: ['drawio'], warnings: [] });
    expect(mockedRequest.mock.calls[0][1]).toMatchObject({ method: 'GET', url: '/rest/drawio/1.0/config' });
  });

  it('leaves draw.io out quietly when the instance answers 404, and with a warning on another error', async () => {
    mockedRequest.mockReturnValue(answer(() => { throw Object.assign(new Error('Not Found'), { status: 404 }); }));
    expect(await detect({})).toEqual({ ids: [], warnings: [] });

    mockedRequest.mockReturnValue(answer(() => { throw Object.assign(new Error('Bad Gateway'), { status: 502, statusText: 'Bad Gateway' }); }));
    const { warnings } = await detect({});
    expect(warnings).toEqual([expect.stringContaining('Could not check whether draw.io is installed (502 Bad Gateway)')]);
    expect(warnings[0]).toContain('Set CONFLUENCE_APPS=drawio');
  });

  it('offers named apps without checking, and none with CONFLUENCE_APPS=off', async () => {
    expect((await detect({ CONFLUENCE_APPS: 'drawio' })).ids).toEqual(['drawio']);
    expect((await detect({ CONFLUENCE_APPS: 'off' })).ids).toEqual([]);
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});
