import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Timesheet Tracking for Jira (by TouchDown Apps) serves the REST API its own pages use at /rest/reportrest/1.0.
 * It isn't published, so paths, bodies and response shapes were read from the app's 9.3.8-jira-11 Jakarta REST
 * resources. Some of its GET routes delete (saved-report/delete-report, timer/delete, workplan/delete); no tool
 * calls them.
 */
const BASE_PATH = '/reportrest/1.0';

export function startTimesheetTrackingRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Timesheet Tracking, explaining a 404 and a refusal in terms of the subject and the app itself. */
export function callTimesheetTracking<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the key, and that Timesheet Tracking for Jira is installed on this instance.`,
    forbidden: (status) => `Timesheet Tracking refused this (${status}). Its access settings may not let your user use it.`,
  });
}
