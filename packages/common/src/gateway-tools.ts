import { z } from 'zod';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { formatToolResponse } from './tool-response.js';
import { runOperation, summarizeOperation, type GatewayOperation, type ToolGateway } from './tool-gateway.js';
import type { ToolsetDefinition } from './tool-policy.js';

export interface GatewayToolsOptions {
  /** Tool name prefix, e.g. `jira` gives `jira_searchTools`. */
  prefix: string;
  /** Product name used in descriptions, e.g. `Jira`. */
  product: string;
  toolsets: Readonly<Record<string, ToolsetDefinition>>;
  /** Name of the code tool, when registered, so search results can point to it. */
  codeTool?: string;
}

const MAX_SEARCH_RESULTS = 20;

const searchSchema = z.object({
  query: z.string().describe('Words describing what you want to do, e.g. "sprint issues" or "log work". Empty lists the toolset\'s tools.'),
  toolset: z.string().optional().describe('Only search this toolset'),
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional().describe('Maximum tools to return (default 8)'),
});

const runSchema = z.object({
  tool: z.string().describe('Exact tool name from the search results'),
  arguments: z.record(z.string(), z.unknown()).optional().describe("The tool's arguments, matching its inputSchema"),
});

const errorResult = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

function toolsetOverview(operations: GatewayOperation[], options: GatewayToolsOptions): string {
  const counts = new Map<string, number>();
  operations.forEach((operation) => counts.set(operation.toolset, (counts.get(operation.toolset) ?? 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => `- ${name} (${count}): ${options.toolsets[name]?.description ?? ''}`)
    .join('\n');
}

function registerSearchTool(server: McpServer, gateway: ToolGateway, options: GatewayToolsOptions): void {
  const { prefix, product } = options;
  const overview = toolsetOverview(gateway.operations(), options);
  server.registerTool(
    `${prefix}_searchTools`,
    {
      description: `Find more ${product} tools that are not listed directly. Returns each match with its description and inputSchema; run it with ${prefix}_runReadTool (access "read") or ${prefix}_runWriteTool (access "write").${options.codeTool ? ` Read tools can also be called from ${options.codeTool}.` : ''} Toolsets available this way:\n${overview}`,
      inputSchema: searchSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ query, toolset, limit }) => {
      const found = gateway.search(query, { toolset, limit });
      if (found.length === 0) {
        return formatToolResponse({ tools: [], hint: `No tool matched "${query}". Try other words or one of these toolsets:\n${overview}` });
      }
      return formatToolResponse({ tools: found.map(summarizeOperation) });
    },
  );
}

function registerRunTool(server: McpServer, gateway: ToolGateway, options: GatewayToolsOptions, kind: 'read' | 'write'): void {
  const { prefix, product } = options;
  const other = kind === 'read' ? `${prefix}_runWriteTool` : `${prefix}_runReadTool`;
  const fits = (operation: GatewayOperation) => (operation.access === 'read') === (kind === 'read');
  server.registerTool(
    kind === 'read' ? `${prefix}_runReadTool` : `${prefix}_runWriteTool`,
    {
      description: kind === 'read'
        ? `Run a ${product} tool found with ${prefix}_searchTools whose access is "read". It does not change ${product}.`
        : `Run a ${product} tool found with ${prefix}_searchTools whose access is "write". It changes ${product}.`,
      inputSchema: runSchema,
      annotations: kind === 'read' ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: false },
    },
    async ({ tool, arguments: args }, ctx) => {
      const operation = gateway.get(tool);
      if (!operation) return errorResult(`Unknown tool "${tool}". Find tools with ${prefix}_searchTools.`);
      if (!fits(operation)) return errorResult(`${tool} has access "${operation.access}"; run it with ${other}.`);
      return runOperation(operation, args ?? {}, ctx);
    },
  );
}

/** Registers the search tool plus a run tool for each access level the gateway holds. Returns their names. */
export function registerGatewayTools(server: McpServer, gateway: ToolGateway, options: GatewayToolsOptions): string[] {
  const operations = gateway.operations();
  if (operations.length === 0) return [];
  const { prefix } = options;
  const names = [`${prefix}_searchTools`];
  registerSearchTool(server, gateway, options);
  if (operations.some((operation) => operation.access === 'read')) {
    registerRunTool(server, gateway, options, 'read');
    names.push(`${prefix}_runReadTool`);
  }
  if (operations.some((operation) => operation.access !== 'read')) {
    registerRunTool(server, gateway, options, 'write');
    names.push(`${prefix}_runWriteTool`);
  }
  return names;
}
