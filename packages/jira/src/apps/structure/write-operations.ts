import { SearchService } from '../../jira-client/index.js';
import { asArray, asRecord } from '../../tools/context.js';
import { callStructure } from './client.js';
import { placeRows, type ForestRow, type Placement } from './forest.js';
import { loadForest } from './operations.js';

/*
 * Changes go through POST /forest/update with one action each: add (a forest of new rows with negative temporary
 * row ids, mapped to real ones in oldRowIds and newRowIds), move or remove, each placed by row ids under, after
 * and before, where 0 is the top level, the first place or the last. Structure wants the forest's version back,
 * so each change reads the forest first. Structure answers 200 with updateError when it refuses, or when it needs
 * the user to choose, which it can't ask here. A change can have effects beyond the structure, such as setting a
 * grouping field or deleting a link a generator made; Structure lists them in effects.
 */

type ForestAction = Partial<Placement> & { action: 'add' | 'move' | 'remove'; forest?: string; rowIds?: number[] };

export interface UpdateResponse {
  successfulActions?: number;
  updateError?: {
    error?: { message?: string; itemDescription?: string };
    interactions?: { message?: string; itemDescription?: string }[];
  };
  oldRowIds?: number[];
  newRowIds?: number[];
  effects?: { effects?: { description?: string; external?: boolean; reversible?: boolean }[] }[];
  problems?: { description?: string }[];
}

export function refusal(structureId: number, error: NonNullable<UpdateResponse['updateError']>): Error {
  const interaction = error.interactions?.[0];
  const about = (item?: string) => (item ? ` (${item})` : '');
  if (interaction) {
    return new Error(`Structure needs a choice for this change to structure ${structureId}, which it can't ask here: ${interaction.message ?? 'no question given'}${about(interaction.itemDescription)}. Nothing was changed; make this change in Structure itself.`);
  }
  return new Error(`Structure refused the change to structure ${structureId}: ${error.error?.message ?? 'no reason given'}${about(error.error?.itemDescription)}. Nothing was changed.`);
}

async function updateForest(structureId: number, version: unknown, action: ForestAction): Promise<UpdateResponse> {
  if (!version) throw new Error(`Structure didn't give structure ${structureId}'s version, which a change needs.`);
  const response = await callStructure<UpdateResponse>({
    method: 'POST', url: '/forest/update', body: { spec: { structureId }, version, actions: [action] },
  }, `Structure ${structureId}`);
  if (response?.updateError) throw refusal(structureId, response.updateError);
  return response ?? {};
}

/** What the change did beyond the rows themselves, as Structure reports it. */
export function effectsOf(response: UpdateResponse) {
  const effects = (response.effects ?? []).flatMap((batch) => batch.effects ?? [])
    .map(({ description, external, reversible }) => ({ description, external, reversible }));
  const problems = (response.problems ?? []).map((problem) => problem.description);
  return { ...(effects.length ? { effects } : {}), ...(problems.length ? { problems } : {}) };
}

export function requireRows(rows: ForestRow[], rowIds: number[]): void {
  const missing = rowIds.filter((rowId) => !rows.some((row) => row.rowId === rowId));
  if (missing.length) throw new Error(`Row ${missing.join(', ')} is not in this structure. Take row ids from structure_getStructureRows.`);
}

/** Each issue's id by its key, checking first that Jira finds them all. */
async function issueIds(issueKeys: string[]): Promise<Map<string, string>> {
  const result = asRecord(await SearchService.searchUsingSearchRequest({
    jql: `key in (${issueKeys.join(', ')})`, maxResults: issueKeys.length, fields: ['summary'], validateQuery: false,
  }));
  const ids = new Map(asArray(result.issues).map((issue) => [String(asRecord(issue).key).toUpperCase(), String(asRecord(issue).id)]));
  const missing = issueKeys.filter((key) => !ids.has(key));
  if (missing.length) throw new Error(`Jira found no issue ${missing.join(', ')}, or you can't see it. Nothing was added.`);
  return ids;
}

export async function addIssues(structureId: number, issueKeys: string[], underRowId?: number, afterRowId?: number) {
  const keys = [...new Set(issueKeys.map((key) => key.toUpperCase()))];
  const ids = await issueIds(keys);
  const { rows, version } = await loadForest(structureId);
  if (underRowId !== undefined) requireRows(rows, [underRowId]);
  const forest = keys.map((key, index) => `${-(index + 1)}:0:${ids.get(key)}`).join(',');
  const response = await updateForest(structureId, version, { action: 'add', forest, ...placeRows(rows, underRowId, afterRowId) });
  const newRowIds = new Map((response.oldRowIds ?? []).map((oldRowId, index) => [oldRowId, response.newRowIds?.[index]]));
  return {
    structureId,
    added: keys.map((issueKey, index) => ({ issueKey, rowId: newRowIds.get(-(index + 1)) })),
    ...effectsOf(response),
  };
}

export async function moveRows(structureId: number, rowIds: number[], underRowId?: number, afterRowId?: number) {
  const { rows, version } = await loadForest(structureId);
  requireRows(rows, underRowId === undefined ? rowIds : [...rowIds, underRowId]);
  if (underRowId !== undefined && rowIds.includes(underRowId)) throw new Error(`Row ${underRowId} can't be moved under itself.`);
  const placement = placeRows(rows, underRowId, afterRowId, rowIds);
  const response = await updateForest(structureId, version, { action: 'move', rowIds, ...placement });
  return { structureId, moved: rowIds, under: placement.under === 0 ? 'top level' : placement.under, ...effectsOf(response) };
}

export async function removeRows(structureId: number, rowIds: number[]) {
  const { rows, version } = await loadForest(structureId);
  requireRows(rows, rowIds);
  const response = await updateForest(structureId, version, { action: 'remove', rowIds });
  return { structureId, removed: rowIds, ...effectsOf(response) };
}
