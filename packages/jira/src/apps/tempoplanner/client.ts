import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Tempo's planning API, /rest/tempo-planning/1, comes from the tempo-plan-core plugin, which both Capacity Planner
 * (formerly Tempo Planner) and Tempo Timesheets bundle; Timesheets uses it to plan time in the calendar. Paths,
 * parameters and beans were read from Capacity Planner 20.0.02's Jakarta REST resources, whose planning routes match
 * Timesheets 20.0.1's, and checked against Tempo's published Planner OpenAPI.
 */
const BASE_PATH = '/tempo-planning/1';

export function startTempoPlannerRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Tempo's planning API, explaining a 404 and a refusal in terms of the subject and Tempo's permissions. */
export function callTempoPlanner<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the id or key, and that Capacity Planner or Tempo Timesheets is installed on this instance.`,
    forbidden: (status) => `Tempo refused this (${status}). Seeing other people's plans needs Tempo's permission to view their plans, usually through a Tempo team.`,
  });
}
