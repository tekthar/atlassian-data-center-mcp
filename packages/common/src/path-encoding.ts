/**
 * Encodes values substituted into REST path templates such as `/api/2/issueLink/{linkId}`.
 *
 * Tool arguments come from a model and may carry text planted in issues, pages or pull requests.
 * `encodeURI` would leave `/`, `?` and `#` intact, and `fetch` collapses `../` segments, so a
 * crafted id could move a request onto another endpoint with the same method and token.
 * Every value is therefore encoded with `encodeURIComponent`, and dot segments are refused.
 */

/** Template parameters that hold a repository file path and legitimately contain `/`. */
const MULTI_SEGMENT_PARAMETERS = new Set(['path']);

const DOT_SEGMENT = /(^|[\\/])\.{1,2}([\\/]|$)/;

export class UnsafePathParameterError extends Error {
  constructor(name: string, reason: string) {
    super(`Refusing path parameter "${name}": ${reason}`);
    this.name = 'UnsafePathParameterError';
  }
}

export function encodePathParam(value: string, name: string): string {
  if (DOT_SEGMENT.test(value)) {
    throw new UnsafePathParameterError(name, 'it contains a "." or ".." segment');
  }

  if (MULTI_SEGMENT_PARAMETERS.has(name)) {
    return value.split('/').map(encodeURIComponent).join('/');
  }

  if (value.length === 0) {
    throw new UnsafePathParameterError(name, 'it is empty');
  }

  return encodeURIComponent(value);
}
