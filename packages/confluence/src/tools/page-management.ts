import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import {
  ChildContentService,
  ContentLabelsService,
  ContentResourceService,
  ContentRestrictionsService,
} from '../confluence-client/index.js';
import { OpenAPI } from '../confluence-client/core/OpenAPI.js';
import { request as __request } from '../confluence-client/core/request.js';
import { confluenceStorageToText } from '../confluence-response-mapper.js';
import { asArray, asRecord, type ConfluenceToolContext } from './context.js';

/*
 * Port of sooperset/mcp-atlassian page tools for Confluence Data Center (REST v1):
 * get_page_children, get_space_page_tree, delete_page, move_page, copy_page, get_page_history,
 * get_page_diff, get_labels, add_label, get_page_restrictions, set_page_restrictions.
 */

export const PAGE_MANAGEMENT_CATALOG: ToolCatalog = {
  toolsets: {
    confluence_page_tree: { description: 'Browse child pages and the page hierarchy of a space', default: false },
    confluence_page_admin: { description: 'Move, copy and delete (trash) pages', default: false },
    confluence_history: { description: 'Read past page versions and diff two versions', default: false },
    confluence_labels: { description: 'Read and add content labels', default: false },
    confluence_restrictions: { description: 'Read and set page view and edit restrictions', default: false },
  },
  tools: {
    confluence_getPageChildren: { toolset: 'confluence_page_tree', access: 'read' },
    confluence_getSpacePageTree: { toolset: 'confluence_page_tree', access: 'read' },
    confluence_deletePage: { toolset: 'confluence_page_admin', access: 'destructive' },
    confluence_movePage: { toolset: 'confluence_page_admin', access: 'write' },
    confluence_copyPage: { toolset: 'confluence_page_admin', access: 'write' },
    confluence_getPageHistory: { toolset: 'confluence_history', access: 'read' },
    confluence_getPageDiff: { toolset: 'confluence_history', access: 'read' },
    confluence_getLabels: { toolset: 'confluence_labels', access: 'read' },
    confluence_addLabel: { toolset: 'confluence_labels', access: 'write' },
    confluence_getPageRestrictions: { toolset: 'confluence_restrictions', access: 'read' },
    confluence_setPageRestrictions: { toolset: 'confluence_restrictions', access: 'write' },
  },
};

// ---------------------------------------------------------------------------------------------
// Response shaping

type BodyMode = 'none' | 'text' | 'storage';
type Page = Record<string, unknown>;

const lastAncestorId = (page: Page): unknown => {
  if (!Array.isArray(page.ancestors)) return undefined;
  const parent = page.ancestors[page.ancestors.length - 1];
  return parent === undefined ? null : asRecord(parent).id ?? null;
};

const spaceKeyOf = (page: Page): unknown => {
  const key = asRecord(page.space).key;
  if (key !== undefined) return key;
  const expandable = asRecord(page._expandable).space;
  return typeof expandable === 'string' ? expandable.split('/').pop() : undefined;
};

/** Absolute browser link. List responses carry `_links.base` on the list, not on each item. */
function webLink(page: Page, listBase?: unknown): string | undefined {
  const links = asRecord(page._links);
  if (typeof links.webui !== 'string') return undefined;
  const base = [links.base, listBase, OpenAPI.BASE]
    .find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0) ?? '';
  return `${base.replace(/\/$/, '')}${links.webui}`;
}

/** Keep what a model needs to identify and place a page; drop `_links`, `_expandable` and expands. */
export function shapePage(value: unknown, listBase?: unknown) {
  const page = asRecord(value);
  return {
    id: page.id,
    title: page.title,
    type: page.type,
    status: page.status,
    spaceKey: spaceKeyOf(page),
    version: asRecord(page.version).number,
    parentId: lastAncestorId(page),
    webUrl: webLink(page, listBase),
  };
}

