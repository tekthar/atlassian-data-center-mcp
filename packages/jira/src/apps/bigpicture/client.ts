import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * BigPicture (Appfire, formerly SoftwarePlant) serves its public REST API at
 * /rest/softwareplant-bigpicture/1.0/public. Its "boxes" are the portfolios, programs, projects and
 * iterations it plans; its tasks are Jira issues, named by key. Paths were read from the BigPicture
 * 8.70.11.6 app's own Jakarta REST resources: only the `publicapi` packages, which Appfire documents.
 */
const BASE_PATH = '/softwareplant-bigpicture/1.0/public';

export function startBigPictureRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls BigPicture, turning a 404 into a message that names the subject and BigPicture itself. */
export function callBigPicture<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the id or key and your access, and that BigPicture is installed on this instance.`,
  });
}
