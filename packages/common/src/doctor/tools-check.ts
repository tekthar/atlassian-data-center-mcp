import { spawn, type ChildProcess } from 'node:child_process';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/server';
import { redactLogText } from '../redact.js';
import type { CheckResult } from './doctor.js';

/** How to start the server: the same command an MCP client runs. */
export interface ServerCommand {
  command: string;
  args: string[];
}

interface ListedTool {
  name: string;
  description?: string;
}

const TIMEOUT_MS = 30_000;
const CHARS_PER_TOKEN = 4;

/** A minimal MCP client over a child process's stdio: one request at a time, JSON lines. */
class StdioClient {
  private buffer = '';
  private nextId = 0;
  private readonly waiting = new Map<number, (message: Record<string, unknown>) => void>();

  constructor(private readonly child: ChildProcess) {
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => this.receive(chunk));
  }

  request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method: string): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let end: number;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      if (!line) continue;
      const message = JSON.parse(line) as Record<string, unknown>;
      this.waiting.get(message.id as number)?.(message);
    }
  }
}

async function listTools(client: StdioClient): Promise<ListedTool[]> {
  await client.request('initialize', { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'doctor', version: '1' } });
  client.notify('notifications/initialized');
  const tools: ListedTool[] = [];
  let cursor: string | undefined;
  do {
    const response = await client.request('tools/list', cursor ? { cursor } : {});
    const result = (response.result ?? {}) as { tools?: ListedTool[]; nextCursor?: string };
    if (response.error) throw new Error(JSON.stringify(response.error));
    tools.push(...(result.tools ?? []));
    cursor = result.nextCursor;
  } while (cursor);
  return tools;
}

/** Tools the tool search reaches: its description lists each toolset as "- name (count): ...". */
function gatewayCount(tools: ListedTool[]): number {
  const search = tools.find((tool) => tool.name.endsWith('_searchTools'));
  return [...(search?.description ?? '').matchAll(/^- \S+ \((\d+)\):/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
}

export function summarizeTools(tools: ListedTool[], serverOutput: string[]): CheckResult {
  const tokens = Math.round(JSON.stringify(tools).length / CHARS_PER_TOKEN / 100) * 100;
  const search = tools.find((tool) => tool.name.endsWith('_searchTools'));
  const code = tools.find((tool) => tool.name.endsWith('_runCode'));
  const notes = [
    ...(search ? [`${gatewayCount(tools)} more through ${search.name}`] : []),
    ...(code ? [`${code.name} is on`] : []),
    ...serverOutput.map((line) => `server: ${line}`),
  ];
  return { status: tools.length > 0 ? 'ok' : 'warn', detail: `${tools.length} listed, about ${tokens.toLocaleString('en-US')} tokens of context`, notes };
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms / 1000} seconds`)), ms).unref());
}

/** Starts the server as an MCP client would and lists its tools, with whatever it printed while starting. */
export async function toolsCheck(server: ServerCommand, env: Record<string, string | undefined>, timeoutMs = TIMEOUT_MS): Promise<CheckResult> {
  const child = spawn(server.command, server.args, { env: env as NodeJS.ProcessEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
  const exited = new Promise<never>((_, reject) => child.on('exit', (code) => reject(new Error(`the server stopped (exit code ${code})`))));
  const output = () => redactLogText(stderr).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  try {
    const tools = await Promise.race([listTools(new StdioClient(child)), exited, timeout(timeoutMs)]);
    return summarizeTools(tools, output());
  } catch (error) {
    return {
      status: 'fail',
      detail: `could not list the tools: ${(error as Error).message}`,
      notes: output().slice(-10).map((line) => `server: ${line}`),
      fix: 'the server output above says why; fix it, then run doctor again',
    };
  } finally {
    child.kill();
  }
}
