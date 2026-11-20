import { stripNoise } from '../../tools/context.js';
import { callJmwe } from './client.js';

type Query = Record<string, string | number | boolean | undefined>;

const get = async (url: string, subject: string, path?: Record<string, string>, query?: Query) =>
  stripNoise(await callJmwe({ method: 'GET', url, path, query }, subject));

export const getWorkflowExtensions = (workflowName?: string) => (workflowName === undefined
  ? get('/workflows', 'The workflows that use JMWE')
  : get('/workflows/workflow', `Workflow ${workflowName}`, undefined, { workflowName }));

export type SharedKind = 'actions' | 'conditions' | 'validators' | 'scripts';

/** Shared items of one kind, or one of them. Scripts are listed whole; the others can leave out their content. */
export function getSharedItems(kind: SharedKind, id: string | undefined, includeContent: boolean) {
  const url = `/shared-${kind}`;
  if (id !== undefined) return get(`${url}/{id}`, `Shared ${kind.replace(/s$/, '')} ${id}`, { id });
  return kind === 'scripts'
    ? get(url, 'The shared scripts')
    : get(url, `The shared ${kind}`, undefined, { skipContent: !includeContent });
}

/*
 * Each action's own route, GET /scheduled-actions/{id}/run, runs it; these tools only ever call the list and
 * get routes.
 */
const actions = (url: string, what: string, actionId?: string) => (actionId === undefined
  ? get(url, `The ${what}`)
  : get(`${url}/{actionId}`, `${what.replace(/s$/, '')} ${actionId}`, { actionId }));

export const getEventBasedActions = (actionId?: string) => actions('/event-actions', 'event-based actions', actionId);

export const getScheduledActions = (actionId?: string) => actions('/scheduled-actions', 'scheduled actions', actionId);

export const getScheduledActionStatus = () => get('/scheduled-actions/status', 'The scheduled actions\' run status');

export interface LogSearch {
  issueKey?: string;
  extensionName?: string;
  triggeredBy?: string;
  errors?: boolean;
  warnings?: boolean;
  successes?: boolean;
  skipped?: boolean;
  page?: number;
  pageSize?: number;
}

/** JMWE's own defaults apply to what is left out: errors and warnings, 20 to a page. */
export const getLogs = (search: LogSearch) => get('/logs', 'The JMWE logs', undefined, { ...search });

export const getLogDetails = (correlationId: string) =>
  get('/logs/{correlationId}', `Log ${correlationId}`, { correlationId });