function shapeVersion(value: unknown) {
  const version = asRecord(value);
  const by = asRecord(version.by);
  return {
    number: version.number,
    when: version.when,
    by: by.displayName ?? by.username,
    message: version.message || undefined,
    minorEdit: version.minorEdit,
  };
}

const storageOf = (value: unknown): string => {
  const storage = asRecord(asRecord(asRecord(value).body).storage).value;
  return typeof storage === 'string' ? storage : '';
};

function shapeBody(value: unknown, mode: BodyMode) {
  if (mode === 'none') return {};
  const storage = storageOf(value);
  return { body: mode === 'text' ? confluenceStorageToText(storage) : storage, bodyFormat: mode };
}

const hasNextPage = (response: Record<string, unknown>) => Boolean(asRecord(response._links).next);

// ---------------------------------------------------------------------------------------------
// Page tree

const getPageChildrenInput = z.object({
  parentId: z.string().min(1).describe('ID of the parent page'),
  limit: z.number().int().min(1).max(200).optional().describe('Maximum child pages to return (default: the server page size)'),
  start: z.number().int().min(0).optional().describe('Index of the first child to return, for pagination (default 0)'),
  bodyMode: z.enum(['none', 'text', 'storage']).optional().describe("Include each child's body: 'none' (default), 'text' (plain text) or 'storage' (Confluence XML, large)"),
});

async function getPageChildren(args: z.infer<typeof getPageChildrenInput>, pageSize: number) {
  const limit = args.limit ?? pageSize;
  const start = args.start ?? 0;
  const bodyMode = args.bodyMode ?? 'none';
  const expand = bodyMode === 'none' ? 'space,version' : 'space,version,body.storage';
  const response = asRecord(await ChildContentService.childrenOfType(args.parentId, 'page', expand, String(limit), String(start)));
  const results = asArray(response.results);
  const listBase = asRecord(response._links).base;
  const hasMore = hasNextPage(response);
  return {
    parentId: args.parentId,
    start,
    count: results.length,
    hasMore,
    nextStart: hasMore ? start + results.length : undefined,
    children: results.map((child) => ({ ...shapePage(child, listBase), ...shapeBody(child, bodyMode) })),
  };
}

const getSpacePageTreeInput = z.object({
  spaceKey: z.string().min(1).describe('Key of the space, e.g. DEV'),
  limit: z.number().int().min(1).max(1000).optional().describe('Maximum pages to fetch (default 100). Start small for large spaces.'),
  start: z.number().int().min(0).optional().describe('Index of the first page to fetch; pass nextStart from a truncated response (default 0)'),
});

const TREE_BATCH_SIZE = 200;

async function fetchSpacePages(spaceKey: string, start: number, limit: number) {
  const pages: unknown[] = [];
  let next = start;
  let more = true;
  while (more && pages.length < limit) {
    const batchSize = String(Math.min(TREE_BATCH_SIZE, limit - pages.length));
    const response = asRecord(await ContentResourceService.getContent(
      spaceKey, 'ancestors', batchSize, String(next), undefined, undefined, undefined, 'page',
    ));
    const batch = asArray(response.results);
    pages.push(...batch);
    next += batch.length;
    more = batch.length > 0 && hasNextPage(response);
  }
  return { pages, hasMore: more, nextStart: next };
}

