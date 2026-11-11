import { stripNoise } from '../../tools/context.js';
import { callScriptRunner } from './client.js';

type MappingType = 'PROJECT' | 'SERVICEDESK';

const call = async (method: 'POST' | 'DELETE', url: string, subject: string, extra: object = {}) =>
  stripNoise(await callScriptRunner('scriptrunner/behaviours', { method, url, ...extra }, subject));

/** Creates a behaviour, or replaces the one with this id; ScriptRunner answers with its id or the fields it rejected. */
export function saveBehaviour(behaviour: Record<string, unknown>) {
  return call('POST', '/admin/behaviour', `Behaviour ${String(behaviour.id ?? behaviour.name)}`, { body: behaviour });
}

export function setBehaviourEnabled(id: string, enabled: boolean) {
  return call('POST', `/admin/behaviour/{id}/${enabled ? 'enable' : 'disable'}`, `Behaviour ${id}`, { path: { id } });
}

export interface MappingInput {
  type: MappingType;
  projectIds?: number[];
  issueTypeIds?: number[];
  serviceDesk?: number;
  requestTypes?: number[];
}

/** Maps a behaviour to projects and issue types, or to a service desk's request types. */
export function mapBehaviour(behaviourId: string, mapping: MappingInput) {
  return call('POST', '/admin/mapping', `Behaviour ${behaviourId}`, { body: { behaviourId, ...mapping } });
}

export interface UnmapInput {
  type: MappingType;
  projectId?: number;
  issueTypeId?: number;
  serviceDeskId?: number;
  requestTypeId?: number;
}

/** Removes one mapping of a behaviour, named by both of its ids. */
export function unmapBehaviour(behaviourId: string, { type, projectId, issueTypeId, serviceDeskId, requestTypeId }: UnmapInput) {
  return call('DELETE', '/admin/mapping', `Behaviour ${behaviourId}`, {
    query: { type, id: behaviourId, pid: projectId, issueTypeId, serviceDeskId, requestTypeId },
  });
}
