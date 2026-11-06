import type { ApiRequestOptions } from '../../jira-client/core/ApiRequestOptions.js';
import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { OpenAPI } from '../../jira-client/core/OpenAPI.js';
import { request as __request } from '../../jira-client/core/request.js';
import { asRecord } from '../../tools/context.js';

/*
 * Xray Data Center serves two REST APIs under Jira's /rest: /raven/1.0 (the v1 and deprecated
 * v1 resources) and /raven/2.0 (the v2 resources, plus v1 again). Paths and bodies here were
 * read from the Xray 8.6.0 app's own JAX-RS resources. The generated Jira client doesn't cover
 * them, so calls go through its request core, as the service desk tools do.
 */

export type XrayApiVersion = '1.0' | '2.0';

export type XrayRequest = Omit<ApiRequestOptions, 'mediaType' | 'url'> & { url: string };

const isNotFound = (error: unknown) => asRecord(error).status === 404;

/** Starts a request to `/rest/raven/<version><url>`. */
export function startXrayRequest<T>(version: XrayApiVersion, options: XrayRequest): CancelablePromise<T> {
  return __request<T>(OpenAPI, { ...options, url: `/raven/${version}${options.url}`, mediaType: 'application/json' });
}

/** Calls Xray, turning a 404 into a message that names the missing subject and Xray itself. */
export async function callXray<T = unknown>(version: XrayApiVersion, options: XrayRequest, subject: string): Promise<T> {
  try {
    return await startXrayRequest<T>(version, options);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    throw new Error(`${subject} was not found (404). Check the key or id and your access, and that Xray is installed on this instance.`);
  }
}
