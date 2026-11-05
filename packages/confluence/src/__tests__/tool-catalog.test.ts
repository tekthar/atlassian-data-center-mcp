import fs from 'node:fs';
import path from 'node:path';
import { isToolAllowed, resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { CONFLUENCE_TOOL_CATALOG } from '../tool-catalog.js';

const registeredInIndex = (): string[] => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  return [...source.matchAll(/registerTool\(\s*['"]([A-Za-z_]+)['"]/g)].map((match) => match[1]);
};

describe('CONFLUENCE_TOOL_CATALOG', () => {
  it('has an entry for every tool index.ts registers, and nothing else', () => {
    expect(registeredInIndex().sort()).toEqual(Object.keys(CONFLUENCE_TOOL_CATALOG.tools).sort());
  });

  it('only references toolsets it defines', () => {
    const toolsets = Object.keys(CONFLUENCE_TOOL_CATALOG.toolsets);
    for (const entry of Object.values(CONFLUENCE_TOOL_CATALOG.tools)) {
      expect(toolsets).toContain(entry.toolset);
    }
  });

  it('keeps every existing tool available when no policy variable is set', () => {
    const policy = resolveToolPolicy(CONFLUENCE_TOOL_CATALOG, {}, () => undefined);
    for (const [name, entry] of Object.entries(CONFLUENCE_TOOL_CATALOG.tools)) {
      expect(isToolAllowed(name, entry, policy)).toBe(true);
    }
  });
});
