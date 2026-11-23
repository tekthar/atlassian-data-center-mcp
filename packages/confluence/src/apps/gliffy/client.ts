import type { CancelablePromise } from '../../confluence-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Gliffy Diagrams for Confluence serves the REST API its own editor uses at /rest/gliffy/1.0. Gliffy doesn't
 * publish it, so paths, query parameters and response shapes were read from the Gliffy 13.5.0 app's own Jakarta
 * REST resources.
 */
const BASE_PATH = '/rest/gliffy/1.0';

export function startGliffyRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Gliffy, turning a 404 into a message that names the subject and Gliffy itself. */
export function callGliffy<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options,
    `${subject} was not found (404). Check the id, your access, and that Gliffy is installed on this instance.`);
}
