import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * Git Integration for Jira (GitKraken, formerly BigBrassBand) serves /rest/gitplugin/1.0. Paths, parameters and beans
 * were read from the app's 6.1.9 Jakarta REST resources and match the routes and answers GitKraken documents for
 * Data Center. The app lets each user see the repositories and commits of the projects they may view.
 */
const BASE_PATH = '/gitplugin/1.0';

export function startGitIntegrationRequest<T>(options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(BASE_PATH, options);
}

/** Calls Git Integration, explaining a 404 and a refusal in terms of the subject and the app itself. */
export function callGitIntegration<T = unknown>(options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(BASE_PATH, options, {
    notFound: `${subject} was not found (404). Check the key or id, and that Git Integration for Jira is installed on this instance.`,
    forbidden: (status) => `Git Integration refused this (${status}). It shows code to people who may view the issue's project and its development tools.`,
  });
}
