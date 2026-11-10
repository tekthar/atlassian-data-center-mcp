import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { SCRIPTRUNNER_CATALOG } from '../../apps/scriptrunner/catalog.js';
import { registerScriptRunnerReadTools } from '../../apps/scriptrunner/read-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}

const apiError = (status: number, statusText: string) => Object.assign(new Error(statusText), { status, statusText, body: {} });

/** Answer each ScriptRunner URL template with a fixed response, or reject with an error. */
function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    const response = routes[options.url];
    if (response instanceof Error) throw response;
    return response;
  });
}

const sent = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;

function setup() {
  const recorder = createRecordingRegistrar();
  registerScriptRunnerReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const BUILT_IN_SCRIPTS = [
  { className: 'com.onresolve.scriptrunner.canned.jira.admin.CopyProject', name: 'Copy project', description: 'Copy a project', tags: ['project'], homePlugin: 'x', hideInitially: false },
  { className: 'com.onresolve.scriptrunner.canned.common.admin.ListScheduledJobs', name: 'List scheduled jobs', description: 'Lists jobs', tags: [] },
];

describe('ScriptRunner tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all read-only, in toolsets that are off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(SCRIPTRUNNER_CATALOG.tools).sort());
    expect(Object.values(SCRIPTRUNNER_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(SCRIPTRUNNER_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('lists the script roots with their file paths, marking directories when asked for them', async () => {
    routeRequests({
      '/scriptrunner/latest/idea/scriptroots': [{
        info: { rootPath: '/var/jira/scripts', defaultRoot: true },
        files: { 'com/acme': { isFile: false }, 'com/acme/Escalate.groovy': { isFile: true, lastModified: 1 } },
      }],
    });

    const result = await setup().callJson('scriptrunner_listScriptFiles', { includeDirectories: true });

    expect(sent()).toMatchObject({ method: 'GET', query: { showDirectories: true, groovyFilesOnly: false } });
    expect(result).toEqual({
      success: true,
      data: [{ rootPath: '/var/jira/scripts', defaultRoot: true, files: ['com/acme/', 'com/acme/Escalate.groovy'] }],
    });
  });

  it('reads a script file, decoding the base64 content ScriptRunner sends', async () => {
    const script = 'log.warn("héllo")\n';
    routeRequests({ '/scriptrunner/latest/idea/file': { content: Buffer.from(script).toString('base64'), rootPath: '/var/jira/scripts' } });

    const result = await setup().callJson('scriptrunner_getScriptFile', { rootPath: '/var/jira/scripts', filePath: 'Hello.groovy' });

    expect(sent()).toMatchObject({ method: 'GET', query: { rootPath: '/var/jira/scripts', filePath: 'Hello.groovy' } });
    expect(result).toEqual({ success: true, data: { rootPath: '/var/jira/scripts', filePath: 'Hello.groovy', content: script } });
  });

  it('lists built-in scripts with what the agent needs, filtered by text in their name, description or tags', async () => {
    routeRequests({ '/scriptrunner/latest/canned/available': BUILT_IN_SCRIPTS });

    const result = await setup().callJson('scriptrunner_listBuiltInScripts', { search: 'PROJECT' });

    expect(result).toEqual({
      success: true,
      data: [{ className: BUILT_IN_SCRIPTS[0].className, name: 'Copy project', description: 'Copy a project', tags: ['project'] }],
    });
  });

  it('asks for a built-in script\'s parameters with the values chosen so far, by its class name', async () => {
    routeRequests({ '/scriptrunner/latest/canned/{scriptName}/params': [{ name: 'FIELD_SOURCE_PROJECT', type: 'project' }] });
    const className = BUILT_IN_SCRIPTS[0].className;

    await setup().callJson('scriptrunner_getBuiltInScriptParams', { className, values: { FIELD_SOURCE_PROJECT: 'QA' } });
    await setup().callJson('scriptrunner_getBuiltInScriptParams', { className });

    expect(sent(0)).toMatchObject({ method: 'POST', path: { scriptName: className }, body: { FIELD_SOURCE_PROJECT: 'QA' } });
    expect(sent(1).body).toEqual({});
  });

  it('rejects a class name that isn\'t one before calling ScriptRunner', async () => {
    await expect(setup().call('scriptrunner_getBuiltInScriptParams', { className: '../../exec' }))
      .rejects.toThrow('Expected a class name from scriptrunner_listBuiltInScripts');
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('reads listeners and JQL function docs from the Jira API, and behaviours from theirs', async () => {
    routeRequests({
      '/scriptrunner-jira/latest/listeners': [],
      '/scriptrunner-jira/latest/jqlfunctions/docs': {},
      '/scriptrunner/behaviours/latest/admin/behaviour': [],
      '/scriptrunner/behaviours/latest/admin/behaviour/{id}': { id: '3' },
    });
    const tools = setup();

    await tools.callJson('scriptrunner_getListeners', {});
    await tools.callJson('scriptrunner_getJqlFunctions', {});
    await tools.callJson('scriptrunner_getBehaviours', {});
    await tools.callJson('scriptrunner_getBehaviours', { id: '3' });

    expect(mockedRequest.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'GET', 'GET', 'GET']);
    expect(sent(3).path).toEqual({ id: '3' });
  });

  it('explains a refusal in terms of who ScriptRunner lets in', async () => {
    routeRequests({ '/scriptrunner-jira/latest/listeners': apiError(403, 'Forbidden') });

    const result = await setup().callJson('scriptrunner_getListeners', {});

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('ScriptRunner refused this (403). Only Jira administrators') });
  });

  it('explains a 404 in terms of the subject and ScriptRunner', async () => {
    routeRequests({ '/scriptrunner/latest/idea/file': apiError(404, 'Not Found') });

    const result = await setup().callJson('scriptrunner_getScriptFile', { rootPath: '/r', filePath: 'Gone.groovy' });

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Script file Gone.groovy was not found (404)') });
  });
});
