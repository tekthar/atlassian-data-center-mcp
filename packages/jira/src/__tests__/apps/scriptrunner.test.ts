import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { SCRIPTRUNNER_CATALOG } from '../../apps/scriptrunner/catalog.js';
import { registerScriptRunnerReadTools } from '../../apps/scriptrunner/read-tools.js';
import { registerScriptRunnerOptInTools, SCRIPTRUNNER_OPT_IN_SETTINGS } from '../../apps/scriptrunner/opt-in-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  mediaType?: string;
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

const CONTEXT = { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 };

function setup() {
  const recorder = createRecordingRegistrar();
  registerScriptRunnerReadTools(recorder.registrar, CONTEXT);
  return recorder;
}

const ALL_OPT_INS_ON = Object.fromEntries(Object.values(SCRIPTRUNNER_OPT_IN_SETTINGS).map((name) => [name, 'true']));

function setupOptIns(env: Record<string, string> = ALL_OPT_INS_ON) {
  const recorder = createRecordingRegistrar();
  registerScriptRunnerOptInTools(recorder.registrar, CONTEXT, env);
  return recorder;
}

const BUILT_IN_SCRIPTS = [
  { className: 'com.onresolve.scriptrunner.canned.jira.admin.CopyProject', name: 'Copy project', description: 'Copy a project', tags: ['project'], homePlugin: 'x', hideInitially: false },
  { className: 'com.onresolve.scriptrunner.canned.common.admin.ListScheduledJobs', name: 'List scheduled jobs', description: 'Lists jobs', tags: [] },
];

