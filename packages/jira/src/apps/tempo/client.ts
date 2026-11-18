import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Tempo Timesheets serves its public REST API, version 4, at /rest/tempo-timesheets/4: worklogs, timesheet
 * periods and timesheet approvals. Paths, query parameters and JSON names were read from the Tempo 20.0.1
 * app's own Jakarta REST resources and match Tempo's Data Center API documentation.
 */
const BASE_PATH = '/tempo-timesheets/4';

export function startTempoRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Tempo, turning a 404 into a message that names the subject and Tempo itself. */
export function callTempo<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the id, key or date and your access, and that Tempo Timesheets is installed on this instance.`,
  });
}
