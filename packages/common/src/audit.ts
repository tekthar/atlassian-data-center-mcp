import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/server';

/*
 * An opt-in audit log (ATLASSIAN_DC_MCP_AUDIT=1): one JSON line per tool call, with the time, server, tool,
 * outcome and duration, and never the arguments or results. A tool run through the tool search or the code
 * sandbox is recorded too, with `via`, so the log shows what the agent actually did. Adapted from the abp-mcp
 * bridge. Writing is best-effort: a failed write never fails the tool call.
 */

export const AUDIT_ENV_VAR = 'ATLASSIAN_DC_MCP_AUDIT';
export const AUDIT_FILE_ENV_VAR = 'ATLASSIAN_DC_MCP_AUDIT_FILE';

export interface AuditEntry {
  tool: string;
  /** How the tool was reached when not called directly: through the tool search, or from the code sandbox. */
  via?: 'gateway' | 'code';
  outcome: 'ok' | 'error';
  durationMs: number;
}

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;
/** After a failed write, the log skips writing for this long before it tries again. */
export const AUDIT_BACKOFF_MS = 60_000;
// A rename another process (a second server, antivirus) holds open, or already did.
const ROTATION_BUSY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOENT']);

export type AuditFs = Pick<typeof fs, 'mkdirSync' | 'statSync' | 'existsSync' | 'renameSync' | 'appendFileSync'>;

export interface AuditLogOptions {
  maxBytes?: number;
  now?: () => number;
  fs?: AuditFs;
  warn?: (message: string) => void;
}

export type ToolCallback = (args: unknown, ctx: unknown) => CallToolResult | Promise<CallToolResult>;

export class AuditLog {
  private readonly fs: AuditFs;
  private readonly now: () => number;
  private pausedUntil = 0;
  private warned = false;

  constructor(readonly file: string, private readonly server: string, private readonly options: AuditLogOptions = {}) {
    this.fs = options.fs ?? fs;
    this.now = options.now ?? Date.now;
  }

  /** The audit log when ATLASSIAN_DC_MCP_AUDIT is on: in ATLASSIAN_DC_MCP_AUDIT_FILE, or ~/.atlassian-dc-mcp/audit/<server>.jsonl. */
  static fromEnv(server: string, env: Record<string, string | undefined> = process.env): AuditLog | undefined {
    if (!['1', 'true', 'on', 'yes'].includes((env[AUDIT_ENV_VAR] ?? '').trim().toLowerCase())) return undefined;
    const file = env[AUDIT_FILE_ENV_VAR]?.trim() || path.join(os.homedir(), '.atlassian-dc-mcp', 'audit', `${server}.jsonl`);
    return new AuditLog(file, server, { warn: (message) => process.stderr.write(`${message}\n`) });
  }

  /** Appends one entry, stamped with when the call started (default: now). Never throws. */
  record(entry: AuditEntry, startedAt = this.now()): void {
    if (this.now() < this.pausedUntil) return;
    try {
      this.fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      this.rotateIfFull();
      const line = JSON.stringify({ time: new Date(startedAt).toISOString(), server: this.server, ...entry });
      this.fs.appendFileSync(this.file, `${line}\n`, { mode: 0o600 });
    } catch (error) {
      this.pausedUntil = this.now() + AUDIT_BACKOFF_MS;
      if (!this.warned) {
        this.warned = true;
        this.options.warn?.(`Could not write the audit log ${this.file} (${(error as Error).message}). Tool calls are not affected; auditing pauses for a minute after each failure.`);
      }
    }
  }

  /** The callback, recording each call's outcome and duration. */
  wrap(tool: string, cb: ToolCallback, via?: AuditEntry['via']): ToolCallback {
    return async (args: unknown, ctx: unknown) => {
      const started = this.now();
      const done = (outcome: AuditEntry['outcome']) =>
        this.record({ tool, ...(via ? { via } : {}), outcome, durationMs: this.now() - started }, started);
      try {
        const result = await cb(args, ctx);
        done(result.isError ? 'error' : 'ok');
        return result;
      } catch (error) {
        done('error');
        throw error;
      }
    };
  }

  private rotateIfFull(): void {
    let size: number;
    try {
      size = this.fs.statSync(this.file).size;
    } catch {
      return;
    }
    if (size < (this.options.maxBytes ?? MAX_BYTES)) return;
    try {
      for (let index = KEEP - 1; index >= 1; index--) {
        if (this.fs.existsSync(`${this.file}.${index}`)) this.fs.renameSync(`${this.file}.${index}`, `${this.file}.${index + 1}`);
      }
      this.fs.renameSync(this.file, `${this.file}.1`);
    } catch (error) {
      if (!ROTATION_BUSY_CODES.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  }
}

const logs = new WeakMap<object, AuditLog>();

/** Records every tool registered on the server from now on. */
export function auditServer<S extends { registerTool: (...args: never[]) => unknown }>(server: S, log: AuditLog): S {
  const register = (server.registerTool as (...args: unknown[]) => unknown).bind(server);
  (server as { registerTool: unknown }).registerTool = (name: string, config: unknown, cb: ToolCallback) =>
    register(name, config, log.wrap(name, cb));
  logs.set(server, log);
  return server;
}

/** The audit log attached to a server, if auditing is on. */
export function auditLogFor(server: object): AuditLog | undefined {
  return logs.get(server);
}
