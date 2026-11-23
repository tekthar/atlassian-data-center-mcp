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

  const DRAWIO_PROBE = '/rest/drawio/1.0/config';
  const GLIFFY_PROBE = '/rest/gliffy/1.0/transform/config';
  const notFound = () => { throw Object.assign(new Error('Not Found'), { status: 404 }); };

  /** Answer each app's check by its URL. */
  function answerProbes(outcomes: Record<string, () => unknown>) {
    mockedRequest.mockImplementation((_config: unknown, options: { url: string }) => answer(outcomes[options.url]));
  }

  it('asks draw.io for its editor config and Gliffy for its converters when CONFLUENCE_APPS is unset, and offers those that answer', async () => {
    answerProbes({ [DRAWIO_PROBE]: () => ({}), [GLIFFY_PROBE]: () => ({ transformers: [] }) });

    expect(await detect({})).toEqual({ ids: ['drawio', 'gliffy'], warnings: [] });
    expect(mockedRequest.mock.calls.map((call) => call[1])).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', url: DRAWIO_PROBE }),
      expect.objectContaining({ method: 'GET', url: GLIFFY_PROBE }),
    ]));
  });

  it('offers only the apps that are there', async () => {
    answerProbes({ [DRAWIO_PROBE]: notFound, [GLIFFY_PROBE]: () => ({}) });

    expect(await detect({})).toEqual({ ids: ['gliffy'], warnings: [] });
  });

  it('leaves an app out quietly when the instance answers 404, and with a warning on another error', async () => {
    answerProbes({ [DRAWIO_PROBE]: notFound, [GLIFFY_PROBE]: notFound });
    expect(await detect({})).toEqual({ ids: [], warnings: [] });

    answerProbes({ [DRAWIO_PROBE]: () => { throw Object.assign(new Error('Bad Gateway'), { status: 502, statusText: 'Bad Gateway' }); }, [GLIFFY_PROBE]: notFound });
    const { warnings } = await detect({});
    expect(warnings).toEqual([expect.stringContaining('Could not check whether draw.io is installed (502 Bad Gateway)')]);
    expect(warnings[0]).toContain('Set CONFLUENCE_APPS=drawio');
  });

  it('offers named apps without checking, and none with CONFLUENCE_APPS=off', async () => {
    expect((await detect({ CONFLUENCE_APPS: 'drawio' })).ids).toEqual(['drawio']);
    expect((await detect({ CONFLUENCE_APPS: 'gliffy, drawio' })).ids).toEqual(['drawio', 'gliffy']);
    expect((await detect({ CONFLUENCE_APPS: 'off' })).ids).toEqual([]);
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});
