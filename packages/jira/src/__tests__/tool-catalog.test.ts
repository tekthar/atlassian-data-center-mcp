import fs from 'node:fs';
import path from 'node:path';
import { isGatewayTool, isToolAllowed, resolveToolPolicy } from '@atlassian-dc-mcp/common';
import { JIRA_PERMISSION_KEYS } from '../permissions.js';
import { JIRA_CORE_CATALOG, JIRA_TOOL_CATALOG } from '../tool-catalog.js';
import { DRAWIO_CATALOG } from '../apps/drawio/catalog.js';
import { SCRIPTRUNNER_CATALOG } from '../apps/scriptrunner/catalog.js';
import { XRAY_CATALOG } from '../apps/xray/catalog.js';
import { ZEPHYR_CATALOG } from '../apps/zephyr/catalog.js';

/**
 * Tools that change Jira but need nothing beyond browsing the issue or using the customer portal,
 * and Xray test runs, whose executors Xray's own settings decide.
 */
const UNGATED_WRITE_TOOLS = ['jira_watchIssue', 'jira_unwatchIssue', 'jira_createCustomerRequest', 'xray_updateTestRun'];

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

type Check = typeof isToolAllowed;

const exposedBy = (check: Check, env: Record<string, string>) => {
  const policy = resolveToolPolicy(JIRA_TOOL_CATALOG, env, () => undefined);
  return Object.entries(JIRA_TOOL_CATALOG.tools)
    .filter(([name, entry]) => check(name, entry, policy))
    .map(([name]) => name);
};

const allowedBy = (env: Record<string, string>) => exposedBy(isToolAllowed, env);
const gatewayBy = (env: Record<string, string>) => exposedBy(isGatewayTool, env);

const DEFAULT_DIRECT_TOOLSETS = ['jira_issues', 'jira_comments', 'jira_transitions', 'jira_attachments'];

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

  it('lists only the everyday core tools directly when no policy variable is set', () => {
    const expected = Object.entries(JIRA_CORE_CATALOG.tools)
      .filter(([, entry]) => DEFAULT_DIRECT_TOOLSETS.includes(entry.toolset))
      .map(([name]) => name);

    expect(allowedBy({})).toEqual(expected);
  });

  it('offers every other non-destructive tool through the gateway by default, except service desk', () => {
    const expected = Object.entries(JIRA_TOOL_CATALOG.tools)
      .filter(([, entry]) => !DEFAULT_DIRECT_TOOLSETS.includes(entry.toolset))
      .filter(([, entry]) => entry.toolset !== 'jira_service_desk' && entry.access !== 'destructive')
      .map(([name]) => name);

    expect(gatewayBy({})).toEqual(expected);
    expect(gatewayBy({})).toContain('jira_getProjectVersions');
    expect(gatewayBy({})).not.toContain('jira_deleteIssue');
  });

  it('lists a toolset directly, not through the gateway, once TOOLSETS names it', () => {
    const env = { TOOLSETS: 'default,jira_agile' };

    expect(allowedBy(env)).toContain('jira_getAgileBoards');
    expect(gatewayBy(env)).not.toContain('jira_getAgileBoards');
    expect(gatewayBy(env)).toContain('jira_getWorklog');
  });

  it('keeps service desk tools out of the gateway but lists them when selected', () => {
    expect(allowedBy({ TOOLSETS: 'default,jira_service_desk' })).toContain('jira_getServiceDeskQueues');
    expect(gatewayBy({ TOOLSETS: 'all' })).toEqual([]);
  });

  it('turns the gateway off with TOOL_GATEWAY=off or ENABLED_TOOLS', () => {
    expect(gatewayBy({ TOOL_GATEWAY: 'off' })).toEqual([]);
    expect(gatewayBy({ ENABLED_TOOLS: 'jira_getIssue' })).toEqual([]);
  });

  it('offers only read tools through the gateway in read-only mode', () => {
    const offered = gatewayBy({ READ_ONLY_MODE: 'true' });

    expect(offered.length).toBeGreaterThan(0);
    for (const name of offered) {
      expect(JIRA_TOOL_CATALOG.tools[name].access).toBe('read');
    }
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

  it.each([
    ['Xray', XRAY_CATALOG, 'xray_test_runs', 'xray_updateTestRun'],
    ['ScriptRunner', SCRIPTRUNNER_CATALOG, 'scriptrunner_script_editor', 'scriptrunner_getScriptFile'],
    ['draw.io', DRAWIO_CATALOG, 'drawio_diagrams', 'drawio_getDiagram'],
    ['Zephyr', ZEPHYR_CATALOG, 'zephyr_test_cycles', 'zephyr_getTestCycleResults'],
  ])('offers %s tools through the gateway by default, and lists them once TOOLSETS names their toolset', (_app, catalog, toolset, tool) => {
    const appTools = Object.entries(catalog.tools).filter(([, entry]) => entry.access !== 'destructive').map(([name]) => name);

    expect(allowedBy({}).filter((name) => appTools.includes(name))).toEqual([]);
    expect(gatewayBy({}).filter((name) => appTools.includes(name))).toEqual(appTools);
    expect(allowedBy({ TOOLSETS: `default,${toolset}` })).toContain(tool);
  });

  it('keeps the ScriptRunner tools that run or save code out of the tool search, listing them only once TOOLSETS names their toolset', () => {
    const runOrSave = Object.entries(SCRIPTRUNNER_CATALOG.tools).filter(([, entry]) => entry.access === 'destructive').map(([name]) => name);

    expect(runOrSave).toHaveLength(7);

    expect(gatewayBy({ TOOLSETS: 'all' }).filter((name) => runOrSave.includes(name))).toEqual([]);
    expect(gatewayBy({}).filter((name) => runOrSave.includes(name))).toEqual([]);
    expect(allowedBy({ TOOLSETS: 'default,scriptrunner_console' })).toContain('scriptrunner_runConsoleScript');
    expect(allowedBy({ TOOLSETS: 'default,scriptrunner_console', READ_ONLY_MODE: 'true' })).not.toContain('scriptrunner_runConsoleScript');
  });
});
