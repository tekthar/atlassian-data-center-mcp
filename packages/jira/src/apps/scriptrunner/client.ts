import type { CancelablePromise } from '../../jira-client/core/CancelablePromise.js';
import { callApp, startAppRequest, type AppRequest } from '../request.js';

/*
 * ScriptRunner for Jira serves three REST APIs under Jira's /rest: /scriptrunner/latest for what its
 * editions share (the script editor, built-in scripts, the script console), /scriptrunner-jira/latest
 * for Jira features such as listeners and JQL functions, and /scriptrunner/behaviours/latest for
 * behaviours. Paths and bodies were read from the ScriptRunner 9.46.0 app's own JAX-RS resources.
 * Most routes are for Jira administrators, or for the users ScriptRunner's own settings allow.
 */

export type ScriptRunnerApi = 'scriptrunner' | 'scriptrunner-jira' | 'scriptrunner/behaviours';

const basePath = (api: ScriptRunnerApi) => `/${api}/latest`;

/** Starts a request to `/rest/<api>/latest<url>`. */
export function startScriptRunnerRequest<T>(api: ScriptRunnerApi, options: AppRequest): CancelablePromise<T> {
  return startAppRequest<T>(basePath(api), options);
}

/** Calls ScriptRunner, explaining a 404 and a refusal in terms of the subject and ScriptRunner itself. */
export function callScriptRunner<T = unknown>(api: ScriptRunnerApi, options: AppRequest, subject: string): Promise<T> {
  return callApp<T>(basePath(api), options, {
    notFound: `${subject} was not found (404). Check the name or path, and that ScriptRunner is installed on this instance.`,
    forbidden: (status) => `ScriptRunner refused this (${status}). Only Jira administrators, or the users ` +
      'ScriptRunner\'s own permission settings allow, can use it.',
  });
}
