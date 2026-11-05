import type { McpServer } from '@modelcontextprotocol/server';
import { createPolicyRegistrar } from '../policy-registrar.js';
import type { ToolCatalog, ToolPolicy } from '../tool-policy.js';

const catalog: ToolCatalog = {
  toolsets: { issues: { description: 'Issues', default: true } },
  tools: {
    getIssue: { toolset: 'issues', access: 'read' },
    deleteIssue: { toolset: 'issues', access: 'destructive' },
  },
};

const policy = (overrides: Partial<ToolPolicy> = {}): ToolPolicy => ({
  toolsets: new Set(['issues']),
  readOnly: false,
  enabledTools: null,
  ...overrides,
});

function fakeServer() {
  const registerTool = jest.fn((name: string, _config: unknown, _cb: unknown) => ({ name }));
  return { server: { registerTool } as unknown as McpServer, registerTool };
}

const handler = async () => ({ content: [] });

describe('createPolicyRegistrar', () => {
  it('registers allowed tools with annotations from the catalog', () => {
    const { server, registerTool } = fakeServer();
    const tools = createPolicyRegistrar(server, catalog, policy());

    tools.registerTool('deleteIssue', { description: 'Delete' }, handler);

    expect(registerTool).toHaveBeenCalledWith(
      'deleteIssue',
      { description: 'Delete', annotations: { readOnlyHint: false, destructiveHint: true } },
      handler,
    );
    expect(tools.registeredTools()).toEqual(['deleteIssue']);
  });

  it('lets the call site override a derived annotation', () => {
    const { server, registerTool } = fakeServer();
    const tools = createPolicyRegistrar(server, catalog, policy());

    tools.registerTool('getIssue', { annotations: { readOnlyHint: false } }, handler);

    expect(registerTool.mock.calls[0][1]).toEqual({ annotations: { readOnlyHint: false } });
  });

  it('skips tools the policy hides', () => {
    const { server, registerTool } = fakeServer();
    const tools = createPolicyRegistrar(server, catalog, policy({ readOnly: true }));

    expect(tools.registerTool('deleteIssue', {}, handler)).toBeUndefined();
    expect(registerTool).not.toHaveBeenCalled();
    expect(tools.registeredTools()).toEqual([]);
    expect(tools.hiddenByPermission()).toEqual([]);
  });

  it('records the tools only the permission check kept out', () => {
    const gated: ToolCatalog = {
      toolsets: catalog.toolsets,
      tools: {
        getIssue: { toolset: 'issues', access: 'read' },
        deleteIssue: { toolset: 'issues', access: 'destructive', anyOfPermissions: ['DELETE_ISSUES'] },
        editIssue: { toolset: 'issues', access: 'write', anyOfPermissions: ['EDIT_ISSUES'] },
      },
    };
    const { server, registerTool } = fakeServer();
    const tools = createPolicyRegistrar(server, gated, policy({ permissionCheck: (anyOf) => anyOf.includes('EDIT_ISSUES') }));

    for (const name of ['getIssue', 'deleteIssue', 'editIssue']) tools.registerTool(name, {}, handler);

    expect(registerTool.mock.calls.map(([name]) => name)).toEqual(['getIssue', 'editIssue']);
    expect(tools.hiddenByPermission()).toEqual(['deleteIssue']);
  });

  it('refuses a tool that is missing from the catalog', () => {
    const { server } = fakeServer();
    const tools = createPolicyRegistrar(server, catalog, policy());

    expect(() => tools.registerTool('mystery', {}, handler)).toThrow('Tool "mystery" is missing from the tool catalog');
  });
});
