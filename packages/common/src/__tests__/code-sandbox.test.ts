import { DEFAULT_SANDBOX_LIMITS, runSandboxedCode, type SandboxLimits, type SandboxToolCaller } from '../code-sandbox.js';

const fastLimits: SandboxLimits = { ...DEFAULT_SANDBOX_LIMITS, timeoutMs: 1_500 };

const echo: SandboxToolCaller = async (tool, args) => ({ tool, args });
const run = (code: string, callTool: SandboxToolCaller = echo, limits = fastLimits) => runSandboxedCode(code, ['jira_getIssue', 'jira_search'], callTool, limits);

jest.setTimeout(20_000);

describe('runSandboxedCode', () => {
  it('returns the value, logs and tool calls of the code', async () => {
    const result = await run(`
      const issue = await tools.jira_getIssue({ issueKey: 'A-1' });
      console.log('got', issue.args.issueKey, { n: 1 });
      return { key: issue.args.issueKey, tool: issue.tool };
    `);

    expect(result).toEqual({ ok: true, value: { key: 'A-1', tool: 'jira_getIssue' }, logs: ['got A-1 {"n":1}'], toolCalls: 1 });
  });

  it('runs calls in parallel up to the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const slow = async (tool: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active--;
      return tool;
    };

    const result = await run('return (await Promise.all(Array.from({ length: 10 }, () => callTool("jira_search", {})))).length', slow);

    expect(result.value).toBe(10);
    expect(peak).toBe(fastLimits.maxConcurrentCalls);
  });

  it('lets the code catch a tool error', async () => {
    const failing = async () => { throw new Error('404 Issue Does Not Exist'); };

    const result = await run('try { await tools.jira_getIssue({}); } catch (e) { return e.message; }', failing);

    expect(result.value).toBe('404 Issue Does Not Exist');
  });

  it('stops after the tool call limit', async () => {
    const result = await run('for (let i = 0; ; i++) await tools.jira_search({ i });', echo, { ...fastLimits, maxToolCalls: 3 });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Tool call limit reached (3 per run)');
    expect(result.toolCalls).toBe(3);
  });

  it('gives the code no access to the host', async () => {
    const result = await run(`return [typeof require, typeof process, typeof fetch, typeof setTimeout, typeof globalThis.std, typeof globalThis.os, typeof __call]`);

    expect(result.value).toEqual(Array(7).fill('undefined'));
  });

  it('reports syntax and runtime errors', async () => {
    expect((await run('return {')).error).toContain('SyntaxError');
    expect((await run('null.x')).error).toContain('TypeError');
  });

  it.each([
    ['a busy loop', 'while (true) {}'],
    ['a promise that never settles', 'await new Promise(() => {})'],
  ])('stops %s at the time limit', async (_label, code) => {
    const result = await run(code, echo, { ...fastLimits, timeoutMs: 300 });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/interrupted|Stopped after/);
  });

  it.each([
    ['deep recursion', 'function f() { return f(); } f();'],
    ['a native stack overflow', 'let a = []; let p = a; for (let i = 0; i < 100000; i++) { const n = []; p.push(n); p = n; } return JSON.stringify(a);'],
    ['unbounded memory', 'const a = []; for (;;) a.push("x".repeat(100000));'],
  ])('contains %s without harming the host', async (_label, code) => {
    const result = await run(code);

    expect(result.ok).toBe(false);
    expect((await run('return 1 + 1')).value).toBe(2);
  });
});