describe('ScriptRunner tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued read tool, in toolsets that are off by default', () => {
    const readTools = Object.entries(SCRIPTRUNNER_CATALOG.tools).filter(([, entry]) => entry.access === 'read').map(([name]) => name);

    expect(setup().registrar.registeredTools().sort()).toEqual(readTools.sort());
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

  it.each([
    ['scriptrunner_getScriptedFields', '/scriptrunner-jira/latest/scriptfields', 'id'],
    ['scriptrunner_getScheduledJobs', '/scriptrunner/latest/scheduled-jobs', 'id'],
    ['scriptrunner_getRestEndpoints', '/scriptrunner/latest/custom/customadmin', 'id'],
    ['scriptrunner_getFragments', '/scriptrunner/latest/fragments', 'id'],
    ['scriptrunner_getWorkflowFunctions', '/scriptrunner-jira/latest/workflowFunctions', 'workflowName'],
  ])('%s lists every item from %s, or reads one', async (tool, url, key) => {
    routeRequests({ [url]: [{ id: 'a1' }], [`${url}/{${key}}`]: { id: 'a1' } });
    const tools = setup();

    expect(await tools.callJson(tool, {})).toEqual({ success: true, data: [{ id: 'a1' }] });
    expect(await tools.callJson(tool, { [key]: 'a1' })).toEqual({ success: true, data: { id: 'a1' } });
    expect(sent(0)).toMatchObject({ method: 'GET', url });
    expect(sent(1)).toMatchObject({ method: 'GET', url: `${url}/{${key}}`, path: { [key]: 'a1' } });
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

describe('ScriptRunner tools that run or save code', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers none of them unless their settings are on, and each only with its own setting', () => {
    expect(setupOptIns({}).registrar.registeredTools()).toEqual([]);
    expect(setupOptIns({ JIRA_SCRIPTRUNNER_CONSOLE_ENABLED: 'yes' }).registrar.registeredTools()).toEqual(['scriptrunner_runConsoleScript']);
    expect(setupOptIns({ JIRA_SCRIPTRUNNER_FILE_SAVE_ENABLED: 'false' }).registrar.registeredTools()).toEqual([]);
  });

  it('catalogues every one as destructive and for Jira administrators', () => {
    for (const name of Object.keys(SCRIPTRUNNER_OPT_IN_SETTINGS)) {
      expect(SCRIPTRUNNER_CATALOG.tools[name]).toMatchObject({ access: 'destructive', anyOfPermissions: ['ADMINISTER', 'SYSTEM_ADMIN'] });
    }
    expect(setupOptIns().registrar.registeredTools().sort()).toEqual(Object.keys(SCRIPTRUNNER_OPT_IN_SETTINGS).sort());
  });

  it('runs inline Groovy in the console, returning its output, log and time', async () => {
    routeRequests({ '/scriptrunner/latest/user/exec': { output: '42', snapshot: { log: 'WARN done', millisecondsTaken: 12, key: 'k' } } });

    const result = await setupOptIns().callJson('scriptrunner_runConsoleScript', { script: '6 * 7' });

    expect(sent()).toMatchObject({ method: 'POST', body: { script: '6 * 7' }, mediaType: 'application/json' });
    expect(result).toEqual({ success: true, data: { output: '42', log: 'WARN done', millisecondsTaken: 12 } });
  });

  it('runs a script file by its path instead', async () => {
    routeRequests({ '/scriptrunner/latest/user/exec': { output: 'null' } });

    await setupOptIns().callJson('scriptrunner_runConsoleScript', { scriptPath: 'com/acme/Fix.groovy' });

    expect(sent().body).toEqual({ scriptPath: 'com/acme/Fix.groovy' });
  });

  it('refuses a console run with both or neither of script and scriptPath', async () => {
    const tools = setupOptIns();

    expect(await tools.callJson('scriptrunner_runConsoleScript', {})).toEqual({ success: false, error: 'Give either script or scriptPath, not both.' });
    expect((await tools.callJson('scriptrunner_runConsoleScript', { script: '1', scriptPath: 'a.groovy' })).success).toBe(false);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('reports a failed script with its exception, the top of the stack trace and its log', async () => {
    const stackTrace = Array.from({ length: 40 }, (_, line) => `\tat frame${line}`).join('\n');
    routeRequests({
      '/scriptrunner/latest/user/exec': Object.assign(new Error('Internal Server Error'), {
        status: 500,
        statusText: 'Internal Server Error',
        body: { message: 'No such property: x', 'exception-class-name': 'MissingPropertyException', 'stack-trace': stackTrace, snapshot: { log: 'started' } },
      }),
    });

    const result = await setupOptIns().callJson('scriptrunner_runConsoleScript', { script: 'x' });

    expect(result).toMatchObject({
      success: false,
      error: 'Error running ScriptRunner console script: 500 Internal Server Error',
      details: { exception: 'MissingPropertyException', message: 'No such property: x', log: 'started' },
    });
    expect(result.details.stackTrace.split('\n')).toHaveLength(15);
  });

  it('runs a built-in script by class name with the values given', async () => {
    routeRequests({ '/scriptrunner/latest/canned/{scriptName}': { output: 'Copied' } });
    const className = 'com.onresolve.scriptrunner.canned.jira.admin.CopyProject';

    await setupOptIns().callJson('scriptrunner_runBuiltInScript', { className, values: { FIELD_SOURCE_PROJECT: 'QA' } });

    expect(sent()).toMatchObject({ method: 'POST', path: { scriptName: className }, body: { FIELD_SOURCE_PROJECT: 'QA' } });
  });

  it('creates a script file from base64 content, refusing to replace one unless told to overwrite', async () => {
    routeRequests({ '/scriptrunner/latest/idea/file': undefined });
    const tools = setupOptIns();
    const content = 'log.warn("é")\n';

    const created = await tools.callJson('scriptrunner_saveScriptFile', { rootPath: '/r', filePath: 'a/B.groovy', content });
    await tools.callJson('scriptrunner_saveScriptFile', { rootPath: '/r', filePath: 'a/B.groovy', content, overwrite: true });

    expect(sent(0)).toMatchObject({
      method: 'POST',
      query: { rootPath: '/r', filePath: 'a/B.groovy' },
      body: Buffer.from(content).toString('base64'),
      mediaType: 'application/octet-stream',
    });
    expect(sent(1).method).toBe('PUT');
    expect(created).toEqual({ success: true, data: { rootPath: '/r', filePath: 'a/B.groovy', saved: true, bytes: Buffer.byteLength(content) } });
  });
});
