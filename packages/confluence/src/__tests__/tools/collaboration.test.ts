import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { AttachmentsService, ContentResourceService, SearchService } from '../../confluence-client/index.js';
import { request as __request } from '../../confluence-client/core/request.js';
import { COLLABORATION_CATALOG, buildUserSearchCql, registerCollaborationTools } from '../../tools/collaboration.js';

jest.mock('../../confluence-client/index.js', () => ({
  AttachmentsService: { getAttachments: jest.fn() },
  ContentResourceService: { getContentById: jest.fn(), createContent: jest.fn(), delete3: jest.fn() },
  SearchService: { search1: jest.fn() },
  OpenAPI: { BASE: 'https://confluence.example.com' },
}));

jest.mock('../../confluence-client/core/request.js', () => ({ request: jest.fn() }));

const mocked = {
  request: __request as unknown as jest.Mock,
  getAttachments: AttachmentsService.getAttachments as jest.Mock,
  getContent: ContentResourceService.getContentById as jest.Mock,
  createContent: ContentResourceService.createContent as jest.Mock,
  deleteContent: ContentResourceService.delete3 as jest.Mock,
  search: SearchService.search1 as jest.Mock,
};

const COMMENT_EXPAND = 'body.storage,history,version,ancestors,extensions.inlineProperties,extensions.resolution';

const apiError = (status: number, statusText: string) => Object.assign(new Error(statusText), { status, statusText, body: {} });

const jdoe = {
  type: 'known',
  username: 'jdoe',
  userKey: '8ab381b8a1017d0d',
  displayName: 'Jane Doe',
  profilePicture: { path: '/images/icons/profilepics/default.svg' },
  _links: { self: 'https://confluence.example.com/rest/api/user?key=8ab381b8a1017d0d' },
};

const footerComment = {
  id: '9001',
  type: 'comment',
  title: 'Re: Release notes',
  body: { storage: { value: '<p>Looks good &amp; ready</p>', representation: 'storage' } },
  history: { createdBy: jdoe, createdDate: '2026-06-09T11:29:16.891Z' },
  version: { by: jdoe, when: '2026-06-10T08:00:00.000Z', number: 2 },
  ancestors: [],
  extensions: { location: 'footer', resolution: { status: 'open' } },
  _links: { webui: '/pages/viewpage.action?pageId=123&focusedCommentId=9001', self: 'https://confluence.example.com/rest/api/content/9001' },
  _expandable: { children: '/rest/api/content/9001/child' },
};

const inlineReply = {
  ...footerComment,
  id: '9003',
  body: { storage: { value: '<p>Agreed</p>', representation: 'storage' } },
  ancestors: [{ id: '9002', type: 'comment' }],
  extensions: {
    location: 'inline',
    inlineProperties: { originalSelection: 'deadline', markerRef: 'a1b2c3' },
    resolution: { status: 'resolved' },
  },
};

const author = { displayName: 'Jane Doe', username: 'jdoe', userKey: '8ab381b8a1017d0d' };

const shapedFooter = {
  id: '9001',
  author,
  created: '2026-06-09T11:29:16.891Z',
  updated: '2026-06-10T08:00:00.000Z',
  location: 'footer',
  resolution: 'open',
  body: 'Looks good & ready',
};

const shapedInlineReply = {
  ...shapedFooter,
  id: '9003',
  parentCommentId: '9002',
  location: 'inline',
  resolution: 'resolved',
  originalSelection: 'deadline',
  markerRef: 'a1b2c3',
  body: 'Agreed',
};

const attachment = {
  id: '9371899',
  type: 'attachment',
  title: 'report.pdf',
  container: { id: '123', type: 'page' },
  version: { by: jdoe, when: '2026-06-09T11:32:27.404Z', number: 2 },
  metadata: { mediaType: 'application/pdf' },
  extensions: { mediaType: 'application/pdf', fileSize: 3554, comment: '' },
  _links: { download: '/download/attachments/123/report.pdf?version=2' },
};

const shapedAttachment = {
  id: '9371899',
  title: 'report.pdf',
  mediaType: 'application/pdf',
  fileSize: 3554,
  version: 2,
  updated: '2026-06-09T11:32:27.404Z',
  updatedBy: 'Jane Doe',
};

