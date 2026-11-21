import { callStructure } from './client.js';
import { parseItem } from './forest.js';

/*
 * Structure records each change to a structure's rows as a new version: who made it, or which synchronizer, and
 * what was added, copied, moved or removed. GET /history/{id}/versions answers newest first, and its maxVersion
 * is exclusive (the query is C_ID < (structureId << 32 | maxVersion)), so the oldest version of a page is the
 * next page's maxVersion. Its minVersion parameter is accepted but not used in 9.14.1, so the tool doesn't offer it.
 */

interface HistoryChange {
  operation?: string;
  forestSize?: number;
  itemId?: string;
  issueKey?: string;
  issueSummary?: string;
}

interface HistoryVersion {
  version?: number;
  timestamp?: number;
  user?: { name?: string; userKey?: string; displayName?: string };
  synchronizer?: { id?: number; description?: string };
  changes?: HistoryChange[];
  itemTypes?: Record<string, string>;
}

interface History {
  versions?: HistoryVersion[];
  itemTypes?: Record<string, string>;
}

function describeChange(change: HistoryChange, itemTypes: Record<string, string>) {
  return {
    operation: change.operation,
    ...(change.itemId ? parseItem(change.itemId, itemTypes) : {}),
    ...(change.issueKey ? { issueKey: change.issueKey, issueSummary: change.issueSummary } : {}),
    rows: change.forestSize,
  };
}

function describeVersion(version: HistoryVersion, itemTypes: Record<string, string>) {
  const types = { ...itemTypes, ...version.itemTypes };
  const user = version.user;
  return {
    version: version.version,
    at: typeof version.timestamp === 'number' ? new Date(version.timestamp).toISOString() : undefined,
    ...(user ? { user: user.displayName ?? user.name, userName: user.name } : {}),
    ...(version.synchronizer ? { synchronizer: version.synchronizer.description ?? `Synchronizer ${version.synchronizer.id}` } : {}),
    changes: (version.changes ?? []).map((change) => describeChange(change, types)),
  };
}

/** A page of a structure's versions, newest first, with what changed in each and who changed it. */
export async function getStructureHistory(structureId: number, beforeVersion?: number, limit = 20) {
  const history = await callStructure<History>({
    method: 'GET', url: '/history/{structureId}/versions', path: { structureId }, query: { maxCount: limit, maxVersion: beforeVersion },
  }, `Structure ${structureId}`);
  const versions = (history?.versions ?? []).map((version) => describeVersion(version, history?.itemTypes ?? {}));
  const oldest = versions[versions.length - 1]?.version;
  return {
    structureId,
    versions,
    ...(versions.length === limit && typeof oldest === 'number' ? { nextBeforeVersion: oldest } : {}),
  };
}
