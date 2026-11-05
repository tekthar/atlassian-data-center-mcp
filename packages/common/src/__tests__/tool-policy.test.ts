import { annotationsFor, isToolAllowed, resolveToolPolicy, resolveToolsets, type ToolCatalog } from '../tool-policy.js';

const catalog: ToolCatalog = {
  toolsets: {
    issues: { description: 'Issues', default: true },
    comments: { description: 'Comments', default: true },
    agile: { description: 'Boards and sprints', default: false },
  },
  tools: {
    getIssue: { toolset: 'issues', access: 'read' },
    deleteIssue: { toolset: 'issues', access: 'destructive' },
    addComment: { toolset: 'comments', access: 'write' },
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