function setup() {
  const recorder = createRecordingRegistrar();
  registerCollaborationTools(recorder.registrar, { instanceType: 'Confluence Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const errorOf = async (name: string, args: Record<string, unknown>) => {
  const result = await setup().call(name, args);
  expect(result.isError).toBe(true);
  return JSON.parse((result.content[0] as { text: string }).text).error as string;
};

describe('confluence collaboration tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, in toolsets that are off by default', () => {
    const registered = setup().registrar.registeredTools();

    expect(registered).toEqual(Object.keys(COLLABORATION_CATALOG.tools));
    expect(Object.values(COLLABORATION_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
    expect(COLLABORATION_CATALOG.tools.confluence_deleteAttachment.access).toBe('destructive');
  });

  describe('confluence_getComments', () => {
    it('requests every comment with replies and shapes them', async () => {
      mocked.request.mockResolvedValue({ results: [footerComment, inlineReply], _links: { next: '/rest/api/content/123/child/comment?start=25' } });

      const result = await setup().callJson('confluence_getComments', { pageId: '123' });

      expect(mocked.request).toHaveBeenCalledWith(expect.anything(), {
        method: 'GET',
        url: '/rest/api/content/{id}/child/comment',
        path: { id: '123' },
        query: { expand: COMMENT_EXPAND, depth: 'all', start: 0, limit: 25, location: undefined },
      });
      expect(result).toEqual({
        success: true,
        data: { pageId: '123', start: 0, limit: 25, size: 2, hasMore: true, comments: [shapedFooter, shapedInlineReply] },
      });
    });

    it('returns storage bodies and honours paging when asked', async () => {
      mocked.request.mockResolvedValue({ results: [footerComment], _links: {} });

      const result = await setup().callJson('confluence_getComments', { pageId: '123', start: 50, limit: 10, bodyFormat: 'storage' });

      expect(mocked.request.mock.calls[0][1].query).toMatchObject({ start: 50, limit: 10 });
      expect(result.data.hasMore).toBe(false);
      expect(result.data.comments[0].body).toBe('<p>Looks good &amp; ready</p>');
    });

    it('reports API errors', async () => {
      mocked.request.mockRejectedValue(apiError(404, 'Not Found'));

      expect(await errorOf('confluence_getComments', { pageId: '404' })).toBe('Error getting comments: 404 Not Found');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_getComments', {})).rejects.toThrow();
      await expect(setup().call('confluence_getComments', { pageId: '123', limit: 0 })).rejects.toThrow();
      await expect(setup().call('confluence_getComments', { pageId: '123', bodyFormat: 'markdown' })).rejects.toThrow();
    });
  });

  describe('confluence_getInlineComments', () => {
    it('asks for open and resolved inline comments and drops footer ones', async () => {
      mocked.request.mockResolvedValue({ results: [footerComment, inlineReply] });

      const result = await setup().callJson('confluence_getInlineComments', { pageId: '123' });

      expect(mocked.request.mock.calls[0][1].query.location).toEqual(['inline', 'resolved']);
      expect(result.data.comments).toEqual([shapedInlineReply]);
      expect(result.data.size).toBe(1);
    });

    it('leaves resolved comments out when includeResolved is false', async () => {
      mocked.request.mockResolvedValue({ results: [] });

      await setup().callJson('confluence_getInlineComments', { pageId: '123', includeResolved: false });

      expect(mocked.request.mock.calls[0][1].query.location).toEqual(['inline']);
    });

    it('reports API errors', async () => {
      mocked.request.mockRejectedValue(apiError(403, 'Forbidden'));

      expect(await errorOf('confluence_getInlineComments', { pageId: '123' })).toBe('Error getting inline comments: 403 Forbidden');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_getInlineComments', { pageId: '' })).rejects.toThrow();
      await expect(setup().call('confluence_getInlineComments', { pageId: '123', includeResolved: 'yes' })).rejects.toThrow();
    });
  });

  describe('confluence_addComment', () => {
    it('posts a storage-format footer comment and returns a compact acknowledgement', async () => {
      mocked.createContent.mockResolvedValue({
        ...footerComment,
        _links: { base: 'https://confluence.example.com', webui: '/pages/viewpage.action?pageId=123&focusedCommentId=9001' },
      });

      const result = await setup().callJson('confluence_addComment', { pageId: '123', body: '<p>Looks good</p>' });

      expect(mocked.createContent).toHaveBeenCalledWith({
        type: 'comment',
        container: { id: '123', type: 'page' },
        body: { storage: { value: '<p>Looks good</p>', representation: 'storage' } },
      }, COMMENT_EXPAND);
      const { body: _body, ...ack } = shapedFooter;
      expect(result).toEqual({
        success: true,
        data: { ...ack, pageId: '123', url: 'https://confluence.example.com/pages/viewpage.action?pageId=123&focusedCommentId=9001' },
      });
    });

    it('refuses a blank body without calling Confluence', async () => {
      expect(await errorOf('confluence_addComment', { pageId: '123', body: '   ' })).toContain('body');
      expect(mocked.createContent).not.toHaveBeenCalled();
    });

    it('reports API errors', async () => {
      mocked.createContent.mockRejectedValue(apiError(400, 'Bad Request'));

      expect(await errorOf('confluence_addComment', { pageId: '123', body: '<p>x</p>' })).toBe('Error adding comment: 400 Bad Request');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_addComment', { pageId: '123' })).rejects.toThrow();
      await expect(setup().call('confluence_addComment', { pageId: '123', body: '' })).rejects.toThrow();
    });
  });

  describe('confluence_replyToComment', () => {
    it("posts the reply under the parent comment's page", async () => {
      mocked.getContent.mockResolvedValue({ id: '9002', type: 'comment', container: { id: '77', type: 'blogpost' }, ancestors: [] });
      mocked.createContent.mockResolvedValue({ ...inlineReply, _links: {} });

      const result = await setup().callJson('confluence_replyToComment', { commentId: '9002', body: '<p>Agreed</p>' });

      expect(mocked.getContent).toHaveBeenCalledWith('9002', 'container,ancestors');
      expect(mocked.createContent).toHaveBeenCalledWith({
        type: 'comment',
        container: { id: '77', type: 'blogpost' },
        body: { storage: { value: '<p>Agreed</p>', representation: 'storage' } },
        ancestors: [{ id: '9002' }],
      }, COMMENT_EXPAND);
      expect(result.data).toMatchObject({ id: '9003', parentCommentId: '9002', pageId: '77' });
      expect(result.data.body).toBeUndefined();
    });

    it('finds the page among the ancestors when the container is a comment', async () => {
      mocked.getContent.mockResolvedValue({
        id: '9005', type: 'comment', container: { id: '9002', type: 'comment' }, ancestors: [{ id: '123', type: 'page' }, { id: '9002', type: 'comment' }],
      });
      mocked.createContent.mockResolvedValue(inlineReply);

      await setup().callJson('confluence_replyToComment', { commentId: '9005', body: '<p>x</p>' });

      expect(mocked.createContent.mock.calls[0][0].container).toEqual({ id: '123', type: 'page' });
    });

    it('refuses an id that is not a comment', async () => {
      mocked.getContent.mockResolvedValue({ id: '123', type: 'page' });

      expect(await errorOf('confluence_replyToComment', { commentId: '123', body: '<p>x</p>' })).toBe('Content 123 is a page, not a comment.');
      expect(mocked.createContent).not.toHaveBeenCalled();
    });

    it('reports API errors', async () => {
      mocked.getContent.mockRejectedValue(apiError(404, 'Not Found'));

      expect(await errorOf('confluence_replyToComment', { commentId: '1', body: '<p>x</p>' })).toBe('Error replying to comment: 404 Not Found');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_replyToComment', { body: '<p>x</p>' })).rejects.toThrow();
      expect(await errorOf('confluence_replyToComment', { commentId: '9002', body: ' ' })).toContain('body');
      expect(mocked.getContent).not.toHaveBeenCalled();
    });
  });

  describe('confluence_addInlineComment', () => {
    it('sends the inline properties Data Center expects', async () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1781004578667);
      mocked.createContent.mockResolvedValue(inlineReply);

      try {
        await setup().callJson('confluence_addInlineComment', {
          pageId: '123', body: '<p>Is this date final?</p>', textSelection: 'deadline', textSelectionMatchCount: 3, textSelectionMatchIndex: 2,
        });
      } finally {
        now.mockRestore();
      }

      expect(mocked.createContent).toHaveBeenCalledWith({
        type: 'comment',
        container: { id: '123', type: 'page' },
        body: { storage: { value: '<p>Is this date final?</p>', representation: 'storage' } },
        extensions: {
          location: 'inline',
          inlineProperties: {
            originalSelection: 'deadline',
            numMatches: 3,
            matchIndex: 2,
            lastFetchTime: '1781004578667',
            serializedHighlights: '[["deadline"]]',
          },
        },
      }, COMMENT_EXPAND);
    });

    it('defaults to the first of one occurrence', async () => {
      mocked.createContent.mockResolvedValue(inlineReply);

      await setup().callJson('confluence_addInlineComment', { pageId: '123', body: '<p>x</p>', textSelection: 'deadline' });

      expect(mocked.createContent.mock.calls[0][0].extensions.inlineProperties).toMatchObject({ numMatches: 1, matchIndex: 0 });
    });

    it('refuses a match index outside the match count', async () => {
      const error = await errorOf('confluence_addInlineComment', {
        pageId: '123', body: '<p>x</p>', textSelection: 'deadline', textSelectionMatchCount: 2, textSelectionMatchIndex: 2,
      });

      expect(error).toContain('textSelectionMatchIndex');
      expect(mocked.createContent).not.toHaveBeenCalled();
    });

    it('reports API errors', async () => {
      mocked.createContent.mockRejectedValue(apiError(400, 'Bad Request'));

      const error = await errorOf('confluence_addInlineComment', { pageId: '123', body: '<p>x</p>', textSelection: 'deadline' });

      expect(error).toBe('Error adding inline comment: 400 Bad Request');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_addInlineComment', { pageId: '123', body: '<p>x</p>' })).rejects.toThrow();
      await expect(setup().call('confluence_addInlineComment', {
        pageId: '123', body: '<p>x</p>', textSelection: 'deadline', textSelectionMatchIndex: -1,
      })).rejects.toThrow();
      expect(await errorOf('confluence_addInlineComment', { pageId: '123', body: '<p>x</p>', textSelection: '  ' })).toContain('textSelection');
    });
  });

  describe('confluence_getAttachments', () => {
    it('passes filters and paging to Confluence and shapes the metadata', async () => {
      mocked.getAttachments.mockResolvedValue({ results: [attachment], _links: { next: '/next' } });

      const result = await setup().callJson('confluence_getAttachments', { pageId: '123', filename: 'report.pdf', mediaType: 'application/pdf' });

      expect(mocked.getAttachments).toHaveBeenCalledWith('123', 'version', 'report.pdf', '25', '0', 'application/pdf');
      expect(result).toEqual({
        success: true,
        data: { pageId: '123', start: 0, limit: 25, size: 1, hasMore: true, attachments: [shapedAttachment] },
      });
    });

    it('applies the filters itself when Confluence ignores them', async () => {
      const image = { ...attachment, id: '2', title: 'diagram.png', extensions: { mediaType: 'image/png', fileSize: 10 } };
      mocked.getAttachments.mockResolvedValue({ results: [attachment, image] });

      const result = await setup().callJson('confluence_getAttachments', { pageId: '123', mediaType: 'image/png', start: 10, limit: 5 });

      expect(mocked.getAttachments).toHaveBeenCalledWith('123', 'version', undefined, '5', '10', 'image/png');
      expect(result.data.attachments.map((item: { id: string }) => item.id)).toEqual(['2']);
    });

    it('reports API errors', async () => {
      mocked.getAttachments.mockRejectedValue(apiError(404, 'Not Found'));

      expect(await errorOf('confluence_getAttachments', { pageId: '123' })).toBe('Error getting attachments: 404 Not Found');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_getAttachments', {})).rejects.toThrow();
      await expect(setup().call('confluence_getAttachments', { pageId: '123', limit: 101 })).rejects.toThrow();
    });
  });

  describe('confluence_deleteAttachment', () => {
    it('checks the id is an attachment, then deletes it', async () => {
      mocked.getContent.mockResolvedValue(attachment);
      mocked.deleteContent.mockResolvedValue(undefined);

      const result = await setup().callJson('confluence_deleteAttachment', { attachmentId: '9371899' });

      expect(mocked.getContent).toHaveBeenCalledWith('9371899', 'container,version');
      expect(mocked.deleteContent).toHaveBeenCalledWith('9371899');
      expect(result).toEqual({ success: true, data: { deleted: true, pageId: '123', attachment: shapedAttachment } });
    });

    it('refuses to delete content that is not an attachment', async () => {
      mocked.getContent.mockResolvedValue({ id: '123', type: 'page' });

      expect(await errorOf('confluence_deleteAttachment', { attachmentId: '123' })).toContain('not an attachment');
      expect(mocked.deleteContent).not.toHaveBeenCalled();
    });

    it('reports API errors', async () => {
      mocked.getContent.mockResolvedValue(attachment);
      mocked.deleteContent.mockRejectedValue(apiError(403, 'Forbidden'));

      expect(await errorOf('confluence_deleteAttachment', { attachmentId: '9371899' })).toBe('Error deleting attachment: 403 Forbidden');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_deleteAttachment', {})).rejects.toThrow();
      await expect(setup().call('confluence_deleteAttachment', { attachmentId: '' })).rejects.toThrow();
    });
  });

  describe('confluence_searchUser', () => {
    it('turns plain text into an escaped full-name and prefix search', () => {
      expect(buildUserSearchCql(' Jane "JD" Doe* ')).toBe('type = user AND (user.fullname ~ "Jane \\"JD\\" Doe" OR user.fullname ~ "Jane \\"JD\\" Doe*")');
    });

    it('searches users and keeps only user results', async () => {
      mocked.search.mockResolvedValue({
        results: [{ user: { ...jdoe, email: '' }, title: 'Jane Doe', entityType: 'user' }, { content: { id: '1' }, entityType: 'content' }],
        totalSize: 1,
        _links: {},
      });

      const result = await setup().callJson('confluence_searchUser', { query: 'Jane' });

      expect(mocked.search).toHaveBeenCalledWith(undefined, undefined, undefined, '10', '0', 'none', buildUserSearchCql('Jane'));
      expect(result.data).toEqual({
        cql: buildUserSearchCql('Jane'),
        start: 0,
        size: 1,
        totalSize: 1,
        hasMore: false,
        users: [{ username: 'jdoe', userKey: '8ab381b8a1017d0d', displayName: 'Jane Doe' }],
      });
    });

    it('passes raw CQL through unchanged', async () => {
      mocked.search.mockResolvedValue({ results: [] });

      await setup().callJson('confluence_searchUser', { cql: 'type = user AND user.fullname ~ "Doe"', limit: 50, start: 50 });

      expect(mocked.search).toHaveBeenCalledWith(undefined, undefined, undefined, '50', '50', 'none', 'type = user AND user.fullname ~ "Doe"');
    });

    it('needs exactly one of query and cql', async () => {
      expect(await errorOf('confluence_searchUser', {})).toContain('either query or cql');
      expect(await errorOf('confluence_searchUser', { query: 'Jane', cql: 'type = user' })).toContain('either query or cql');
      expect(await errorOf('confluence_searchUser', { query: ' * ' })).toContain('either query or cql');
      expect(mocked.search).not.toHaveBeenCalled();
    });

    it('reports API errors', async () => {
      mocked.search.mockRejectedValue(apiError(400, 'Bad Request'));

      expect(await errorOf('confluence_searchUser', { cql: 'type = user AND' })).toBe('Error searching users: 400 Bad Request');
    });

    it('rejects invalid input', async () => {
      await expect(setup().call('confluence_searchUser', { query: 'Jane', limit: 51 })).rejects.toThrow();
      await expect(setup().call('confluence_searchUser', { query: 42 })).rejects.toThrow();
    });
  });
});
