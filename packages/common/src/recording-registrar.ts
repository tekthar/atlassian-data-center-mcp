import type { CallToolResult } from '@modelcontextprotocol/server';
import type { PolicyRegistrar } from './policy-registrar.js';

interface RecordedTool {
  config: { description?: string; inputSchema?: unknown; annotations?: unknown };
  cb: (args: unknown, extra: unknown) => CallToolResult | Promise<CallToolResult>;
}

interface ParseableSchema {
  parse: (value: unknown) => unknown;
}

const isParseable = (schema: unknown): schema is ParseableSchema =>
  typeof schema === 'object' && schema !== null && typeof (schema as ParseableSchema).parse === 'function';

/**
 * A registrar that records tools instead of serving them, for tests. `call` validates the
 * arguments against the tool's input schema, as the MCP server would, then runs the handler.
 */
export function createRecordingRegistrar() {
  const recorded = new Map<string, RecordedTool>();

  const registrar: PolicyRegistrar = {
    registerTool(name, config, cb) {
      recorded.set(name, { config, cb: cb as unknown as RecordedTool['cb'] });
      return undefined;
    },
    registeredTools: () => [...recorded.keys()],
    hiddenByPermission: () => [],
  };

  async function call(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    const tool = recorded.get(name);
    if (!tool) throw new Error(`Tool "${name}" was not registered.`);
    const parsed = isParseable(tool.config.inputSchema) ? tool.config.inputSchema.parse(args) : args;
    return tool.cb(parsed, {});
  }

  /** Runs the tool and parses the JSON text block every tool in this repo returns. */
  async function callJson(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const result = await call(name, args);
    const first = result.content[0];
    if (first?.type !== 'text') throw new Error(`Tool "${name}" did not return a text block.`);
    return JSON.parse(first.text);
  }

  return { registrar, recorded, call, callJson };
}
