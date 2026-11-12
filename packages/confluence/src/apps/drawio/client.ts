import type { CancelablePromise } from '../../confluence-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * draw.io for Confluence serves its REST API at /rest/drawio/1.0. Paths and response shapes were read
 * from the draw.io 16.1.12 app's own Jakarta REST resources.
 */
const BASE_PATH = '/rest/drawio/1.0';

export function startDrawioRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls draw.io, turning a 404 into a message that names the subject and draw.io itself. */
export function callDrawio<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options,
    `${subject} was not found (404). Check the page id and diagram name, your access, and that draw.io is installed on this instance.`);
}
