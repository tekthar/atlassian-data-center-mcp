import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { SANDBOX_WORKER_SOURCE } from './code-sandbox-worker-source.js';

export interface SandboxLimits {
  /** Wall-clock limit for the whole run, tool calls included. */
  timeoutMs: number;
  memoryBytes: number;
  stackBytes: number;
  maxToolCalls: number;
  maxConcurrentCalls: number;
  maxLogChars: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  timeoutMs: 30_000,
  memoryBytes: 64 * 1024 * 1024,
  stackBytes: 256 * 1024,
  maxToolCalls: 50,
  maxConcurrentCalls: 4,
  maxLogChars: 20_000,
};

/** Runs one tool for sandboxed code: resolves to the tool's result value, or throws with a message the code can catch. */
export type SandboxToolCaller = (tool: string, args: unknown) => Promise<unknown>;

export interface SandboxResult {
  ok: boolean;
  /** The code's return value, when ok. */
  value?: unknown;
  error?: string;
  logs: string[];
  toolCalls: number;
}

interface CallMessage { type: 'call'; id: number; tool: string; args: string }
type WorkerMessage = CallMessage | { type: 'log'; text: string } | { type: 'done'; ok: boolean; value?: string; error?: string };

const moduleRequire = createRequire(import.meta.url);
const moduleUrl = (name: string) => pathToFileURL(moduleRequire.resolve(name)).href;

/** Extra time the worker gets past its own deadline before it is terminated. */
const TERMINATE_GRACE_MS = 1_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

class SandboxRun {
  private readonly logs: string[] = [];
  private logChars = 0;
  private toolCalls = 0;
  private active = 0;
  private readonly queue: CallMessage[] = [];
  private finished = false;
  private readonly worker: Worker;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(code: string, toolNames: string[], private readonly callTool: SandboxToolCaller,
    private readonly limits: SandboxLimits, private readonly resolve: (result: SandboxResult) => void) {
    this.worker = new Worker(SANDBOX_WORKER_SOURCE, {
      eval: true,
      workerData: { code, toolNames, limits, coreUrl: moduleUrl('quickjs-emscripten-core'), variantUrl: moduleUrl('@jitl/quickjs-wasmfile-release-sync') },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
      stdout: true,
      stderr: true,
    });
    this.timer = setTimeout(() => this.finish({ ok: false, error: `Stopped after ${limits.timeoutMs / 1000} seconds.` }), limits.timeoutMs + TERMINATE_GRACE_MS);
    // Worker output is drained, never forwarded: the parent's stdout carries the MCP protocol.
    this.worker.stdout.resume();
    this.worker.stderr.resume();
    this.worker.on('message', (message: WorkerMessage) => this.onMessage(message));
    this.worker.on('error', (error) => this.finish({ ok: false, error: `The sandbox stopped: ${messageOf(error)}` }));
    this.worker.on('exit', () => this.finish({ ok: false, error: 'The sandbox exited before the code finished.' }));
  }

  private onMessage(message: WorkerMessage): void {
    if (message.type === 'log') this.addLog(message.text);
    else if (message.type === 'call') this.enqueue(message);
    else if (message.ok) this.finish({ ok: true, value: JSON.parse(message.value ?? 'null') });
    else this.finish({ ok: false, error: message.error ?? 'Unknown error' });
  }

  private addLog(text: string): void {
    if (this.logChars >= this.limits.maxLogChars) return;
    const room = this.limits.maxLogChars - this.logChars;
    this.logs.push(text.length > room ? `${text.slice(0, room)}… (logs truncated)` : text);
    this.logChars += Math.min(text.length, room);
  }

  private enqueue(message: CallMessage): void {
    if (this.toolCalls >= this.limits.maxToolCalls) {
      this.reply(message.id, false, `Tool call limit reached (${this.limits.maxToolCalls} per run).`);
      return;
    }
    this.toolCalls++;
    this.queue.push(message);
    this.drain();
  }

  private drain(): void {
    while (!this.finished && this.active < this.limits.maxConcurrentCalls && this.queue.length > 0) {
      const { id, tool, args } = this.queue.shift()!;
      this.active++;
      Promise.resolve()
        .then(() => this.callTool(tool, JSON.parse(args)))
        .then((value) => this.reply(id, true, JSON.stringify(value ?? null)), (error) => this.reply(id, false, messageOf(error)))
        .finally(() => { this.active--; this.drain(); });
    }
  }

  private reply(id: number, ok: boolean, value: string): void {
    if (!this.finished) this.worker.postMessage({ id, ok, value });
  }

  private finish(result: Omit<SandboxResult, 'logs' | 'toolCalls'>): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    void this.worker.terminate();
    this.resolve({ ...result, logs: this.logs, toolCalls: this.toolCalls });
  }
}

/** Runs model-written JavaScript in a QuickJS sandbox in a worker thread; it can only reach the named tools through `callTool`. */
export function runSandboxedCode(code: string, toolNames: string[], callTool: SandboxToolCaller,
  limits: SandboxLimits = DEFAULT_SANDBOX_LIMITS): Promise<SandboxResult> {
  return new Promise((resolve) => new SandboxRun(code, toolNames, callTool, limits, resolve));
}
