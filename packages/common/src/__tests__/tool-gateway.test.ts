import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { createPolicyRegistrar } from '../policy-registrar.js';
import { createToolGateway, inputJsonSchema, runOperation, scoreOperation, type GatewayOperation } from '../tool-gateway.js';
import { resolveToolPolicy, type ToolCatalog } from '../tool-policy.js';

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });

const operation = (overrides: Partial<GatewayOperation>): GatewayOperation => ({
  name: 'jira_getSprintIssues',
  toolset: 'jira_agile',
  access: 'read',
  description: 'Get the issues of a sprint',
  cb: async () => ok('done'),
  ...overrides,
});

const catalog: ToolCatalog = {
  toolsets: {
    issues: { description: 'Issues', default: true },
    agile: { description: 'Boards and sprints', default: false },
    desk: { description: 'Service desk', default: false, gateway: false },
  },
  tools: {
    getIssue: { toolset: 'issues', access: 'read' },
    getSprint: { toolset: 'agile', access: 'read' },
    createSprint: { toolset: 'agile', access: 'write' },
    deleteSprint: { toolset: 'agile', access: 'destructive' },
    getQueue: { toolset: 'desk', access: 'read' },
  },
};

type Callback = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function fakeServer() {
  const callbacks = new Map<string, Callback>();
  const registerTool = jest.fn((name: string, _config: unknown, cb: Callback) => {
    callbacks.set(name, cb);
    return { name };
  });
  return { server: { registerTool } as unknown as McpServer, registerTool, callbacks };
}

function registerAll(env: Record<string, string> = {}) {
  const fake = fakeServer();
  const tools = createPolicyRegistrar(fake.server, catalog, resolveToolPolicy(catalog, env, () => undefined));
  const schema = z.object({ sprintId: z.number() });
  for (const name of Object.keys(catalog.tools)) {
    tools.registerTool(name, { description: `${name} tool`, inputSchema: schema }, async ({ sprintId }) => ok(`${name} ${sprintId}`));
  }
  return { ...fake, tools, gatewayNames: tools.registerGatewayTools({ prefix: 'jira', product: 'Jira' }) };
}

describe('tool gateway search', () => {
  it('ranks a name match above a description match', () => {
    const gateway = createToolGateway();
    gateway.add(operation({ name: 'jira_getWorklog', toolset: 'jira_worklog', description: 'Read logged work on a sprint issue' }));
    gateway.add(operation({}));

    expect(gateway.search('sprint').map((found) => found.name)).toEqual(['jira_getSprintIssues', 'jira_getWorklog']);
  });

  it('matches camelCase name parts and word prefixes', () => {
    expect(scoreOperation(operation({}), 'sprints')).toBeGreaterThan(0);
    expect(scoreOperation(operation({}), 'worklog')).toBe(0);
  });

  it('lists a toolset when the query is empty, and respects the limit', () => {
    const gateway = createToolGateway();
    gateway.add(operation({}));
    gateway.add(operation({ name: 'jira_getWorklog', toolset: 'jira_worklog' }));

    expect(gateway.search('', { toolset: 'jira_worklog' }).map((found) => found.name)).toEqual(['jira_getWorklog']);
    expect(gateway.search('', { limit: 1 })).toHaveLength(1);
  });

  it('describes inputs as JSON schema without the $schema key', () => {
    expect(inputJsonSchema(z.object({ key: z.string() }))).toEqual({
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    });
  });
});

describe('runOperation', () => {
  it('validates arguments before running the tool', async () => {
    const cb = jest.fn(async () => ok('done'));
    const op = operation({ inputSchema: z.object({ sprintId: z.number() }), cb });

    const result = await runOperation(op, { sprintId: 'seven' }, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('sprintId:') });
    expect(cb).not.toHaveBeenCalled();
  });

  it('passes the parsed arguments and context to the tool', async () => {
    const cb = jest.fn(async () => ok('done'));
    await runOperation(operation({ inputSchema: z.object({ sprintId: z.coerce.number() }), cb }), { sprintId: '7' }, { id: 1 });

    expect(cb).toHaveBeenCalledWith({ sprintId: 7 }, { id: 1 });
  });
});

