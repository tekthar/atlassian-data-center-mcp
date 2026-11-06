import { z } from 'zod';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { DEFAULT_SANDBOX_LIMITS, runSandboxedCode, type SandboxLimits } from './code-sandbox.js';
import { runOperation, type ToolGateway } from './tool-gateway.js';
import { formatToolResponse } from './tool-response.js';

export interface CodeToolOptions {
  prefix: string;
  product: string;
  limits?: SandboxLimits;
}

const MAX_CODE_CHARS = 20_000;
const MAX_RESULT_CHARS = 100_000;

const codeSchema = z.object({
  code: z.string().min(1).max(MAX_CODE_CHARS).describe('Body of an async JavaScript function. Use await and return the result.'),
});

const textOf = (result: CallToolResult): string =>
  result.content.map((block) => (block.type === 'text' ? block.text : `[${block.type} content omitted]`)).join('\n');

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

interface ApiEnvelope { success: boolean; data?: unknown; error?: unknown; details?: unknown }

const isEnvelope = (value: unknown): value is ApiEnvelope =>
  typeof value === 'object' && value !== null && typeof (value as ApiEnvelope).success === 'boolean';

const errorText = ({ error, details }: ApiEnvelope): string =>
  [String(error ?? 'Tool failed'), details === undefined ? '' : JSON.stringify(details)].filter(Boolean).join(' ');

/**
 * A tool's result as a value for sandboxed code: the `data` of a `{ success, data }` result, or
 * parsed JSON, or the text. A failed call throws, with the tool's error message and details.
 */
export function toolResultValue(result: CallToolResult): unknown {
  const value = parseJson(textOf(result));
  if (isEnvelope(value)) {
    if (!value.success) throw new Error(errorText(value));
    return value.data;
  }
  if (result.isError) throw new Error(typeof value === 'string' ? value : JSON.stringify(value));
  return value;
}

function describeTool(options: CodeToolOptions, limits: SandboxLimits): string {
  const { prefix, product } = options;
  return `Run JavaScript in a sandbox to combine several read-only ${product} tool calls in one step: loop over results, follow links, filter or aggregate, and return only what you need. ` +
    `Call a tool with \`await tools.<toolName>(args)\`, for example \`await tools.${prefix}_getIssue({ issueKey: 'ABC-1' })\`; it returns the tool's data (what the tool's JSON result holds under "data") and throws on error. ` +
    `Any read tool can be called: the ones listed directly and the ones found with ${prefix}_searchTools. Tools that change ${product} cannot. ` +
    `Promise.all runs calls in parallel (${limits.maxConcurrentCalls} at a time). console.log output is returned with the result. ` +
    `The sandbox has no network, file or process access, and stops after ${limits.timeoutMs / 1000} seconds or ${limits.maxToolCalls} tool calls.`;
}

const truncated = (value: unknown) => {
  const json = JSON.stringify(value) ?? 'null';
  return json.length <= MAX_RESULT_CHARS ? value : { truncated: true, note: `Result cut to ${MAX_RESULT_CHARS} characters; return less.`, start: json.slice(0, MAX_RESULT_CHARS) };
};

export const codeToolName = (prefix: string) => `${prefix}_runCode`;

/** Registers `<prefix>_runCode`, which runs code that can call the given read-only tools. */
export function registerCodeTool(server: McpServer, readTools: ToolGateway, options: CodeToolOptions): string {
  const limits = options.limits ?? DEFAULT_SANDBOX_LIMITS;
  const name = codeToolName(options.prefix);
  server.registerTool(
    name,
    { description: describeTool(options, limits), inputSchema: codeSchema, annotations: { readOnlyHint: true } },
    async ({ code }, ctx) => {
      const names = readTools.operations().map((operation) => operation.name);
      const result = await runSandboxedCode(code, names, async (tool, args) => {
        const operation = readTools.get(tool);
        if (!operation) throw new Error(`Unknown or non-read tool "${tool}".`);
        return toolResultValue(await runOperation(operation, args, ctx));
      }, limits);
      const { logs, toolCalls } = result;
      if (!result.ok) {
        return { ...formatToolResponse({ error: result.error, logs, toolCalls }), isError: true };
      }
      return formatToolResponse({ result: truncated(result.value), logs, toolCalls });
    },
  );
  return name;
}
