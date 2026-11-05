import { z } from 'zod';
import { formatToolResponse, handleApiOperation, type PolicyRegistrar, type ToolCatalog } from '@atlassian-dc-mcp/common';
import { AttachmentsService, ContentResourceService, OpenAPI, SearchService } from '../confluence-client/index.js';
import { request as __request } from '../confluence-client/core/request.js';
import { confluenceStorageToText } from '../confluence-response-mapper.js';
import { escapeSearchTextForCql } from '../confluence-service.js';
import { asArray, asRecord, type ConfluenceToolContext } from './context.js';

/*
 * Port of sooperset/mcp-atlassian's Confluence comment, attachment and user tools, using the
 * Data Center REST v1 API (/rest/api). Comment bodies are written in storage format (XHTML),
 * like confluence_createContent, rather than converted from Markdown.
 */

export const COLLABORATION_CATALOG: ToolCatalog = {
  toolsets: {
    confluence_comments: { description: 'Read, add and reply to page and inline comments', default: false },
    confluence_attachment_management: { description: 'List attachment metadata and delete attachments', default: false },
    confluence_users: { description: 'Search users by name or username', default: false },
  },
  tools: {
    confluence_getComments: { toolset: 'confluence_comments', access: 'read' },
    confluence_getInlineComments: { toolset: 'confluence_comments', access: 'read' },
    confluence_addComment: { toolset: 'confluence_comments', access: 'write' },
    confluence_replyToComment: { toolset: 'confluence_comments', access: 'write' },
    confluence_addInlineComment: { toolset: 'confluence_comments', access: 'write' },
    confluence_getAttachments: { toolset: 'confluence_attachment_management', access: 'read' },
    confluence_deleteAttachment: { toolset: 'confluence_attachment_management', access: 'destructive' },
    confluence_searchUser: { toolset: 'confluence_users', access: 'read' },
  },
};

type BodyFormat = 'text' | 'storage' | 'none';
type Rec = Record<string, unknown>;

const COMMENT_EXPAND = 'body.storage,history,version,ancestors,extensions.inlineProperties,extensions.resolution';
const STORAGE_BODY_NOTE = 'Confluence storage format (XHTML), the same format confluence_createContent takes, e.g. "<p>Looks good, see <ac:link><ri:user ri:userkey="..." /></ac:link></p>"';

const optionalText = (value: unknown) => (value === '' || value === null ? undefined : value);
const hasMore = (response: Rec) => Boolean(asRecord(response._links).next);

function shapeAuthor(value: unknown) {
  const user = asRecord(value);
  if (user.displayName === undefined && user.username === undefined) return undefined;
  return { displayName: user.displayName, username: user.username, userKey: user.userKey };
}

/** The comment being replied to is the nearest comment ancestor (ancestors run root first). */
function parentCommentId(ancestors: unknown): string | undefined {
  const comments = asArray(ancestors).map(asRecord).filter((ancestor) => ancestor.type === 'comment');
  const parent = comments[comments.length - 1];
  return parent?.id === undefined ? undefined : String(parent.id);
}

function shapeBody(comment: Rec, format: BodyFormat) {
  const storage = asRecord(asRecord(comment.body).storage).value;
  if (format === 'none' || typeof storage !== 'string') return undefined;
  return format === 'storage' ? storage : confluenceStorageToText(storage);
}

/** Keep what a model needs to follow a discussion; drop links, expandables and avatars. */
export function shapeComment(value: unknown, format: BodyFormat = 'text') {
  const comment = asRecord(value);
  const history = asRecord(comment.history);
  const version = asRecord(comment.version);
  const extensions = asRecord(comment.extensions);
  const inline = asRecord(extensions.inlineProperties);
  return {
    id: comment.id,
    author: shapeAuthor(history.createdBy ?? version.by),
    created: history.createdDate ?? version.when,
    updated: version.when,
    parentCommentId: parentCommentId(comment.ancestors),
    location: extensions.location,
    resolution: asRecord(extensions.resolution).status,
    originalSelection: optionalText(inline.originalSelection),
    markerRef: optionalText(inline.markerRef),
    body: shapeBody(comment, format),
  };
}

