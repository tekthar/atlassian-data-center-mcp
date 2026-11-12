import fs from 'node:fs';
import path from 'node:path';
import { isGatewayTool, isToolAllowed, resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { DRAWIO_CATALOG } from '../apps/drawio/catalog.js';
import { CONFLUENCE_CORE_CATALOG, CONFLUENCE_TOOL_CATALOG } from '../tool-catalog.js';

const SOURCE_DIR = path.join(__dirname, '..');
const sourceFilesIn = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));

const registeredInSource = (): string[] => {
  const files = [path.join(SOURCE_DIR, 'index.ts'), ...sourceFilesIn(path.join(SOURCE_DIR, 'tools')), ...sourceFilesIn(path.join(SOURCE_DIR, 'apps'))];
  return files.flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/registerTool\(\s*['"]([A-Za-z_]+)['"]/g)].map((match) => match[1]),
  );
};

const allowedBy = (env: Record<string, string>) => {
  const policy = resolveToolPolicy(CONFLUENCE_TOOL_CATALOG, env, () => undefined);
  return Object.entries(CONFLUENCE_TOOL_CATALOG.tools)
    .filter(([name, entry]) => isToolAllowed(name, entry, policy))
    .map(([name]) => name);
};

const gatewayBy = (env: Record<string, string>) => {
  const policy = resolveToolPolicy(CONFLUENCE_TOOL_CATALOG, env, () => undefined);
  return Object.entries(CONFLUENCE_TOOL_CATALOG.tools)
    .filter(([name, entry]) => isGatewayTool(name, entry, policy))
    .map(([name]) => name);
};

describe('CONFLUENCE_TOOL_CATALOG', () => {
  it('offers draw.io tools through the tool search by default, and lists them once TOOLSETS names their toolset', () => {
    const drawioTools = Object.keys(DRAWIO_CATALOG.tools);

    expect(allowedBy({}).filter((name) => drawioTools.includes(name))).toEqual([]);
    expect(gatewayBy({}).filter((name) => drawioTools.includes(name))).toEqual(drawioTools);
    expect(allowedBy({ TOOLSETS: 'default,drawio_diagrams' })).toEqual(expect.arrayContaining(drawioTools));
  });

  it('has an entry for every tool the server registers, and nothing else', () => {
    expect(registeredInSource().sort()).toEqual(Object.keys(CONFLUENCE_TOOL_CATALOG.tools).sort());
  });

  it('only references toolsets it defines', () => {
    const toolsets = Object.keys(CONFLUENCE_TOOL_CATALOG.toolsets);
    for (const entry of Object.values(CONFLUENCE_TOOL_CATALOG.tools)) {
      expect(toolsets).toContain(entry.toolset);
    }
  });

  it('exposes exactly the original tools when no policy variable is set', () => {
    expect(allowedBy({})).toEqual(Object.keys(CONFLUENCE_CORE_CATALOG.tools));
  });

  it('exposes only read tools in read-only mode', () => {
    for (const name of allowedBy({ TOOLSETS: 'all', READ_ONLY_MODE: 'true' })) {
      expect(CONFLUENCE_TOOL_CATALOG.tools[name].access).toBe('read');
    }
  });
});
