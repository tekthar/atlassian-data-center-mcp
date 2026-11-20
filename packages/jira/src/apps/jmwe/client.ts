import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * JMWE (Jira Misc Workflow Extensions, by Appfire) serves the REST API its own admin pages use at /rest/jmwe/1.
 * JMWE doesn't publish it as a public API, so paths, query parameters and their defaults were read from the
 * JMWE 10.1.3 app's own Jakarta REST resources.
 */
const BASE_PATH = '/jmwe/1';

export function startJmweRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls JMWE, explaining a 404 and a refusal in terms of the subject and JMWE itself. */
export function callJmwe<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the name or id, and that JMWE is installed on this instance.`,
    forbidden: (status) => `JMWE refused this (${status}). Most of JMWE's configuration is for Jira administrators.`,
  });
}