function shapeCreatedComment(value: unknown, pageId: string) {
  const links = asRecord(asRecord(value)._links);
  const url = typeof links.base === 'string' && typeof links.webui === 'string' ? `${links.base}${links.webui}` : undefined;
  return { ...shapeComment(value, 'none'), pageId, url };
}

interface CommentListOptions {
  start?: number;
  limit: number;
  bodyFormat?: 'text' | 'storage';
}

/** The generated client types `location` as a single string; DC accepts it repeated. */
async function listComments(pageId: string, page: { start: number; limit: number }, locations?: string[]) {
  const response = asRecord(await __request<unknown>(OpenAPI, {
    method: 'GET',
    url: '/rest/api/content/{id}/child/comment',
    path: { id: pageId },
    query: { expand: COMMENT_EXPAND, depth: 'all', start: page.start, limit: page.limit, location: locations },
  }));
  return { results: asArray(response.results), hasMore: hasMore(response) };
}

async function readComments(pageId: string, options: CommentListOptions, locations?: string[]) {
  const page = { start: options.start ?? 0, limit: options.limit };
  const { results, hasMore: more } = await listComments(pageId, page, locations);
  const comments = results
    .filter((comment) => !locations || asRecord(asRecord(comment).extensions).location !== 'footer')
    .map((comment) => shapeComment(comment, options.bodyFormat ?? 'text'));
  return { pageId, start: page.start, limit: page.limit, size: comments.length, hasMore: more, comments };
}

interface InlineAnchor {
  textSelection: string;
  matchCount: number;
  matchIndex: number;
}

/**
 * Data Center rejects an inline comment unless it carries the fields its editor sends when a
 * user highlights text: lastFetchTime in epoch milliseconds and serializedHighlights as a JSON
 * string of [["<selected text>"]] (as found by sooperset/mcp-atlassian on DC 8.x).
 */
function inlineExtensions(anchor: InlineAnchor) {
  return {
    location: 'inline',
    inlineProperties: {
      originalSelection: anchor.textSelection,
      numMatches: anchor.matchCount,
      matchIndex: anchor.matchIndex,
      lastFetchTime: String(Date.now()),
      serializedHighlights: JSON.stringify([[anchor.textSelection]]),
    },
  };
}

interface CommentDraft {
  container: { id: string; type: string };
  body: string;
  parentId?: string;
  anchor?: InlineAnchor;
}

async function createComment(draft: CommentDraft) {
  const payload = {
    type: 'comment',
    container: draft.container,
    body: { storage: { value: draft.body, representation: 'storage' } },
    ...(draft.parentId ? { ancestors: [{ id: draft.parentId }] } : {}),
    ...(draft.anchor ? { extensions: inlineExtensions(draft.anchor) } : {}),
  };
  const created = await ContentResourceService.createContent(payload, COMMENT_EXPAND);
  return shapeCreatedComment(created, draft.container.id);
}

const CONTAINER_TYPES = new Set(['page', 'blogpost']);

/** Replies are posted under the page with the parent comment as ancestor, as the DC API expects. */
async function resolveCommentContainer(commentId: string) {
  const parent = asRecord(await ContentResourceService.getContentById(commentId, 'container,ancestors'));
  if (parent.type !== 'comment') {
    throw new Error(`Content ${commentId} is a ${String(parent.type)}, not a comment.`);
  }
  const candidates = [asRecord(parent.container), ...asArray(parent.ancestors).map(asRecord).reverse()];
  const container = candidates.find((candidate) => CONTAINER_TYPES.has(String(candidate.type)) && candidate.id !== undefined);
  if (!container) throw new Error(`Could not find the page that comment ${commentId} belongs to.`);
  return { id: String(container.id), type: String(container.type) };
}

