import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { AuditLog, auditServer } from '../audit.js';
import { createPolicyRegistrar } from '../policy-registrar.js';
import { resolveToolPolicy, type ToolCatalog } from '../tool-policy.js';

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });

describe('AuditLog', () => {
  let dir: string;
  let file: string;
  let clock: number;
  const lines = () => fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
    file = path.join(dir, 'nested', 'mcp-jira-dc.jsonl');
    clock = Date.parse('2026-11-06T12:00:00Z');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const log = (options = {}) => new AuditLog(file, 'mcp-jira-dc', { now: () => clock, ...options });

  it('records the tool, outcome and duration of each call, never its arguments or result', async () => {
    const audited = log().wrap('jira_getIssue', async () => { clock += 42; return ok('SECRET-RESULT'); });

    await audited({ issueKey: 'SECRET-ARG' }, {});

    expect(lines()).toEqual([{ time: '2026-11-06T12:00:00.000Z', server: 'mcp-jira-dc', tool: 'jira_getIssue', outcome: 'ok', durationMs: 42 }]);
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/SECRET/);
  });

  it('records an error result, and a thrown error without swallowing it', async () => {
    const audit = log();
    await audit.wrap('a', async () => ({ ...ok('no'), isError: true }))({}, {});
    await expect(audit.wrap('b', async () => { throw new Error('boom'); })({}, {})).rejects.toThrow('boom');

    expect(lines().map((entry) => [entry.tool, entry.outcome])).toEqual([['a', 'error'], ['b', 'error']]);
  });

  it('rotates at the size limit, keeping three old files', () => {
    const audit = log({ maxBytes: 10 });
    for (let i = 0; i < 5; i++) audit.record({ tool: `t${i}`, outcome: 'ok', durationMs: 1 });

    expect(fs.readdirSync(path.dirname(file)).sort()).toEqual(['mcp-jira-dc.jsonl', 'mcp-jira-dc.jsonl.1', 'mcp-jira-dc.jsonl.2', 'mcp-jira-dc.jsonl.3']);
    expect(lines()).toEqual([expect.objectContaining({ tool: 't4' })]);
  });

  it('never fails a call when it cannot write, warns once, and pauses for a minute', () => {
    const warn = jest.fn();
    const appendFileSync = jest.fn(() => { throw new Error('disk full'); });
    const audit = log({ warn, fs: { ...fs, appendFileSync } });

    audit.record({ tool: 'a', outcome: 'ok', durationMs: 1 });
    audit.record({ tool: 'b', outcome: 'ok', durationMs: 1 });
    clock += 61_000;
    audit.record({ tool: 'c', outcome: 'ok', durationMs: 1 });

    expect(appendFileSync).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('disk full');
  });

  it('is off unless ATLASSIAN_DC_MCP_AUDIT is on, and honours ATLASSIAN_DC_MCP_AUDIT_FILE', () => {
    expect(AuditLog.fromEnv('mcp-jira-dc', {})).toBeUndefined();
    expect(AuditLog.fromEnv('mcp-jira-dc', { ATLASSIAN_DC_MCP_AUDIT: '1', ATLASSIAN_DC_MCP_AUDIT_FILE: file })?.file).toBe(file);
    expect(AuditLog.fromEnv('mcp-jira-dc', { ATLASSIAN_DC_MCP_AUDIT: 'true' })?.file)
      .toBe(path.join(os.homedir(), '.atlassian-dc-mcp', 'audit', 'mcp-jira-dc.jsonl'));
  });

  it('records listed tools, and tools run through the tool search or from code with via', async () => {
    const callbacks = new Map<string, (args: unknown, ctx: unknown) => Promise<unknown>>();
    const server = { registerTool: (name: string, _config: unknown, cb: (args: unknown, ctx: unknown) => Promise<unknown>) => { callbacks.set(name, cb); } };
    auditServer(server, log());
    const catalog: ToolCatalog = {
      toolsets: { issues: { description: 'Issues', default: true }, agile: { description: 'Agile', default: false } },
      tools: { getIssue: { toolset: 'issues', access: 'read' }, getSprint: { toolset: 'agile', access: 'read' } },
    };
    const tools = createPolicyRegistrar(server as unknown as McpServer, catalog, resolveToolPolicy(catalog, {}, () => undefined));
    for (const name of ['getIssue', 'getSprint']) tools.registerTool(name, { inputSchema: z.object({}) }, async () => ok(name));
    tools.registerGatewayTools({ prefix: 'jira', product: 'Jira' });

    await callbacks.get('getIssue')!({}, {});
    await callbacks.get('jira_runReadTool')!({ tool: 'getSprint', arguments: {} }, {});

    expect(lines().map(({ tool, via }) => (via ? `${tool} via ${via}` : tool))).toEqual(['getIssue', 'getSprint via gateway', 'jira_runReadTool']);
  });
});
