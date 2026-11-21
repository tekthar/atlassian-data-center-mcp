/*
 * Structure sends a structure's rows as a forest formula: comma-separated rows, each
 * `rowId:depth:item[:semantics]`. An issue's item is its id. Any other item is `typeId/longId` or
 * `typeId//stringId` with the string URI-encoded, and `itemTypes` names each typeId.
 */

export interface ForestRow {
  rowId: number;
  depth: number;
  type: string;
  itemId: string;
}

const STRUCTURE_TYPE_PREFIX = 'com.almworks.jira.structure:type-';

const typeName = (typeKey: string) =>
  (typeKey.startsWith(STRUCTURE_TYPE_PREFIX) ? typeKey.slice(STRUCTURE_TYPE_PREFIX.length) : typeKey);

function parseRow(component: string, itemTypes: Record<string, string>): ForestRow {
  const [rowId, depth, item = ''] = component.split(':');
  const row = { rowId: Number(rowId), depth: Number(depth) };
  const slash = item.indexOf('/');
  if (slash < 0) return { ...row, type: 'issue', itemId: item };
  const typeId = item.slice(0, slash);
  const id = item.slice(slash + 1);
  return { ...row, type: typeName(itemTypes[typeId] ?? typeId), itemId: id.startsWith('/') ? decodeURIComponent(id.slice(1)) : id };
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