describe('createPolicyRegistrar with the gateway', () => {
  it('lists default toolsets directly and offers the rest through the gateway', () => {
    const { registerTool, tools, gatewayNames } = registerAll();

    expect(tools.registeredTools()).toEqual(['getIssue']);
    expect(tools.gatewayTools()).toEqual(['getSprint', 'createSprint']);
    expect(gatewayNames).toEqual(['jira_searchTools', 'jira_runReadTool', 'jira_runWriteTool', 'jira_runCode']);
    expect(registerTool.mock.calls.map(([name]) => name)).toEqual(['getIssue', ...gatewayNames]);
  });

  it('never offers destructive tools or toolsets marked gateway: false', () => {
    const { tools } = registerAll({ TOOLSETS: 'issues' });

    expect(tools.gatewayTools()).not.toContain('deleteSprint');
    expect(tools.gatewayTools()).not.toContain('getQueue');
  });

  it('registers no gateway tools when the gateway is off', () => {
    const { tools, gatewayNames } = registerAll({ TOOL_GATEWAY: 'off', CODE_EXECUTION: 'off' });

    expect(tools.gatewayTools()).toEqual([]);
    expect(gatewayNames).toEqual([]);
  });

  it('registers only the search, read and code tools in read-only mode', () => {
    expect(registerAll({ READ_ONLY_MODE: 'true' }).gatewayNames).toEqual(['jira_searchTools', 'jira_runReadTool', 'jira_runCode']);
  });

  it('runs a gateway tool through the run tool that matches its access', async () => {
    const { callbacks } = registerAll();
    const runRead = callbacks.get('jira_runReadTool')!;

    expect((await runRead({ tool: 'getSprint', arguments: { sprintId: 3 } }, {})).content[0].text).toBe('getSprint 3');
    expect((await runRead({ tool: 'createSprint', arguments: { sprintId: 3 } }, {})).content[0].text).toContain('jira_runWriteTool');
    expect((await runRead({ tool: 'getIssue' }, {})).isError).toBe(true);
  });

  it('returns matching tools with their schemas from the search tool', async () => {
    const { callbacks } = registerAll();
    const result = await callbacks.get('jira_searchTools')!({ query: 'sprint' }, {});
    const { tools } = JSON.parse(result.content[0].text);

    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(['getSprint', 'createSprint']);
    expect(tools[0]).toMatchObject({ access: 'read', inputSchema: { required: ['sprintId'] } });
  });
});

describe('createPolicyRegistrar with code execution', () => {
  jest.setTimeout(20_000);

  const runCode = async (callbacks: Map<string, Callback>, code: string) =>
    JSON.parse((await callbacks.get('jira_runCode')!({ code }, {})).content[0].text);

  it('lets code call direct and gateway read tools, and nothing else', async () => {
    const { tools, callbacks } = registerAll();

    expect(tools.codeTools()).toEqual(['getIssue', 'getSprint']);
    expect(await runCode(callbacks, 'return [await tools.getIssue({ sprintId: 1 }), await tools.getSprint({ sprintId: 2 })]'))
      .toMatchObject({ result: ['getIssue 1', 'getSprint 2'], toolCalls: 2 });
    expect(await runCode(callbacks, 'return Object.keys(tools)')).toMatchObject({ result: ['getIssue', 'getSprint'] });
    expect(await runCode(callbacks, 'try { await tools.createSprint({ sprintId: 1 }) } catch (e) { return e.message }'))
      .toMatchObject({ result: expect.stringContaining('Unknown or non-read tool "createSprint"') });
    expect(await runCode(callbacks, 'try { await callTool("createSprint", { sprintId: 1 }) } catch (e) { return e.message }'))
      .toMatchObject({ result: expect.stringContaining('Unknown or non-read tool "createSprint"') });
  });

  it('reports invalid arguments as an error the code can catch', async () => {
    const { callbacks } = registerAll();

    expect(await runCode(callbacks, 'try { await tools.getIssue({ sprintId: "x" }) } catch (e) { return e.message }'))
      .toMatchObject({ result: expect.stringContaining('Invalid arguments for getIssue') });
  });

  it('is not registered with CODE_EXECUTION=off or ENABLED_TOOLS', () => {
    expect(registerAll({ CODE_EXECUTION: 'off' }).gatewayNames).not.toContain('jira_runCode');
    expect(registerAll({ ENABLED_TOOLS: 'getIssue' }).gatewayNames).not.toContain('jira_runCode');
  });

  it('keeps out a read tool whose annotations say it can change something', () => {
    const fake = fakeServer();
    const tools = createPolicyRegistrar(fake.server, catalog, resolveToolPolicy(catalog, {}, () => undefined));
    tools.registerTool('getIssue', { annotations: { readOnlyHint: false } }, async () => ok('saved'));

    expect(tools.codeTools()).toEqual([]);
  });
});
