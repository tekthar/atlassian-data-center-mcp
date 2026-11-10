import { formatToolResponse, handleApiOperation } from '@atlassian-dc-mcp/common';

/** Runs an app call and formats its result or error as a tool response. */
export const respond = async <T>(operation: () => Promise<T>, errorPrefix: string) =>
  formatToolResponse(await handleApiOperation(operation, errorPrefix));

/** A tool response for input the tool refuses before calling the app. */
export const invalid = (error: string) => formatToolResponse({ success: false, error });
