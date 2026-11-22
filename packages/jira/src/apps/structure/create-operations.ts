import { callStructure } from './client.js';
import { placeRows } from './forest.js';
import { loadForest } from './operations.js';
import { effectsOf, refusal, requireRows, type UpdateResponse } from './write-operations.js';

/*
 * A new structure: POST /structure with a name and description. Structure makes the caller its owner and checks
 * that Structure's settings let them create structures. A folder: POST /item/create with the folder type, its
 * name as the summary value, a negative temporary row id and its place. Structure reads items.version only after
 * it has made the folder, so the request always sends it; version 0 asks for no item changes.
 */

const FOLDER_TYPE = 'com.almworks.jira.structure:type-folder';

export async function createStructure(name: string, description?: string) {
  const created = await callStructure<Record<string, unknown>>({
    method: 'POST', url: '/structure', body: { name, description },
  }, 'The new structure');
  const { id, name: createdName, description: createdDescription, owner } = created ?? {};
  return { id, name: createdName, description: createdDescription, owner };
}

interface CreateItemResponse extends UpdateResponse {
  itemId?: string;
  formErrors?: string[];
  fieldErrors?: Record<string, string>;
}

function checkCreated(structureId: number, response: CreateItemResponse): void {
  const errors = [...(response.formErrors ?? []), ...Object.values(response.fieldErrors ?? {})];
  if (errors.length) throw new Error(`Structure didn't create the folder in structure ${structureId}: ${errors.join('; ')}`);
  if (response.updateError) throw refusal(structureId, response.updateError);
}

export async function addFolder(structureId: number, name: string, underRowId?: number, afterRowId?: number) {
  const { rows, version } = await loadForest(structureId);
  if (!version) throw new Error(`Structure didn't give structure ${structureId}'s version, which a change needs.`);
  if (underRowId !== undefined) requireRows(rows, [underRowId]);
  const response = await callStructure<CreateItemResponse>({
    method: 'POST',
    url: '/item/create',
    body: {
      forest: { spec: { structureId }, version },
      items: { version: { signature: 0, version: 0 } },
      rowId: -1,
      item: { type: FOLDER_TYPE, values: { summary: name } },
      ...placeRows(rows, underRowId, afterRowId),
    },
  }, `Structure ${structureId}`);
  checkCreated(structureId, response ?? {});
  const index = (response?.oldRowIds ?? []).indexOf(-1);
  return {
    structureId, name, rowId: index < 0 ? undefined : response?.newRowIds?.[index], itemId: response?.itemId, ...effectsOf(response ?? {}),
  };
}
