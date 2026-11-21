import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Structure by Tempo (formerly ALM Works) serves its REST API at /rest/structure/2.0. Paths, query parameters
 * and their defaults were read from the Structure 9.14.1 app's own Jakarta REST resources and checked against
 * Tempo's Structure REST API reference.
 */
const BASE_PATH = '/structure/2.0';

export function startStructureRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Structure, explaining a 404 and a refusal in terms of the subject and Structure itself. */
export function callStructure<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Structure answers 404 for a structure you can't view, too. Check the id, and that Structure is installed on this instance.`,
    forbidden: (status) => `Structure refused this (${status}). Structure's settings may not let your user use it, or the structure may not be shared with you.`,
  });
}
