/*
 * Structure sends a structure's rows as a forest formula: comma-separated rows, each
 * `rowId:depth:item[:semantics]`. An issue's item is its id. Any other item is `typeId/longId` or
 * `typeId//stringId` with the string URI-encoded, and `itemTypes` names each typeId.
 */

export interface ForestRow extends ForestItem {
  rowId: number;
  depth: number;
}

const STRUCTURE_TYPE_PREFIX = 'com.almworks.jira.structure:type-';

const typeName = (typeKey: string) =>
  (typeKey.startsWith(STRUCTURE_TYPE_PREFIX) ? typeKey.slice(STRUCTURE_TYPE_PREFIX.length) : typeKey);

export interface ForestItem {
  type: string;
  itemId: string;
}

/** One item as Structure writes it: an issue id, `typeId/longId`, or `typeId//stringId`. */
export function parseItem(item: string, itemTypes: Record<string, string> = {}): ForestItem {
  const slash = item.indexOf('/');
  if (slash < 0) return { type: 'issue', itemId: item };
  const typeId = item.slice(0, slash);
  const id = item.slice(slash + 1);
  return { type: typeName(itemTypes[typeId] ?? typeId), itemId: id.startsWith('/') ? decodeURIComponent(id.slice(1)) : id };
}

function parseRow(component: string, itemTypes: Record<string, string>): ForestRow {
  const [rowId, depth, item = ''] = component.split(':');
  return { rowId: Number(rowId), depth: Number(depth), ...parseItem(item, itemTypes) };
}

export function parseForest(formula: string, itemTypes: Record<string, string> = {}): ForestRow[] {
  return formula ? formula.split(',').map((component) => parseRow(component, itemTypes)) : [];
}

/** The row and every row under it, in order. */
function subtree(rows: ForestRow[], rowId: number): ForestRow[] {
  const start = rows.findIndex((row) => row.rowId === rowId);
  if (start < 0) throw new Error(`Row ${rowId} is not in this structure. Take a rowId from structure_getStructureRows.`);
  let end = start + 1;
  while (end < rows.length && rows[end].depth > rows[start].depth) end += 1;
  return rows.slice(start, end);
}

/** The rows to show: all of them, or one row's subtree, down to a depth when one is given. */
export function scopeRows(rows: ForestRow[], underRowId?: number, maxDepth?: number): ForestRow[] {
  const scoped = underRowId === undefined ? rows : subtree(rows, underRowId);
  return maxDepth === undefined ? scoped : scoped.filter((row) => row.depth <= maxDepth);
}

/** A row's children in order; 0 stands for the top level. */
export function childrenOf(rows: ForestRow[], parentRowId: number): ForestRow[] {
  if (parentRowId === 0) return rows.filter((row) => row.depth === 0);
  const below = subtree(rows, parentRowId);
  return below.filter((row) => row.depth === below[0].depth + 1);
}

/** Where Structure puts new or moved rows: under a parent (0 for the top level), after a sibling or else last. */
export interface Placement {
  under: number;
  after: number;
  before: number;
}

export function placeRows(rows: ForestRow[], under = 0, afterRowId?: number, moving: number[] = []): Placement {
  const siblings = childrenOf(rows, under).filter((row) => !moving.includes(row.rowId));
  if (afterRowId === undefined) return { under, after: siblings[siblings.length - 1]?.rowId ?? 0, before: 0 };
  const index = siblings.findIndex((row) => row.rowId === afterRowId);
  if (index < 0) throw new Error(`Row ${afterRowId} is not directly under ${under === 0 ? 'the top level' : `row ${under}`}. Give afterRowId from the same level.`);
  return { under, after: afterRowId, before: siblings[index + 1]?.rowId ?? 0 };
}
