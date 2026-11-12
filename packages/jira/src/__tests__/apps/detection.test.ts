import { resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { request } from '../../jira-client/core/request.js';
import { detectJiraApps } from '../../apps/index.js';
import { JIRA_TOOL_CATALOG } from '../../tool-catalog.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

const answer = (outcome: () => unknown) =>
  new CancelablePromise((resolve, reject) => {
    try {
      resolve(outcome());
    } catch (error) {
      reject(error);
    }
  });

const apiError = (status: number, statusText: string) => Object.assign(new Error(statusText), { status, statusText });

const XRAY_PROBE = '/raven/1.0/api/settings/teststatuses';
const SCRIPTRUNNER_PROBE = '/scriptrunner-jira/latest/jqlfunctions/docs';
const DRAWIO_PROBE = '/drawio/1.0/library/list';
const NOT_FOUND = () => { throw apiError(404, 'Not Found'); };

/** Answer each app's check by its URL. */
function answerProbes(outcomes: Record<string, () => unknown>) {
  mockedRequest.mockImplementation((_config: unknown, options: { url: string }) => answer(outcomes[options.url]));
}

const probedUrls = () => mockedRequest.mock.calls.map((call) => (call[1] as { url: string }).url).sort();

const policy = (env: Record<string, string> = {}) => resolveToolPolicy(JIRA_TOOL_CATALOG, env, () => undefined);

async function detect(env: Record<string, string>, timeoutMs = 50) {
  const warnings: string[] = [];
  const apps = await detectJiraApps(policy(env), { env, warn: (message) => warnings.push(message), timeoutMs });
  return { ids: apps.map((app) => app.id), warnings };
}

describe('detectJiraApps', () => {
  beforeEach(() => jest.resetAllMocks());

  it('asks each app for something cheap when JIRA_APPS is unset, and offers the apps that answer', async () => {
    answerProbes({ [XRAY_PROBE]: () => [{ name: 'PASS' }], [SCRIPTRUNNER_PROBE]: () => ({}), [DRAWIO_PROBE]: () => [] });

    expect(await detect({})).toEqual({ ids: ['xray', 'scriptrunner', 'drawio'], warnings: [] });
    expect(probedUrls()).toEqual([XRAY_PROBE, SCRIPTRUNNER_PROBE, DRAWIO_PROBE].sort());
    expect(mockedRequest.mock.calls.every((call) => call[1].method === 'GET')).toBe(true);
  });

  it('offers only the apps that are installed', async () => {
    answerProbes({ [XRAY_PROBE]: NOT_FOUND, [SCRIPTRUNNER_PROBE]: () => ({}), [DRAWIO_PROBE]: NOT_FOUND });

    expect(await detect({})).toEqual({ ids: ['scriptrunner'], warnings: [] });
  });

  it('leaves the apps out quietly when the instance answers 404', async () => {
    mockedRequest.mockReturnValue(answer(() => { throw apiError(404, 'Not Found'); }));

    expect(await detect({ JIRA_APPS: 'auto' })).toEqual({ ids: [], warnings: [] });
  });

  it('leaves an app out with a warning when its check fails another way', async () => {
    answerProbes({ [XRAY_PROBE]: () => { throw apiError(500, 'Server Error'); }, [SCRIPTRUNNER_PROBE]: NOT_FOUND, [DRAWIO_PROBE]: NOT_FOUND });

    const { ids, warnings } = await detect({});

    expect(ids).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining('Could not check whether Xray is installed (500 Server Error)')]);
    expect(warnings[0]).toContain('Set JIRA_APPS=xray');
  });

  it('gives up on an instance that doesn\'t answer in time', async () => {
    mockedRequest.mockReturnValue(new CancelablePromise(() => undefined));

    const { ids, warnings } = await detect({}, 20);

    expect(ids).toEqual([]);
    expect(warnings[0]).toContain('no answer within 20 ms');
  });

  it('offers named apps without checking, and warns about unknown names', async () => {
    expect(await detect({ JIRA_APPS: 'xray, ScriptRunner, zephyr' })).toEqual({
      ids: ['xray', 'scriptrunner'],
      warnings: [expect.stringContaining('Ignoring unknown app "zephyr"')],
    });
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('offers no apps with JIRA_APPS=off', async () => {
    expect((await detect({ JIRA_APPS: 'off' })).ids).toEqual([]);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('skips the check when the policy could not offer any app tool', async () => {
    expect((await detect({ ENABLED_TOOLS: 'jira_getIssue' })).ids).toEqual([]);
    expect((await detect({ TOOL_GATEWAY: 'off' })).ids).toEqual([]);
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});
