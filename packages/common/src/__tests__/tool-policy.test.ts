import { annotationsFor, isPermissionFilterEnabled, isToolAllowed, resolveToolPolicy, resolveToolsets, toolsHiddenByPermissions, type ToolCatalog, type ToolPolicy } from '../tool-policy.js';

const catalog: ToolCatalog = {
  toolsets: {
    issues: { description: 'Issues', default: true },
    comments: { description: 'Comments', default: true },
    agile: { description: 'Boards and sprints', default: false },
  },
  tools: {
    getIssue: { toolset: 'issues', access: 'read' },
    deleteIssue: { toolset: 'issues', access: 'destructive', anyOfPermissions: ['DELETE_ISSUES'] },
    addComment: { toolset: 'comments', access: 'write', anyOfPermissions: ['ADD_COMMENTS', 'EDIT_ALL_COMMENTS'] },
    getSprints: { toolset: 'agile', access: 'read' },
  },
};

const allowedTools = (env: Record<string, string>) => {
  const policy = resolveToolPolicy(catalog, env, () => undefined);
  return Object.entries(catalog.tools).filter(([name, entry]) => isToolAllowed(name, entry, policy)).map(([name]) => name);
};

describe('resolveToolsets', () => {
  it.each([
    [undefined, ['issues', 'comments']],
    ['', ['issues', 'comments']],
    ['all', ['issues', 'comments', 'agile']],
    ['agile', ['agile']],
    ['default, agile', ['issues', 'comments', 'agile']],
    ['AGILE', ['agile']],
  ])('maps %p to %p', (value, expected) => {
    expect([...resolveToolsets(catalog, value, () => undefined)]).toEqual(expected);
  });

  it('warns about unknown names and fails closed when nothing is known', () => {
    const warn = jest.fn();

    expect(resolveToolsets(catalog, 'typo', warn).size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring unknown toolset "typo"'));
  });
});

describe('resolveToolPolicy', () => {
  it('exposes the default toolsets when nothing is set', () => {
    expect(allowedTools({})).toEqual(['getIssue', 'deleteIssue', 'addComment']);
  });

  it('drops every tool that is not read-only in read-only mode', () => {
    expect(allowedTools({ TOOLSETS: 'all', READ_ONLY_MODE: 'true' })).toEqual(['getIssue', 'getSprints']);
  });

  it('lets ENABLED_TOOLS replace TOOLSETS', () => {
    const warn = jest.fn();
    const policy = resolveToolPolicy(catalog, { ENABLED_TOOLS: 'getSprints, nope', TOOLSETS: 'issues' }, warn);

    expect(Object.keys(catalog.tools).filter((name) => isToolAllowed(name, catalog.tools[name], policy))).toEqual(['getSprints']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown tool "nope"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TOOLSETS is ignored'));
  });

  it('still applies read-only mode to ENABLED_TOOLS', () => {
    expect(allowedTools({ ENABLED_TOOLS: 'getIssue,deleteIssue', READ_ONLY_MODE: '1' })).toEqual(['getIssue']);
  });

  it.each(['false', '0', 'no', ''])('treats READ_ONLY_MODE=%p as off', (value) => {
    expect(resolveToolPolicy(catalog, { READ_ONLY_MODE: value }).readOnly).toBe(false);
  });
});

describe('annotationsFor', () => {
  it('derives MCP hints from the access level', () => {
    expect(annotationsFor('read')).toEqual({ readOnlyHint: true });
    expect(annotationsFor('write')).toEqual({ readOnlyHint: false, destructiveHint: false });
    expect(annotationsFor('destructive')).toEqual({ readOnlyHint: false, destructiveHint: true });
  });
});

describe('permission filter', () => {
  const policyWith = (env: Record<string, string>, granted: string[]): ToolPolicy => ({
    ...resolveToolPolicy(catalog, env, () => undefined),
    permissionCheck: (anyOf) => anyOf.some((key) => granted.includes(key)),
  });
  const allowedWith = (env: Record<string, string>, granted: string[]) => {
    const policy = policyWith(env, granted);
    return Object.entries(catalog.tools).filter(([name, entry]) => isToolAllowed(name, entry, policy)).map(([name]) => name);
  };

  it('hides a gated tool when the user holds none of its permissions', () => {
    expect(allowedWith({}, [])).toEqual(['getIssue']);
  });

  it('shows a gated tool when the user holds any one of its permissions', () => {
    expect(allowedWith({}, ['EDIT_ALL_COMMENTS'])).toEqual(['getIssue', 'addComment']);
  });

  it('also applies to tools named in ENABLED_TOOLS', () => {
    expect(allowedWith({ ENABLED_TOOLS: 'getIssue,deleteIssue' }, ['ADD_COMMENTS'])).toEqual(['getIssue']);
  });

  it('changes nothing when the server sets no permission check', () => {
    expect(allowedTools({})).toEqual(['getIssue', 'deleteIssue', 'addComment']);
  });

  it('reports only the tools the other settings would have exposed', () => {
    expect(toolsHiddenByPermissions(catalog, policyWith({ TOOLSETS: 'comments' }, []))).toEqual(['addComment']);
    expect(toolsHiddenByPermissions(catalog, resolveToolPolicy(catalog, {}, () => undefined))).toEqual([]);
  });
});

describe('isPermissionFilterEnabled', () => {
  it.each([
    [undefined, true],
    ['', true],
    ['on', true],
    ['true', true],
    ['off', false],
    ['false', false],
    ['0', false],
    [' NO ', false],
  ])('treats PERMISSION_FILTER=%p as %p', (value, expected) => {
    expect(isPermissionFilterEnabled(value === undefined ? {} : { PERMISSION_FILTER: value })).toBe(expected);
  });
});
