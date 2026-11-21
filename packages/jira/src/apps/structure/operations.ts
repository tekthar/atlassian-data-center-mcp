import { IssueService } from '../../jira-client/index.js';
import { asRecord, stripNoise } from '../../tools/context.js';
import { callStructure } from './client.js';
import { parseForest, scopeRows, type ForestRow } from './forest.js';
import { DEFAULT_ROW_ATTRIBUTES } from './schemas.js';

export interface StructureSearch {
  name?: string;
  permission?: string;
  archived?: boolean;
  limit?: number;
  page?: number;
}

/** Structures shared with you, by name; Structure sorts them by name and says whether there are more. */
export async function getStructures({ name, permission, archived, limit, page }: StructureSearch) {
  const query = { name, permission: permission?.toUpperCase(), archived, limit: limit ?? 25, page, withOwner: true };
  return stripNoise(await callStructure({ method: 'GET', url: '/structure', query }, 'The structures'));
}

export async function getStructure(structureId: number) {
  return stripNoise(await callStructure({
    method: 'GET', url: '/structure/{structureId}', path: { structureId }, query: { withOwner: true, withPermissions: true },
  }, `Structure ${structureId}`));
}

interface StructureList {
  containingAnchor?: number[];
  totalContainingAnchor?: number;
  structures?: { id?: number; name?: string }[];
}

/** The structures Structure's issue index lists as holding the issue, as far as you can view them. */
export async function getIssueStructures(issueKey: string) {
  const issueId = asRecord(await IssueService.getIssue1(issueKey, undefined, 'summary')).id;
  const list = await callStructure<StructureList>({
    method: 'GET', url: '/structure/list', query: { anchorIssue: issueId },
  }, `Issue ${issueKey}'s structures`);
  const names = new Map((list?.structures ?? []).map((structure) => [structure.id, structure.name]));
  const ids = list?.containingAnchor ?? [];
  const total = list?.totalContainingAnchor ?? ids.length;
  return {
    issueKey,
    total,
    structures: ids.map((id) => ({ id, name: names.get(id) })),
    ...(total > ids.length ? { note: `Structure lists only the first ${ids.length}, your recent structures first.` } : {}),
  };
}

interface ForestResponse {
  formula?: string;
  itemTypes?: Record<string, string>;
}

interface ValueResponse {
  responses?: {
    rows?: number[];
    data?: { attribute?: { id?: string }; values?: unknown[] }[];
    inaccessibleRows?: number[];
  }[];
}

async function getRows(structureId: number): Promise<ForestRow[]> {
  const forest = await callStructure<ForestResponse>({
    method: 'GET', url: '/forest/latest', query: { s: JSON.stringify({ structureId }) },
  }, `Structure ${structureId}`);
  return parseForest(forest?.formula ?? '', forest?.itemTypes);
}

/** Each row's values by rowId; a row you may not read gets `inaccessible` instead. */
async function getRowValues(structureId: number, rowIds: number[], attributes: string[]) {
  const request = { forestSpec: { structureId }, rows: rowIds, attributes: attributes.map((id) => ({ id, format: 'text' })) };
  const response = await callStructure<ValueResponse>({
    method: 'POST', url: '/value', body: { requests: [request] },
  }, `Structure ${structureId}`);
  const answer = response?.responses?.[0];
  const values = new Map<number, Record<string, unknown>>();
  (answer?.rows ?? []).forEach((rowId, index) => values.set(rowId, Object.fromEntries(
    (answer?.data ?? []).map((column) => [column.attribute?.id, column.values?.[index]]),
  )));
  for (const rowId of answer?.inaccessibleRows ?? []) values.set(rowId, { inaccessible: true });
  return values;
}

export interface RowsRequest {
  structureId: number;
  attributes?: string[];
  underRowId?: number;
  maxDepth?: number;
  offset?: number;
  limit?: number;
}

/** A page of a structure's rows in order, with each row's depth, item and values. */
export async function getStructureRows({ structureId, attributes, underRowId, maxDepth, offset = 0, limit = 100 }: RowsRequest) {
  const rows = scopeRows(await getRows(structureId), underRowId, maxDepth);
  const page = rows.slice(offset, offset + limit);
  const values = page.length ? await getRowValues(structureId, page.map((row) => row.rowId), attributes ?? DEFAULT_ROW_ATTRIBUTES) : new Map();
  const next = offset + page.length;
  return {
    structureId,
    totalRows: rows.length,
    offset,
    rows: page.map((row) => ({ ...row, ...values.get(row.rowId) })),
    ...(next < rows.length ? { nextOffset: next } : {}),
  };
}
