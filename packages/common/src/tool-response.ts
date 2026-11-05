/**
 * Serialise a service result into the single text block every tool returns.
 *
 * Lives in a leaf module rather than the barrel so modules that build on it
 * (see attachment-tool-response.ts) can import it without an ESM cycle.
 *
 * The return type is left inferred rather than widened to `CallToolResult`: this
 * always produces exactly one text block, and callers read `content[0].text`.
 * A `{ success: false }` result also sets MCP's `isError`, so clients can tell a
 * failed call from a successful one without parsing the text.
 */
const isFailedResult = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && (result as { success?: unknown }).success === false;

export const formatToolResponse = (result: unknown) => ({
  content: [{
    type: 'text' as const,
    text: JSON.stringify(result)
  }],
  ...(isFailedResult(result) ? { isError: true as const } : {}),
});
