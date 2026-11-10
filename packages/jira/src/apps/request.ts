import type { ApiRequestOptions } from '../jira-client/core/ApiRequestOptions.js';
import type { CancelablePromise } from '../jira-client/core/CancelablePromise.js';
import { OpenAPI } from '../jira-client/core/OpenAPI.js';
import { request as __request } from '../jira-client/core/request.js';
import { asRecord } from '../tools/context.js';

/*
 * Apps serve their own REST APIs under Jira's /rest, which the generated Jira client doesn't cover, so
 * their calls go through its request core, as the service desk tools do.
 */

/** A request to an app's REST API, with `url` relative to the app's base path. Bodies are JSON unless `mediaType` says otherwise. */
export type AppRequest = Omit<ApiRequestOptions, 'url'> & { url: string };

/** What to say instead of a bare 404, or a 401 or 403 when given. */
export interface AppErrorMessages {
  notFound: string;
  forbidden?: (status: number) => string;
}

/** Starts a request to `/rest<basePath><url>`. */
export function startAppRequest<T>(basePath: string, options: AppRequest): CancelablePromise<T> {
  return __request<T>(OpenAPI, { ...options, url: `${basePath}${options.url}`, mediaType: options.mediaType ?? 'application/json' });
}

/** Calls an app, explaining the errors `messages` covers and passing the rest through. */
export async function callApp<T>(basePath: string, options: AppRequest, messages: AppErrorMessages): Promise<T> {
  try {
    return await startAppRequest<T>(basePath, options);
  } catch (error) {
    const status = asRecord(error).status;
    if (status === 404) throw new Error(messages.notFound);
    if ((status === 401 || status === 403) && messages.forbidden) throw new Error(messages.forbidden(status));
    throw error;
  }
}
