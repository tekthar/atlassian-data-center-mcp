import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * draw.io for Jira serves its REST API at /rest/drawio/1.0. Diagrams are issue attachments. Paths and
 * response shapes were read from the draw.io for Jira 11.2.1 app's own Jakarta REST resources.
 */
const BASE_PATH = '/drawio/1.0';

export function startDrawioRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls draw.io, turning a 404 into a message that names the subject and draw.io itself. */
export function callDrawio<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the issue key and diagram name, your access, and that draw.io is installed on this instance.`,
  });
}
