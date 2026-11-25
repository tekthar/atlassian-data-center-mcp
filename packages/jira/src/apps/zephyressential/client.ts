import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Zephyr Essential (SmartBear, formerly Zephyr Squad and Zephyr for Jira) serves ZAPI at /rest/zapi/latest. Paths,
 * parameters and response beans were read from the app's 11.1.0 Jakarta REST resources. SmartBear documents ZAPI,
 * but its pages render in the browser, so the beans were the source.
 */
const BASE_PATH = '/zapi/latest';

export function startZephyrEssentialRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

const BROWSE = 'It needs you to browse the test\'s project.';

/** Calls ZAPI, explaining a 404 and a refusal in terms of the subject and what Zephyr Essential needs. */
export function callZephyrEssential<T = unknown>(options: AppRequest, subject: string, needs = BROWSE): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the key or id, and that Zephyr Essential is installed on this instance.`,
    forbidden: (status) => `Zephyr Essential refused this (${status}). ${needs}`,
  });
}
