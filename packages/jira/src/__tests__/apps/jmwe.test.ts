import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { JMWE_CATALOG } from '../../apps/jmwe/catalog.js';
import { JMWE_OPT_IN_SETTINGS, registerJmweOptInTools } from '../../apps/jmwe/opt-in-tools.js';
import { registerJmweReadTools } from '../../apps/jmwe/read-tools.js';

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

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    const response = routes[options.url];
    if (response instanceof Error) throw response;
    return response;
  });
}

const sent = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;
const BASE = '/jmwe/1';

function setup() {
  const recorder = createRecordingRegistrar();
  registerJmweReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('JMWE tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued read tool, in toolsets that are off by default', () => {
    const reads = Object.entries(JMWE_CATALOG.tools).filter(([, entry]) => entry.access === 'read').map(([name]) => name);

    expect(setup().registrar.registeredTools().sort()).toEqual(reads.sort());
    expect(Object.values(JMWE_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('lists the workflows that use JMWE, or one workflow\'s extensions by name', async () => {
    routeRequests({ [`${BASE}/workflows`]: [], [`${BASE}/workflows/workflow`]: {} });
    const tools = setup();

    await tools.callJson('jmwe_getWorkflowExtensions', {});
    await tools.callJson('jmwe_getWorkflowExtensions', { workflowName: 'Software Simplified Workflow' });

    expect(sent(0).url).toBe(`${BASE}/workflows`);
    expect(sent(1).query).toEqual({ workflowName: 'Software Simplified Workflow' });
  });

  it('lists shared items without their content unless asked, gets one by id, and lists scripts whole', async () => {
    routeRequests({ [`${BASE}/shared-conditions`]: [], [`${BASE}/shared-actions/{id}`]: {}, [`${BASE}/shared-scripts`]: [] });
    const tools = setup();

    await tools.callJson('jmwe_getSharedItems', { kind: 'conditions' });
    await tools.callJson('jmwe_getSharedItems', { kind: 'actions', id: 'a1b2' });
    await tools.callJson('jmwe_getSharedItems', { kind: 'scripts' });

    expect(sent(0).query).toEqual({ skipContent: true });
    expect(sent(1).path).toEqual({ id: 'a1b2' });
    expect(sent(2).query).toBeUndefined();
  });

  it('reads event-based and scheduled actions by their list and get routes, never the run route', async () => {
    routeRequests({
      [`${BASE}/event-actions`]: [], [`${BASE}/scheduled-actions/{actionId}`]: {}, [`${BASE}/scheduled-actions/status`]: [],
    });
    const tools = setup();

    await tools.callJson('jmwe_getEventBasedActions', {});
    await tools.callJson('jmwe_getScheduledActions', { actionId: 'nightly-cleanup' });
    await tools.callJson('jmwe_getScheduledActionStatus', {});

    expect(mockedRequest.mock.calls.map(([, options]) => (options as RequestOptions).url)).toEqual([
      `${BASE}/event-actions`, `${BASE}/scheduled-actions/{actionId}`, `${BASE}/scheduled-actions/status`,
    ]);
    expect(mockedRequest.mock.calls.every(([, options]) => (options as RequestOptions).method === 'GET')).toBe(true);
    expect(sent(1).path).toEqual({ actionId: 'nightly-cleanup' });
  });

  it('searches logs by issue, leaving JMWE\'s defaults to what isn\'t given, and reads one execution\'s logs', async () => {
    routeRequests({ [`${BASE}/logs`]: { logs: [] }, [`${BASE}/logs/{correlationId}`]: [] });
    const tools = setup();

    await tools.callJson('jmwe_getLogs', { issueKey: 'PROJ-12', successes: true });
    await tools.callJson('jmwe_getLogDetails', { correlationId: 'abc-123' });

    expect(sent(0).query).toEqual({ issueKey: 'PROJ-12', successes: true });
    expect(sent(1).path).toEqual({ correlationId: 'abc-123' });
  });

  it('explains a refusal in terms of who JMWE lets in', async () => {
    routeRequests({ [`${BASE}/shared-scripts`]: Object.assign(new Error('Forbidden'), { status: 403 }) });

    const result = await setup().callJson('jmwe_getSharedItems', { kind: 'scripts' });

    expect(result.error).toContain('JMWE refused this (403)');
  });
});

describe('JMWE tools that run something', () => {
  beforeEach(() => jest.resetAllMocks());

  const setupOptIns = (env: Record<string, string | undefined>) => {
    const recorder = createRecordingRegistrar();
    registerJmweOptInTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 }, env);
    return recorder;
  };

  it('registers the run tool only when its own setting is true', () => {
    expect(setupOptIns({}).registrar.registeredTools()).toEqual([]);
    expect(setupOptIns({ JIRA_JMWE_SCHEDULED_ACTION_RUN_ENABLED: 'false' }).registrar.registeredTools()).toEqual([]);
    expect(setupOptIns({ JIRA_JMWE_SCHEDULED_ACTION_RUN_ENABLED: 'true' }).registrar.registeredTools()).toEqual(['jmwe_runScheduledAction']);
  });

  it('catalogues it as destructive and for Jira administrators', () => {
    for (const name of Object.keys(JMWE_OPT_IN_SETTINGS)) {
      expect(JMWE_CATALOG.tools[name]).toMatchObject({ access: 'destructive', anyOfPermissions: ['ADMINISTER', 'SYSTEM_ADMIN'] });
    }
  });

  it('starts a scheduled action on its run route and points to the status tool', async () => {
    routeRequests({ [`${BASE}/scheduled-actions/{actionId}/run`]: undefined });

    const result = await setupOptIns({ JIRA_JMWE_SCHEDULED_ACTION_RUN_ENABLED: 'yes' }).callJson('jmwe_runScheduledAction', { actionId: 'nightly-cleanup' });

    expect(sent()).toMatchObject({ method: 'GET', url: `${BASE}/scheduled-actions/{actionId}/run`, path: { actionId: 'nightly-cleanup' } });
    expect(result.data).toEqual({ started: true, actionId: 'nightly-cleanup', followWith: 'jmwe_getScheduledActionStatus' });
  });
});