/** Data Center reports an unset position as -1 or the string "none". */
const normalizePosition = (raw: unknown): number | null => {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

function shapeTreeNode(value: unknown) {
  const page = asRecord(value);
  const ancestors = asArray(page.ancestors);
  return {
    id: page.id,
    title: page.title,
    parentId: lastAncestorId(page) ?? null,
    depth: ancestors.length,
    position: normalizePosition(asRecord(page.extensions).position),
  };
}

type TreeNode = ReturnType<typeof shapeTreeNode>;

const compareTreeNodes = (a: TreeNode, b: TreeNode) =>
  a.depth - b.depth
  || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
  || String(a.title ?? '').localeCompare(String(b.title ?? ''));

async function getSpacePageTree(args: z.infer<typeof getSpacePageTreeInput>) {
  const limit = args.limit ?? 100;
  const start = args.start ?? 0;
  const { pages, hasMore, nextStart } = await fetchSpacePages(args.spaceKey, start, limit);
  return {
    spaceKey: args.spaceKey,
    start,
    count: pages.length,
    hasMore,
    nextStart: hasMore ? nextStart : undefined,
    hint: hasMore ? `Truncated at ${limit} pages; call again with start=${nextStart} or a higher limit for the rest.` : undefined,
    pages: pages.map(shapeTreeNode).sort(compareTreeNodes),
  };
}

// ---------------------------------------------------------------------------------------------
// Page admin: delete, move, copy

const deletePageInput = z.object({
  pageId: z.string().min(1).describe('ID of the page or blog post to move to the trash'),
});

const TRASHABLE_TYPES = new Set(['page', 'blogpost']);
const CHILD_REPORT_LIMIT = 50;

async function describeChildren(page: Page) {
  if (page.type !== 'page') return {};
  const response = asRecord(await ChildContentService.childrenOfType(String(page.id), 'page', undefined, String(CHILD_REPORT_LIMIT)));
  const children = asArray(response.results).map((child) => ({ id: asRecord(child).id, title: asRecord(child).title }));
  if (children.length === 0) return {};
  return {
    childPagesMovedUp: children,
    childPagesListTruncated: hasNextPage(response) || undefined,
    childPagesNewParentId: lastAncestorId(page) ?? null,
  };
}

async function deletePage(pageId: string) {
  // Never pass a status: DELETE with status=trashed purges, and non-trashable types are deleted outright.
  const page = asRecord(await ContentResourceService.getContentById(pageId, 'space,version,ancestors'));
  if (!TRASHABLE_TYPES.has(String(page.type))) {
    throw new Error(`Content ${pageId} is a ${String(page.type)}, not a page or blog post; refusing to delete it because Confluence would not keep it in the trash.`);
  }
  const children = await describeChildren(page);
  await ContentResourceService.delete3(pageId);
  return {
    ...shapePage(page),
    status: 'trashed',
    ...children,
    note: 'Moved to the space trash, not purged. A space admin can restore it from Space tools > Content tools > Trash.',
  };
}

const movePageInput = z.object({
  pageId: z.string().min(1).describe('ID of the page to move. Its child pages move with it.'),
  targetId: z.string().min(1).optional().describe("ID of the target page. With position 'append' the page becomes its child; with 'above' or 'below' it becomes its sibling, just before or after it."),
  targetSpaceKey: z.string().min(1).optional().describe('Key of the space to move into. Without targetId the page moves to the top level of this space. With targetId it must match the target page\'s space.'),
  position: z.enum(['append', 'above', 'below']).optional().describe("Where to put the page relative to targetId: 'append' (default, as a child), 'above' or 'below' (as a sibling)"),
});

type MovePageArgs = z.infer<typeof movePageInput>;

function movePageProblem(args: MovePageArgs): string | undefined {
  if (!args.targetId && !args.targetSpaceKey) return 'Provide targetId, targetSpaceKey, or both.';
  if (args.position && args.position !== 'append' && !args.targetId) return `position '${args.position}' needs a targetId to place the page next to.`;
  if (args.targetId === args.pageId) return 'targetId must be different from pageId; a page cannot be moved relative to itself.';
  return undefined;
}

interface PageLocation {
  spaceKey: string;
  parentId: string | null;
}

/** Where the page must end up, so the move can be verified afterwards. */
async function resolveMoveTarget(args: MovePageArgs): Promise<PageLocation> {
  if (!args.targetId) return { spaceKey: String(args.targetSpaceKey), parentId: null };
  const target = asRecord(await ContentResourceService.getContentById(args.targetId, 'space,ancestors'));
  const spaceKey = String(spaceKeyOf(target));
  if (args.targetSpaceKey && args.targetSpaceKey !== spaceKey) {
    throw new Error(`Target page ${args.targetId} is in space ${spaceKey}, not ${args.targetSpaceKey}.`);
  }
  if ((args.position ?? 'append') === 'append') return { spaceKey, parentId: args.targetId };
  const parentId = lastAncestorId(target);
  return { spaceKey, parentId: parentId === null || parentId === undefined ? null : String(parentId) };
}

async function movePage(args: MovePageArgs) {
  const expected = await resolveMoveTarget(args);
  // Data Center has no REST move endpoint; this is the action behind the Move dialog. It needs the XSRF bypass header.
  await __request(OpenAPI, {
    method: 'POST',
    url: '/pages/movepage.action',
    headers: { 'X-Atlassian-Token': 'no-check' },
    query: { pageId: args.pageId, spaceKey: expected.spaceKey, targetId: args.targetId, position: args.targetId ? args.position ?? 'append' : 'topLevel' },
  });
  const page = shapePage(await ContentResourceService.getContentById(args.pageId, 'space,version,ancestors'));
  const actualParent = page.parentId === null || page.parentId === undefined ? null : String(page.parentId);
  if (page.spaceKey !== expected.spaceKey || actualParent !== expected.parentId) {
    throw new Error(`Confluence did not report an error, but page ${args.pageId} is in space ${String(page.spaceKey)} under parent ${actualParent ?? '(top level)'}, `
      + `not in ${expected.spaceKey} under ${expected.parentId ?? '(top level)'}. The move was rejected (for example a target inside the page's own subtree, or missing permission) or is still running for a large tree; re-check with confluence_getContent.`);
  }
  return { moved: true, page };
}

const copyPageInput = z.object({
  sourcePageId: z.string().min(1).describe('ID of the page to copy'),
  newTitle: z.string().min(1).describe('Title of the new page; must be unique in the destination space'),
  destinationSpaceKey: z.string().min(1).optional().describe("Space key for the new page (default: the source page's space)"),
  destinationParentId: z.string().min(1).optional().describe('Parent page ID in the destination space. Omit to create the copy at the top level of the space.'),
});

const attachmentCountOf = (page: Page) => asArray(asRecord(asRecord(page.children).attachment).results).length;

async function copyPage(args: z.infer<typeof copyPageInput>) {
  const source = asRecord(await ContentResourceService.getContentById(args.sourcePageId, 'body.storage,space,children.attachment'));
  if (source.type !== 'page') throw new Error(`Content ${args.sourcePageId} is a ${String(source.type)}; only pages can be copied.`);
  const created = await ContentResourceService.createContent({
    type: 'page',
    title: args.newTitle,
    space: { key: args.destinationSpaceKey ?? spaceKeyOf(source) },
    body: { storage: { value: storageOf(source), representation: 'storage' } },
    ...(args.destinationParentId ? { ancestors: [{ id: args.destinationParentId }] } : {}),
  });
  const attachments = attachmentCountOf(source);
  return {
    page: shapePage(created),
    copiedFrom: args.sourcePageId,
    notCopied: 'attachments, labels, restrictions, comments and child pages',
    warning: attachments > 0
      ? `The source page has ${attachments} attachment(s) that were not copied; images or links to them will not resolve on the copy.`
      : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// History and diff

const VERSION_EXPAND = 'body.storage,version,space';

const getPageHistoryInput = z.object({
  pageId: z.string().min(1).describe('ID of the page'),
  version: z.number().int().min(1).describe('Version number to read (1 is the first version)'),
  bodyMode: z.enum(['text', 'storage', 'none']).optional().describe("Body format: 'text' (default, plain text), 'storage' (Confluence XML, shows macros) or 'none'"),
});

async function fetchCurrent(pageId: string, versions: number[]) {
  const current = asRecord(await ContentResourceService.getContentById(pageId, VERSION_EXPAND));
  const latest = Number(asRecord(current.version).number);
  const missing = versions.find((version) => Number.isInteger(latest) && version > latest);
  if (missing !== undefined) throw new Error(`Page ${pageId} is at version ${latest}; version ${missing} does not exist.`);
  return { current, latest };
}

/** The latest version is only served as status=current; older ones need status=historical. */
async function fetchVersion(pageId: string, version: number, current: { current: Page; latest: number }): Promise<Page> {
  if (version === current.latest) return current.current;
  return asRecord(await ContentResourceService.getContentById(pageId, VERSION_EXPAND, String(version), 'historical'));
}

async function getPageHistory(args: z.infer<typeof getPageHistoryInput>) {
  const current = await fetchCurrent(args.pageId, [args.version]);
  const page = await fetchVersion(args.pageId, args.version, current);
  return {
    ...shapePage(page),
    id: args.pageId,
    version: shapeVersion(page.version),
    latestVersion: current.latest,
    ...shapeBody(page, args.bodyMode ?? 'text'),
  };
}

const getPageDiffInput = z.object({
  pageId: z.string().min(1).describe('ID of the page'),
  fromVersion: z.number().int().min(1).describe('Version to diff from (the "old" side)'),
  toVersion: z.number().int().min(1).describe('Version to diff to (the "new" side)'),
  format: z.enum(['text', 'storage']).optional().describe("Compare plain text ('text', default) or storage XML split at block tags ('storage', shows macro and formatting changes)"),
  contextLines: z.number().int().min(0).max(20).optional().describe('Unchanged lines to show around each change (default 3)'),
});

const BLOCK_END = /(<\/(?:p|h[1-6]|li|tr|table|ul|ol|blockquote|pre|div|ac:structured-macro|ac:layout-section|ac:layout-cell)>|<br\s*\/?>)/gi;

function linesOf(page: Page, format: 'text' | 'storage'): string[] {
  const storage = storageOf(page);
  if (format === 'text') return confluenceStorageToText(storage).split('\n').map((line) => line.trim());
  return storage.replace(BLOCK_END, '$1\n').split(/\r?\n/).filter((line, index, all) => line !== '' || index < all.length - 1);
}

async function getPageDiff(args: z.infer<typeof getPageDiffInput>) {
  const current = await fetchCurrent(args.pageId, [args.fromVersion, args.toVersion]);
  const [from, to] = await Promise.all([
    fetchVersion(args.pageId, args.fromVersion, current),
    fetchVersion(args.pageId, args.toVersion, current),
  ]);
  const format = args.format ?? 'text';
  const ops = diffLines(linesOf(from, format), linesOf(to, format));
  return {
    pageId: args.pageId,
    title: to.title,
    fromVersion: args.fromVersion,
    toVersion: args.toVersion,
    latestVersion: current.latest,
    format,
    linesAdded: ops.filter((op) => op.kind === '+').length,
    linesRemoved: ops.filter((op) => op.kind === '-').length,
    diff: unifiedDiff(ops, args.contextLines ?? 3, `v${args.fromVersion}`, `v${args.toVersion}`),
  };
}

export interface DiffOp {
  kind: ' ' | '-' | '+';
  line: string;
}

/** Above this many cells the LCS table is not built and the changed middle is reported as replaced. */
const MAX_LCS_CELLS = 4_000_000;

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [...a.map((line): DiffOp => ({ kind: '-', line })), ...b.map((line): DiffOp => ({ kind: '+', line }))];
  }
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i++] });
      j++;
    } else if (j >= b.length || (i < a.length && table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      ops.push({ kind: '-', line: a[i++] });
    } else {
      ops.push({ kind: '+', line: b[j++] });
    }
  }
  return ops;
}

