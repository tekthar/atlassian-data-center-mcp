import { callJmwe } from './client.js';

/*
 * JMWE runs a scheduled action through GET /scheduled-actions/{actionId}/run, a GET that changes things: it
 * queues a manual run (ScheduledActionJobManager.createActionManualJobSchedule) and answers at once, while the
 * action works through its issues in the background. This is the only tool that calls that route.
 */
export async function runScheduledAction(actionId: string) {
  await callJmwe({ method: 'GET', url: '/scheduled-actions/{actionId}/run', path: { actionId } }, `Scheduled action ${actionId}`);
  return { started: true, actionId, followWith: 'jmwe_getScheduledActionStatus' };
}