/** Keep the metadata a model needs to pick an attachment; drop download links and expandables. */
export function shapeAttachment(value: unknown) {
  const attachment = asRecord(value);
  const extensions = asRecord(attachment.extensions);
  const version = asRecord(attachment.version);
  return {
    id: attachment.id,
    title: attachment.title,
    mediaType: extensions.mediaType ?? asRecord(attachment.metadata).mediaType,
    fileSize: extensions.fileSize,
    comment: optionalText(extensions.comment),
    version: version.number,
    updated: version.when,
    updatedBy: asRecord(version.by).displayName,
  };
}

interface AttachmentQuery {
  pageId: string;
  filename?: string;
  mediaType?: string;
  start?: number;
  limit: number;
}

async function readAttachments(query: AttachmentQuery) {
  const start = query.start ?? 0;
  const response = asRecord(await AttachmentsService.getAttachments(
    query.pageId, 'version', query.filename, String(query.limit), String(start), query.mediaType,
  ));
  const attachments = asArray(response.results)
    .map(shapeAttachment)
    .filter((attachment) => !query.filename || attachment.title === query.filename)
    .filter((attachment) => !query.mediaType || attachment.mediaType === query.mediaType);
  return { pageId: query.pageId, start, limit: query.limit, size: attachments.length, hasMore: hasMore(response), attachments };
}

/** DELETE /rest/api/content/{id} accepts any content, so confirm the id is an attachment first. */
async function deleteAttachment(attachmentId: string) {
  const attachment = asRecord(await ContentResourceService.getContentById(attachmentId, 'container,version'));
  if (attachment.type !== 'attachment') {
    throw new Error(`Content ${attachmentId} is a ${String(attachment.type)}, not an attachment. Nothing was deleted.`);
  }
  await ContentResourceService.delete3(attachmentId);
  return { deleted: true, pageId: asRecord(attachment.container).id, attachment: shapeAttachment(attachment) };
}

/** Plain text matches full names and usernames, whole words or as a prefix of the last word. */
export function buildUserSearchCql(query: string): string {
  const term = escapeSearchTextForCql(query.trim().replace(/\*+$/, ''));
  return `type = user AND (user.fullname ~ "${term}" OR user.fullname ~ "${term}*")`;
}

function shapeUser(value: unknown) {
  const user = asRecord(value);
  return { username: user.username, userKey: user.userKey, displayName: user.displayName, email: optionalText(user.email) };
}

async function searchUsers(cql: string, limit: number, start: number) {
  const response = asRecord(await SearchService.search1(undefined, undefined, undefined, String(limit), String(start), 'none', cql));
  const users = asArray(response.results)
    .map((result) => asRecord(result).user)
    .filter((user) => user !== undefined)
    .map(shapeUser);
  return { cql, start, size: users.length, totalSize: response.totalSize, hasMore: hasMore(response), users };
}

const pageIdField = z.string().min(1).describe('ID of the Confluence page or blog post (the number in /pages/<id>/ or ?pageId=<id>)');
const startField = z.number().int().min(0).optional().describe('Index of the first result to return, for pagination (default 0)');
const limitField = (what: string) => z.number().int().min(1).max(100).optional()
  .describe(`Maximum number of ${what} to return (default: the server page size)`);
const bodyFormatField = z.enum(['text', 'storage']).optional()
  .describe("Comment body format: 'text' (plain text, default) or 'storage' (Confluence storage XHTML, e.g. to quote or edit it)");
const commentBodyField = z.string().min(1).describe(`Comment body in ${STORAGE_BODY_NOTE}`);