/** Line diff: common head and tail are trimmed first so the LCS table only covers the changed middle. */
export function diffLines(a: string[], b: string[]): DiffOp[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const same = (line: string): DiffOp => ({ kind: ' ', line });
  return [
    ...a.slice(0, head).map(same),
    ...lcsDiff(a.slice(head, a.length - tail), b.slice(head, b.length - tail)),
    ...a.slice(a.length - tail).map(same),
  ];
}

interface Hunk {
  start: number;
  end: number;
}

function groupHunks(ops: DiffOp[], context: number): Hunk[] {
  const hunks: Hunk[] = [];
  ops.forEach((op, index) => {
    if (op.kind === ' ') return;
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    const last = hunks[hunks.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else hunks.push({ start, end });
  });
  return hunks;
}

function formatHunk(ops: DiffOp[], hunk: Hunk): string[] {
  const before = ops.slice(0, hunk.start);
  const slice = ops.slice(hunk.start, hunk.end);
  const oldCount = slice.filter((op) => op.kind !== '+').length;
  const newCount = slice.filter((op) => op.kind !== '-').length;
  const oldStart = before.filter((op) => op.kind !== '+').length + (oldCount > 0 ? 1 : 0);
  const newStart = before.filter((op) => op.kind !== '-').length + (newCount > 0 ? 1 : 0);
  return [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...slice.map((op) => `${op.kind}${op.line}`)];
}

/** Unified diff text, or '' when nothing changed. */
export function unifiedDiff(ops: DiffOp[], context: number, fromLabel: string, toLabel: string): string {
  const hunks = groupHunks(ops, context);
  if (hunks.length === 0) return '';
  return [`--- ${fromLabel}`, `+++ ${toLabel}`, ...hunks.flatMap((hunk) => formatHunk(ops, hunk))].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Labels

const LABEL_LIMIT = 200;

const getLabelsInput = z.object({
  contentId: z.string().min(1).describe('ID of the page, blog post or attachment (attachment IDs start with "att")'),
});

const addLabelInput = z.object({
  contentId: z.string().min(1).describe('ID of the page, blog post or attachment (attachment IDs start with "att")'),
  names: z.array(z.string().min(1).regex(/^\S+$/, 'Label names cannot contain spaces'))
    .min(1).max(50)
    .describe("Label names to add, e.g. ['reviewed', 'release-notes']. No spaces; Confluence stores them in lower case."),
});

function shapeLabels(contentId: string, value: unknown) {
  const response = asRecord(value);
  return {
    contentId,
    labels: asArray(response.results).map((label) => ({
      name: asRecord(label).name,
      prefix: asRecord(label).prefix,
      id: asRecord(label).id,
    })),
    hasMore: hasNextPage(response) || undefined,
  };
}

async function getLabels(contentId: string) {
  return shapeLabels(contentId, await ContentLabelsService.labels(contentId, undefined, String(LABEL_LIMIT)));
}

async function addLabels(contentId: string, names: string[]) {
  const labels = names.map((name) => ({ prefix: 'global', name }));
  return shapeLabels(contentId, await ContentLabelsService.addLabels(contentId, labels));
}

// ---------------------------------------------------------------------------------------------
// Restrictions

const RESTRICTION_EXPAND = 'restrictions.user,restrictions.group';

const getPageRestrictionsInput = z.object({
  pageId: z.string().min(1).describe('ID of the page or blog post'),
});

const principalList = (what: string) => z.array(z.string().min(1)).optional().describe(what);

const setPageRestrictionsInput = z.object({
  pageId: z.string().min(1).describe('ID of the page or blog post'),
  readUsers: principalList('Usernames allowed to view the page. Replaces the current list; [] removes it; omit to leave it unchanged.'),
  readGroups: principalList('Group names allowed to view the page. Replaces the current list; [] removes it; omit to leave it unchanged.'),
  editUsers: principalList('Usernames allowed to edit the page. Replaces the current list; [] removes it; omit to leave it unchanged.'),
  editGroups: principalList('Group names allowed to edit the page. Replaces the current list; [] removes it; omit to leave it unchanged.'),
});

type SetRestrictionsArgs = z.infer<typeof setPageRestrictionsInput>;

const restrictionEntries = (value: unknown): unknown[] => (Array.isArray(value) ? value : asArray(asRecord(value).results));

function shapeOperation(value: unknown) {
  const restrictions = asRecord(asRecord(value).restrictions);
  return {
    users: restrictionEntries(restrictions.user).map((user) => {
      const record = asRecord(user);
      return { username: record.username, userKey: record.userKey, displayName: record.displayName };
    }),
    groups: restrictionEntries(restrictions.group).map((group) => asRecord(group).name),
  };
}

async function getPageRestrictions(pageId: string) {
  const response = asRecord(await ContentRestrictionsService.byOperation(pageId, RESTRICTION_EXPAND));
  return { pageId, read: shapeOperation(response.read), update: shapeOperation(response.update) };
}

interface OperationPayload {
  operation: 'read' | 'update';
  restrictions: { user?: Array<{ type: 'known'; username: string }>; group?: Array<{ type: 'group'; name: string }> };
}

/** A missing user or group entry tells Confluence to leave that part of the operation unchanged. */
function operationPayload(operation: OperationPayload['operation'], users?: string[], groups?: string[]): OperationPayload | undefined {
  if (!users && !groups) return undefined;
  return {
    operation,
    restrictions: {
      ...(users ? { user: users.map((username) => ({ type: 'known' as const, username })) } : {}),
      ...(groups ? { group: groups.map((name) => ({ type: 'group' as const, name })) } : {}),
    },
  };
}

async function setPageRestrictions(args: SetRestrictionsArgs) {
  const payload = [
    operationPayload('read', args.readUsers, args.readGroups),
    operationPayload('update', args.editUsers, args.editGroups),
  ].filter((entry): entry is OperationPayload => entry !== undefined);
  await ContentRestrictionsService.updateRestrictions(args.pageId, RESTRICTION_EXPAND, undefined, undefined, payload);
  return getPageRestrictions(args.pageId);
}

// ---------------------------------------------------------------------------------------------
// Registration

async function respond<T>(operation: () => Promise<T>, errorPrefix: string, problem?: string) {
  if (problem) return formatToolResponse({ success: false, error: problem });
  return formatToolResponse(await handleApiOperation(operation, errorPrefix));
}

function registerTreeTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getPageChildren',
    {
      description: `List the direct child pages of a page in the ${context.instanceType}, in sibling order, with id, title, space key, version and web link. Set bodyMode to include bodies; paginate with start and limit.`,
      inputSchema: getPageChildrenInput,
    },
    async (args) => respond(() => getPageChildren(args, context.getPageSize()), 'Error getting child pages'),
  );

  tools.registerTool(
    'confluence_getSpacePageTree',
    {
      description: `Get the page hierarchy of a space in the ${context.instanceType} as a flat list of {id, title, parentId, depth, position}, sorted by depth then sibling position. Top-level pages have parentId null and depth 0. Use it to understand a space before creating, moving or copying pages.`,
      inputSchema: getSpacePageTreeInput,
    },
    async (args) => respond(() => getSpacePageTree(args), 'Error getting space page tree'),
  );
}

function registerAdminTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_deletePage',
    {
      description: `Delete a page or blog post in the ${context.instanceType}. Data Center moves it to the space trash, where a space admin can restore it; it is not purged. Child pages are not deleted: Confluence moves them up to the deleted page's parent, and the response lists them. Refuses other content types (comments, attachments), which Confluence would delete permanently.`,
      inputSchema: deletePageInput,
    },
    async ({ pageId }) => respond(() => deletePage(pageId), 'Error deleting page'),
  );

  tools.registerTool(
    'confluence_movePage',
    {
      description: `Move a page in the ${context.instanceType} under a new parent, next to a sibling, or to the top level of a space (another space included). Child pages move with it. Uses the page-move action behind Confluence's Move dialog (POST /pages/movepage.action, all Data Center versions), then re-reads the page and fails if it is not where it was asked to go.`,
      inputSchema: movePageInput,
    },
    async (args) => respond(() => movePage(args), 'Error moving page', movePageProblem(args)),
  );

  tools.registerTool(
    'confluence_copyPage',
    {
      description: `Copy a page in the ${context.instanceType} to a new page with a new title, in the same or another space. Data Center has no copy endpoint, so this creates a new page from the source's current storage body: attachments, labels, restrictions, comments and child pages are not copied.`,
      inputSchema: copyPageInput,
    },
    async (args) => respond(() => copyPage(args), 'Error copying page'),
  );
}

function registerHistoryTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getPageHistory',
    {
      description: `Get one version of a page in the ${context.instanceType}: title, who changed it, when, the version message, and the body as of that version (plain text by default). Also returns latestVersion. Use confluence_getPageDiff to compare two versions.`,
      inputSchema: getPageHistoryInput,
    },
    async (args) => respond(() => getPageHistory(args), 'Error getting page version'),
  );

  tools.registerTool(
    'confluence_getPageDiff',
    {
      description: `Compare two versions of a page in the ${context.instanceType} and return a unified line diff (--- vFrom, +++ vTo, @@ hunks) with counts of added and removed lines. diff is empty when the bodies are identical.`,
      inputSchema: getPageDiffInput,
    },
    async (args) => respond(
      () => getPageDiff(args),
      'Error diffing page versions',
      args.fromVersion === args.toVersion ? 'fromVersion and toVersion must be different versions.' : undefined,
    ),
  );
}

function registerLabelTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getLabels',
    {
      description: `List the labels on a page, blog post or attachment in the ${context.instanceType}.`,
      inputSchema: getLabelsInput,
    },
    async ({ contentId }) => respond(() => getLabels(contentId), 'Error getting labels'),
  );

  tools.registerTool(
    'confluence_addLabel',
    {
      description: `Add one or more labels to a page, blog post or attachment in the ${context.instanceType}. Existing labels are kept; returns the content's full label list afterwards.`,
      inputSchema: addLabelInput,
    },
    async ({ contentId, names }) => respond(() => addLabels(contentId, names), 'Error adding labels'),
  );
}

function registerRestrictionTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getPageRestrictions',
    {
      description: `Get the view (read) and edit (update) restrictions set directly on a page in the ${context.instanceType}: the users and groups each operation is limited to. Empty lists mean that operation is not restricted on this page. View restrictions inherited from ancestor pages are not included.`,
      inputSchema: getPageRestrictionsInput,
    },
    async ({ pageId }) => respond(() => getPageRestrictions(pageId), 'Error getting page restrictions'),
  );

  tools.registerTool(
    'confluence_setPageRestrictions',
    {
      description: `Set view and edit restrictions on a page in the ${context.instanceType}. Each list you pass replaces that list on the page, an empty list removes it, and a list you leave out is not changed. Confluence refuses changes that would remove your own access. Returns the page's restrictions afterwards.`,
      inputSchema: setPageRestrictionsInput,
    },
    async (args) => respond(
      () => setPageRestrictions(args),
      'Error setting page restrictions',
      [args.readUsers, args.readGroups, args.editUsers, args.editGroups].every((list) => list === undefined)
        ? 'Pass at least one of readUsers, readGroups, editUsers or editGroups. To remove a restriction, pass an empty list.'
        : undefined,
    ),
  );
}

export function registerPageManagementTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  registerTreeTools(tools, context);
  registerAdminTools(tools, context);
  registerHistoryTools(tools, context);
  registerLabelTools(tools, context);
  registerRestrictionTools(tools, context);
}
