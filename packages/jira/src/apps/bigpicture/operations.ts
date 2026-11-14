import { stripNoise } from '../../tools/context.js';
import { callBigPicture } from './client.js';

type Query = Record<string, string | string[] | number | undefined>;

const get = async (url: string, subject: string, path?: Record<string, string | number>, query?: Query) =>
  stripNoise(await callBigPicture({ method: 'GET', url, path, query }, subject));

interface Box {
  boxArchived?: boolean;
  boxChildren?: Box[];
  [field: string]: unknown;
}

/** The tree without archived boxes, and without the children of archived ones. */
function withoutArchived(boxes: Box[]): Box[] {
  return boxes.filter((box) => !box.boxArchived).map((box) => ({ ...box, boxChildren: withoutArchived(box.boxChildren ?? []) }));
}

export async function getBoxHierarchy(includeArchived: boolean) {
  const hierarchy = await get('/ppm/box/box-hierarchy', 'The box hierarchy');
  const roots = (Array.isArray(hierarchy) ? hierarchy : [hierarchy]) as Box[];
  const boxes = includeArchived ? roots : withoutArchived(roots);
  return Array.isArray(hierarchy) ? boxes : boxes[0] ?? null;
}

export const getBox = (boxId: string) => get('/ppm/box/boxes/{boxId}', `Box ${boxId}`, { boxId });

export async function getBoxTypesAndStatuses() {
  const [types, statuses] = await Promise.all([
    get('/ppm/box/box-types', 'The box types'),
    get('/ppm/box/boxes/statuses', 'The box statuses'),
  ]);
  return { types, statuses };
}

export const getIssueBoxes = (issueKey: string) =>
  get('/ppm/boxarea/task/{issueKey}/boxes', `Issue ${issueKey}`, { issueKey });

export const getIssueFields = (issueKey: string, fieldNames?: string[]) =>
  get('/ppm/task/core/task/{issueKey}/field', `Issue ${issueKey}`, { issueKey }, { fieldNames });

export const getAvailableFields = () => get('/ppm/task/fields/available', 'The BigPicture fields');

export const getBoxTeams = (boxIds: string[]) => get('/ppm/teams', 'The box teams', undefined, { boxIds });

export const getGlobalTeams = () => get('/ppm/global-teams', 'The global teams');

export const getTeamMembers = (teamId: number, boxId?: string) =>
  get('/ppm/team/{teamId}/memberships', `Team ${teamId}`, { teamId }, { boxId });
