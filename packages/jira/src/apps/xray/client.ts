import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Xray Data Center serves two REST APIs under Jira's /rest: /raven/1.0 (the v1 and deprecated
 * v1 resources) and /raven/2.0 (the v2 resources, plus v1 again). Paths and bodies here were
 * read from the Xray 8.6.0 app's own JAX-RS resources.
 */

export type XrayApiVersion = '1.0' | '2.0';

export type XrayRequest = AppRequest;

/** Starts a request to `/rest/raven/<version><url>`. */
export function startXrayRequest<T>(version: XrayApiVersion, options: XrayRequest): CancelablePromise<T> {
  return startAppRequest<T>(`/raven/${version}`, options);
}

/** Calls Xray, turning a 404 into a message that names the missing subject and Xray itself. */
export function callXray<T = unknown>(version: XrayApiVersion, options: XrayRequest, subject: string): Promise<T> {
  return callApp<T>(`/raven/${version}`, options, {
    notFound: `${subject} was not found (404). Check the key or id and your access, and that Xray is installed on this instance.`,
  });
}
