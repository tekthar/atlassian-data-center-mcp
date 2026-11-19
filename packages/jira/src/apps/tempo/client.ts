import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Tempo Timesheets serves its public REST APIs under Jira's /rest: Timesheets version 4 for worklogs, periods
 * and approvals, and its bundled Accounts and Teams apps their own, version 1 and version 2. Paths, query
 * parameters and JSON names were read from the Tempo 20.0.1 apps' own Jakarta REST resources and match Tempo's
 * Data Center API documentation.
 */
export const TEMPO_APIS = {
  timesheets: '/tempo-timesheets/4',
  accounts: '/tempo-accounts/1',
  teams: '/tempo-teams/2',
} as const;

export type TempoApi = keyof typeof TEMPO_APIS;

export function startTempoRequest<T>(options: AppRequest, api: TempoApi = 'timesheets'): CancelablePromise<T> {
  return startAppRequest<T>(TEMPO_APIS[api], options);
}

/** Calls Tempo, turning a 404 into a message that names the subject and Tempo itself. */
export function callTempo<T = unknown>(options: AppRequest, subject: string, api: TempoApi = 'timesheets'): Promise<T> {
  return callApp<T>(TEMPO_APIS[api], options, {
    notFound: `${subject} was not found (404). Check the id, key or date and your access, and that Tempo Timesheets is installed on this instance.`,
  });
}
