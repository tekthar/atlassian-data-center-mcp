import fs from 'node:fs';
import path from 'node:path';
import { isToolAllowed, resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { JIRA_CORE_CATALOG, JIRA_TOOL_CATALOG } from '../tool-catalog.js';

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

  it('exposes only read tools in read-only mode', () => {
    const readOnly = allowedBy({ TOOLSETS: 'all', READ_ONLY_MODE: 'true' });

    expect(readOnly.length).toBeGreaterThan(0);
    for (const name of readOnly) {
      expect(JIRA_TOOL_CATALOG.tools[name].access).toBe('read');
    }
  });
});