export const collaborationToolSchemas = {
  getComments: { pageId: pageIdField, start: startField, limit: limitField('comments'), bodyFormat: bodyFormatField },
  getInlineComments: {
    pageId: pageIdField,
    includeResolved: z.boolean().optional().describe('Also return resolved inline comments (default true)'),
    start: startField,
    limit: limitField('comments'),
    bodyFormat: bodyFormatField,
  },
  addComment: { pageId: pageIdField, body: commentBodyField },
  replyToComment: {
    commentId: z.string().min(1).describe('ID of the comment to reply to (the id field from confluence_getComments)'),
    body: commentBodyField,
  },
  addInlineComment: {
    pageId: pageIdField,
    body: commentBodyField,
    textSelection: z.string().min(1).describe('Text to anchor the comment to, exactly as it reads on the rendered page'),
    textSelectionMatchCount: z.number().int().min(1).optional()
      .describe('How many times textSelection occurs on the page (default 1)'),
    textSelectionMatchIndex: z.number().int().min(0).optional()
      .describe('Zero-based occurrence of textSelection to anchor to (default 0, the first); must be less than textSelectionMatchCount'),
  },
  getAttachments: {
    pageId: pageIdField,
    filename: z.string().min(1).optional().describe("Return only the attachment with this exact file name, e.g. 'report.pdf'"),
    mediaType: z.string().min(1).optional().describe("Return only attachments with this exact media type, e.g. 'application/pdf' or 'image/png'"),
    start: startField,
    limit: limitField('attachments'),
  },
  deleteAttachment: {
    attachmentId: z.string().min(1).describe('ID of the attachment to delete (the id field from confluence_getAttachments)'),
  },
  searchUser: {
    query: z.string().optional().describe('Name, part of a name, or username to look for, e.g. "Jane" or "jdo". Give query or cql, not both'),
    cql: z.string().optional().describe('Raw CQL user search, used as-is, e.g. \'type = user AND user.fullname ~ "Jane Doe"\'. Give query or cql, not both'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of users to return (default 10)'),
    start: startField,
  },
};

function registerGetComments(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getComments',
    {
      description: `List the comments on a Confluence page in the ${context.instanceType}: page (footer) and inline comments, replies included. Each comment has id, author, created, updated, location (footer or inline), resolution, parentCommentId for replies, the highlighted text (originalSelection) for inline comments, and the body. Paginate with start and limit while hasMore is true.`,
      inputSchema: z.object(collaborationToolSchemas.getComments),
    },
    async ({ pageId, start, limit, bodyFormat }) => formatToolResponse(await handleApiOperation(
      () => readComments(pageId, { start, limit: limit ?? context.getPageSize(), bodyFormat }),
      'Error getting comments',
    )),
  );
}

function registerGetInlineComments(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getInlineComments',
    {
      description: `List the inline comments (comments on highlighted text) on a Confluence page in the ${context.instanceType}, replies included. Each comment has the highlighted text (originalSelection), its marker reference, resolution (open, resolved, ...), parentCommentId for replies, author, dates and body. Paginate with start and limit while hasMore is true.`,
      inputSchema: z.object(collaborationToolSchemas.getInlineComments),
    },
    async ({ pageId, includeResolved, start, limit, bodyFormat }) => formatToolResponse(await handleApiOperation(
      () => readComments(
        pageId,
        { start, limit: limit ?? context.getPageSize(), bodyFormat },
        includeResolved === false ? ['inline'] : ['inline', 'resolved'],
      ),
      'Error getting inline comments',
    )),
  );
}

const blankBodyError = () => formatToolResponse({ success: false, error: 'body must contain more than whitespace.' });

function registerAddComment(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_addComment',
    {
      description: `Add a page (footer) comment to a Confluence page in the ${context.instanceType}. The body is in ${STORAGE_BODY_NOTE}. To answer an existing comment use confluence_replyToComment; to comment on specific text use confluence_addInlineComment.`,
      inputSchema: z.object(collaborationToolSchemas.addComment),
    },
    async ({ pageId, body }) => {
      if (!body.trim()) return blankBodyError();
      return formatToolResponse(await handleApiOperation(
        () => createComment({ container: { id: pageId, type: 'page' }, body }),
        'Error adding comment',
      ));
    },
  );
}

function registerReplyToComment(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_replyToComment',
    {
      description: `Reply to an existing comment on a Confluence page in the ${context.instanceType}. The reply is threaded under commentId on the same page. The body is in ${STORAGE_BODY_NOTE}.`,
      inputSchema: z.object(collaborationToolSchemas.replyToComment),
    },
    async ({ commentId, body }) => {
      if (!body.trim()) return blankBodyError();
      return formatToolResponse(await handleApiOperation(
        async () => createComment({ container: await resolveCommentContainer(commentId), body, parentId: commentId }),
        'Error replying to comment',
      ));
    },
  );
}

