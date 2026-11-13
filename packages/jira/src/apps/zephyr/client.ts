import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Zephyr (SmartBear, formerly Zephyr Scale and Test Management for Jira) serves its public REST API at
 * /rest/atm/1.0. That API calls a test cycle a "test run": keys like QA-R12. Paths were read from the
 * Zephyr 12.12.1 app's own Jakarta REST resources and match SmartBear's published Server API v1.
 */
const BASE_PATH = '/atm/1.0';

export function startZephyrRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Zephyr, turning a 404 into a message that names the subject and Zephyr itself. */
export function callZephyr<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the key and your access, and that Zephyr is installed on this instance.`,
  });
}
