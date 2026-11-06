import type { CallToolResult, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { ToolAccess } from './tool-policy.js';

/**
 * Tools kept out of the tool list but still runnable: the model finds them with a search tool
 * and runs them through a read or write tool, so their schemas cost tokens only when looked up.
 */

type GatewayCallback = (args: unknown, ctx: unknown) => CallToolResult | Promise<CallToolResult>;

export interface GatewayOperation {
  name: string;
  toolset: string;
  access: ToolAccess;
  description: string;
  inputSchema?: StandardSchemaWithJSON;
  cb: GatewayCallback;
}

export interface GatewayOperationSummary {
  name: string;
  toolset: string;
  access: ToolAccess;
  description: string;
  inputSchema: Record<string, unknown>;
}

const EMPTY_INPUT_SCHEMA = { type: 'object', properties: {} };

const words = (text: string): string[] =>
  text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1);

const matches = (term: string, candidates: string[]): boolean =>
  candidates.some((word) => word === term || (term.length >= 4 && word.startsWith(term)) || (word.length >= 4 && term.startsWith(word)));

/** Keyword score: a term in the name counts most, then the toolset, then the description. */
export function scoreOperation(operation: GatewayOperation, query: string): number {
  const name = words(operation.name);
  const toolset = words(operation.toolset);
  const description = words(operation.description);
  return words(query).reduce((score, term) => {
    if (matches(term, name)) return score + 3;
    if (matches(term, toolset)) return score + 2;
    return matches(term, description) ? score + 1 : score;
  }, 0);
}

export function inputJsonSchema(schema: StandardSchemaWithJSON | undefined): Record<string, unknown> {
  if (!schema) return EMPTY_INPUT_SCHEMA;
  const { $schema: _ignored, ...json } = schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' });
  return json;
}

export const summarizeOperation = (operation: GatewayOperation): GatewayOperationSummary => ({
  name: operation.name,
  toolset: operation.toolset,
  access: operation.access,
  description: operation.description,
  inputSchema: inputJsonSchema(operation.inputSchema),
});

const errorResult = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

/** Validates the arguments against the operation's schema, as the MCP server would for a listed tool, then runs it. */
export async function runOperation(operation: GatewayOperation, args: unknown, ctx: unknown): Promise<CallToolResult> {
  if (!operation.inputSchema) return operation.cb(args, ctx);
  const result = await operation.inputSchema['~standard'].validate(args ?? {});
  if (result.issues) {
    const problems = result.issues.map((issue) => {
      const path = (issue.path ?? []).map((part) => (typeof part === 'object' ? String(part.key) : String(part))).join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return errorResult(`Invalid arguments for ${operation.name}: ${problems.join('; ')}`);
  }
  return operation.cb(result.value, ctx);
}

export interface ToolGateway {
  add(operation: GatewayOperation): void;
  get(name: string): GatewayOperation | undefined;
  operations(): GatewayOperation[];
  /** Best matches first; an empty query lists the toolset's operations (or all of them) in order. */
  search(query: string, options?: { toolset?: string; limit?: number }): GatewayOperation[];
}

export function createToolGateway(): ToolGateway {
  const byName = new Map<string, GatewayOperation>();

  return {
    add(operation) {
      byName.set(operation.name, operation);
    },
    get: (name) => byName.get(name),
    operations: () => [...byName.values()],
    search(query, { toolset, limit = 8 } = {}) {
      const pool = [...byName.values()].filter((operation) => !toolset || operation.toolset === toolset);
      if (words(query).length === 0) return pool.slice(0, limit);
      return pool
        .map((operation) => ({ operation, score: scoreOperation(operation, query) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ operation }) => operation);
    },
  };
}