function registerAddInlineComment(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_addInlineComment',
    {
      description: `Add an inline comment anchored to a piece of text on a Confluence page in the ${context.instanceType}. The body is in ${STORAGE_BODY_NOTE}. textSelection must match text on the page exactly; if it occurs more than once, give the number of occurrences and which one to anchor to. Data Center has no documented API for this: the tool sends the fields Confluence's editor sends, reported to work on Data Center 8.x; other versions may reject it.`,
      inputSchema: z.object(collaborationToolSchemas.addInlineComment),
    },
    async ({ pageId, body, textSelection, textSelectionMatchCount, textSelectionMatchIndex }) => {
      const anchor = { textSelection, matchCount: textSelectionMatchCount ?? 1, matchIndex: textSelectionMatchIndex ?? 0 };
      if (anchor.matchIndex >= anchor.matchCount) {
        return formatToolResponse({ success: false, error: 'textSelectionMatchIndex must be less than textSelectionMatchCount.' });
      }
      if (!body.trim() || !textSelection.trim()) {
        return formatToolResponse({ success: false, error: 'body and textSelection must contain more than whitespace.' });
      }
      return formatToolResponse(await handleApiOperation(
        () => createComment({ container: { id: pageId, type: 'page' }, body, anchor }),
        'Error adding inline comment',
      ));
    },
  );
}

function registerGetAttachments(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_getAttachments',
    {
      description: `List the attachments on a Confluence page in the ${context.instanceType} with their metadata: id, file name (title), media type, size in bytes, comment, version, and when and by whom it was last updated. Filter by exact file name or media type. Download a file with confluence_downloadAttachment.`,
      inputSchema: z.object(collaborationToolSchemas.getAttachments),
    },
    async ({ pageId, filename, mediaType, start, limit }) => formatToolResponse(await handleApiOperation(
      () => readAttachments({ pageId, filename, mediaType, start, limit: limit ?? context.getPageSize() }),
      'Error getting attachments',
    )),
  );
}

function registerDeleteAttachment(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_deleteAttachment',
    {
      description: `Delete an attachment, with all its versions, from the ${context.instanceType}. The id is checked first, so a page or comment id is refused. Confluence moves the attachment to the space trash when it can, otherwise it deletes it for good; treat it as irreversible and confirm with the user first.`,
      inputSchema: z.object(collaborationToolSchemas.deleteAttachment),
    },
    async ({ attachmentId }) => formatToolResponse(
      await handleApiOperation(() => deleteAttachment(attachmentId), 'Error deleting attachment'),
    ),
  );
}

function registerSearchUser(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  tools.registerTool(
    'confluence_searchUser',
    {
      description: `Search the users of the ${context.instanceType} by name or username. Returns username, user key and display name, e.g. to mention someone in storage format (<ac:link><ri:user ri:userkey="..." /></ac:link>) or to filter CQL by creator. Searches Confluence's user index (CQL type = user), so it covers every user, not just one group.`,
      inputSchema: z.object(collaborationToolSchemas.searchUser),
    },
    async ({ query, cql, limit, start }) => {
      const hasQuery = Boolean(query?.replace(/\*/g, '').trim());
      if (hasQuery === Boolean(cql?.trim())) {
        return formatToolResponse({ success: false, error: 'Provide either query or cql, not both and not neither.' });
      }
      const resolvedCql = hasQuery ? buildUserSearchCql(query ?? '') : (cql ?? '');
      return formatToolResponse(await handleApiOperation(
        () => searchUsers(resolvedCql, limit ?? 10, start ?? 0),
        'Error searching users',
      ));
    },
  );
}

export function registerCollaborationTools(tools: PolicyRegistrar, context: ConfluenceToolContext): void {
  registerGetComments(tools, context);
  registerGetInlineComments(tools, context);
  registerAddComment(tools, context);
  registerReplyToComment(tools, context);
  registerAddInlineComment(tools, context);
  registerGetAttachments(tools, context);
  registerDeleteAttachment(tools, context);
  registerSearchUser(tools, context);
}
