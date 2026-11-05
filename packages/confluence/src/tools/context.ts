/**
 * What a Confluence tool module needs from the server. The generated client services are static
 * and share the `OpenAPI` config that `ConfluenceService` sets up at startup, so modules call
 * them directly.
 */
export interface ConfluenceToolContext {
  /** Phrase used in tool descriptions, e.g. "Confluence Data Center edition instance". */
  instanceType: string;
  /** Default page size for list endpoints (CONFLUENCE_DEFAULT_PAGE_SIZE). */
  getPageSize: () => number;
}

/** Plain-object view of an untyped API value, for response shaping. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Array view of an API value the generated types describe as a single object. */
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
