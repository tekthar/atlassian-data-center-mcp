import type { ApiRequestOptions } from '../confluence-client/core/ApiRequestOptions.js';
import type { CancelablePromise } from '../confluence-client/core/CancelablePromise.js';
import { OpenAPI } from '../confluence-client/core/OpenAPI.js';
import { request as __request } from '../confluence-client/core/request.js';
import { asRecord } from '../tools/context.js';

/*
 * Apps serve their own REST APIs beside Confluence's, under /rest, which the generated client doesn't
 * cover, so their calls go through its request core. The client's base is Confluence's context root,
 * so an app's base path starts with /rest.
 */

/** A request to an app's REST API, with `url` relative to the app's base path. Bodies are JSON unless `mediaType` says otherwise. */
export type AppRequest = Omit<ApiRequestOptions, 'url'> & { url: string };

/** Starts a request to `<context root><basePath><url>`. */
export function startAppRequest<T>(basePath: string, options: AppRequest): CancelablePromise<T> {
  return __request<T>(OpenAPI, { ...options, url: `${basePath}${options.url}`, mediaType: options.mediaType ?? 'application/json' });
}

/** Calls an app, replacing a 404 with `notFound` and passing other errors through. */
export async function callApp<T>(basePath: string, options: AppRequest, notFound: string): Promise<T> {
  try {
    return await startAppRequest<T>(basePath, options);
  } catch (error) {
    if (asRecord(error).status === 404) throw new Error(notFound);
    throw error;
  }
}
