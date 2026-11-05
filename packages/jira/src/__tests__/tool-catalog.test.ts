import fs from 'node:fs';
import path from 'node:path';
import { isToolAllowed, resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { JIRA_PERMISSION_KEYS } from '../permissions.js';
import { JIRA_CORE_CATALOG, JIRA_TOOL_CATALOG } from '../tool-catalog.js';

/** Tools that change Jira but need nothing beyond browsing the issue or using the customer portal. */
const UNGATED_WRITE_TOOLS = ['jira_watchIssue', 'jira_unwatchIssue', 'jira_createCustomerRequest'];

const SOURCE_DIR = path.join(__dirname, '..');
const TOOLS_DIR = path.join(SOURCE_DIR, 'tools');

const registeredInSource = (): string[] => {
  const files = [path.join(SOURCE_DIR, 'index.ts'), ...fs.readdirSync(TOOLS_DIR).map((file) => path.join(TOOLS_DIR, file))];
  return files.flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/registerTool\(\s*['"]([A-Za-z_]+)['"]/g)].map((match) => match[1]),
  );
};

const allowedBy = (env: Record<string, string>) => {
  const policy = resolveToolPolicy(JIRA_TOOL_CATALOG, env, () => undefined);
  return Object.entries(JIRA_TOOL_CATALOG.tools)
    .filter(([name, entry]) => isToolAllowed(name, entry, policy))
    .map(([name]) => name);
};

describe('JIRA_TOOL_CATALOG', () => {
  it('has an entry for every tool the server registers, and nothing else', () => {
    expect(registeredInSource().sort()).toEqual(Object.keys(JIRA_TOOL_CATALOG.tools).sort());
  });

  it('only references toolsets it defines', () => {
    const toolsets = Object.keys(JIRA_TOOL_CATALOG.toolsets);
    for (const entry of Object.values(JIRA_TOOL_CATALOG.tools)) {
      expect(toolsets).toContain(entry.toolset);
    }
  });

  it('exposes exactly the original tools when no policy variable is set', () => {
    expect(allowedBy({})).toEqual(Object.keys(JIRA_CORE_CATALOG.tools));
  });

  it('exposes every tool with TOOLSETS=all', () => {
    expect(allowedBy({ TOOLSETS: 'all' })).toEqual(Object.keys(JIRA_TOOL_CATALOG.tools));
  });

  it('names only real Jira permission keys', () => {
    const unknown = Object.entries(JIRA_TOOL_CATALOG.tools).flatMap(([name, entry]) =>
      (entry.anyOfPermissions ?? []).filter((key) => !JIRA_PERMISSION_KEYS.has(key)).map((key) => `${name}: ${key}`));

    expect(unknown).toEqual([]);
  });

  it('gates every tool that changes Jira, apart from the few anyone can run', () => {
    const ungated = Object.entries(JIRA_TOOL_CATALOG.tools)
      .filter(([, entry]) => entry.access !== 'read' && !entry.anyOfPermissions?.length)
      .map(([name]) => name);

    expect(ungated.sort()).toEqual([...UNGATED_WRITE_TOOLS].sort());
  });

  it('leaves read tools ungated', () => {
    const gatedReads = Object.entries(JIRA_TOOL_CATALOG.tools)
      .filter(([, entry]) => entry.access === 'read' && entry.anyOfPermissions?.length)
      .map(([name]) => name);

    expect(gatedReads).toEqual([]);
  });

  it('exposes only read tools in read-only mode', () => {
    const readOnly = allowedBy({ TOOLSETS: 'all', READ_ONLY_MODE: 'true' });

    expect(readOnly.length).toBeGreaterThan(0);
    for (const name of readOnly) {
      expect(JIRA_TOOL_CATALOG.tools[name].access).toBe('read');
    }
  });
});
