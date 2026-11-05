import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import {
  ChildContentService,
  ContentLabelsService,
  ContentResourceService,
  ContentRestrictionsService,
} from '../../confluence-client/index.js';
import { OpenAPI } from '../../confluence-client/core/OpenAPI.js';
import { request } from '../../confluence-client/core/request.js';
import { diffLines, registerPageManagementTools, unifiedDiff } from '../../tools/page-management.js';

jest.mock('../../confluence-client/index.js', () => ({
  ChildContentService: { childrenOfType: jest.fn() },
  ContentLabelsService: { labels: jest.fn(), addLabels: jest.fn() },
  ContentResourceService: { getContent: jest.fn(), getContentById: jest.fn(), createContent: jest.fn(), delete3: jest.fn() },
  ContentRestrictionsService: { byOperation: jest.fn(), updateRestrictions: jest.fn() },
}));

jest.mock('../../confluence-client/core/request.js', () => ({ request: jest.fn() }));

const mocked = {
  children: ChildContentService.childrenOfType as jest.Mock,
  getContent: ContentResourceService.getContent as jest.Mock,
  getById: ContentResourceService.getContentById as jest.Mock,
  create: ContentResourceService.createContent as jest.Mock,
  remove: ContentResourceService.delete3 as jest.Mock,
  labels: ContentLabelsService.labels as jest.Mock,
  addLabels: ContentLabelsService.addLabels as jest.Mock,
  byOperation: ContentRestrictionsService.byOperation as jest.Mock,
  updateRestrictions: ContentRestrictionsService.updateRestrictions as jest.Mock,
  request: request as jest.Mock,
};

const BASE = 'https://wiki.example.com';
const VERSION_EXPAND = 'body.storage,version,space';

const page = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'page',
  status: 'current',
  title,
  space: { key: 'DEV', name: 'Development', _links: {}, _expandable: { homepage: '' } },
  version: { number: 3, by: { username: 'jdoe', displayName: 'Jane Doe' }, when: '2026-11-01T10:00:00.000+03:00', message: '', minorEdit: false },
  _links: { webui: `/pages/viewpage.action?pageId=${id}`, self: `${BASE}/rest/api/content/${id}` },
  _expandable: { children: '', history: '' },
  ...extra,
});

const withBody = (storage: string) => ({ body: { storage: { value: storage, representation: 'storage' } } });

const apiError = (status: number, statusText: string) =>
  Object.assign(new Error(statusText), { status, statusText, body: { message: 'Confluence said no' } });

function setup() {
  const recorder = createRecordingRegistrar();
  registerPageManagementTools(recorder.registrar, { instanceType: 'Confluence Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const errorOf = async (recorder: ReturnType<typeof setup>, tool: string, args: Record<string, unknown>) => {
  const result = await recorder.call(tool, args);
  expect(result.isError).toBe(true);
  return JSON.parse((result.content[0] as { text: string }).text).error as string;
};

beforeEach(() => {
  jest.resetAllMocks();
  OpenAPI.BASE = BASE;
});

describe('confluence page management tools', () => {
  it('registers every tool in the module', () => {
    expect(setup().registrar.registeredTools()).toEqual([
      'confluence_getPageChildren',
      'confluence_getSpacePageTree',
      'confluence_deletePage',
      'confluence_movePage',
      'confluence_copyPage',
      'confluence_getPageHistory',
      'confluence_getPageDiff',
      'confluence_getLabels',
      'confluence_addLabel',
      'confluence_getPageRestrictions',
      'confluence_setPageRestrictions',
    ]);
  });
});

describe('confluence_getPageChildren', () => {
  it('lists child pages with the default page size and shapes them', async () => {
    mocked.children.mockResolvedValue({
      results: [{ ...page('11', 'Child A'), _links: { webui: '/display/DEV/Child+A' } }],
      start: 0,
      limit: 25,
      size: 1,
      _links: { base: `${BASE}/confluence`, context: '/confluence', next: '/rest/api/content/10/child/page?start=1' },
    });

    const result = await setup().callJson('confluence_getPageChildren', { parentId: '10' });

    expect(mocked.children).toHaveBeenCalledWith('10', 'page', 'space,version', '25', '0');
    expect(result).toEqual({
      success: true,
      data: {
        parentId: '10',
        start: 0,
        count: 1,
        hasMore: true,
        nextStart: 1,
        children: [{
          id: '11',
          title: 'Child A',
          type: 'page',
          status: 'current',
          spaceKey: 'DEV',
          version: 3,
          webUrl: `${BASE}/confluence/display/DEV/Child+A`,
        }],
      },
    });
  });

  it('expands and converts bodies when asked', async () => {
    mocked.children.mockResolvedValue({ results: [{ ...page('11', 'Child A'), ...withBody('<p>Hello <strong>world</strong></p>') }], _links: {} });

    const result = await setup().callJson('confluence_getPageChildren', { parentId: '10', limit: 5, start: 10, bodyMode: 'text' });

    expect(mocked.children).toHaveBeenCalledWith('10', 'page', 'space,version,body.storage', '5', '10');
    expect(result.data.hasMore).toBe(false);
    expect(result.data.children[0]).toMatchObject({ id: '11', body: 'Hello world', bodyFormat: 'text' });
  });

  it('reports API errors', async () => {
    mocked.children.mockRejectedValue(apiError(404, 'Not Found'));

    expect(await errorOf(setup(), 'confluence_getPageChildren', { parentId: '10' })).toBe('Error getting child pages: 404 Not Found');
  });

  it('rejects a limit below 1', async () => {
    await expect(setup().call('confluence_getPageChildren', { parentId: '10', limit: 0 })).rejects.toThrow();
    expect(mocked.children).not.toHaveBeenCalled();
  });
});

describe('confluence_getSpacePageTree', () => {
  it('returns a flat tree sorted by depth, then position, then title', async () => {
    mocked.getContent.mockResolvedValue({
      results: [
        { id: '1', title: 'Home', ancestors: [], extensions: { position: 'none' } },
        { id: '3', title: 'Beta', ancestors: [{ id: '1' }], extensions: { position: 1 } },
        { id: '2', title: 'Alpha', ancestors: [{ id: '1' }], extensions: { position: 0 } },
      ],
      _links: { next: '/rest/api/content?spaceKey=DEV&start=3' },
    });

    const result = await setup().callJson('confluence_getSpacePageTree', { spaceKey: 'DEV', limit: 3 });

    expect(mocked.getContent).toHaveBeenCalledWith('DEV', 'ancestors', '3', '0', undefined, undefined, undefined, 'page');
    expect(result.data).toEqual({
      spaceKey: 'DEV',
      start: 0,
      count: 3,
      hasMore: true,
      nextStart: 3,
      hint: expect.stringContaining('start=3'),
      pages: [
        { id: '1', title: 'Home', parentId: null, depth: 0, position: null },
        { id: '2', title: 'Alpha', parentId: '1', depth: 1, position: 0 },
        { id: '3', title: 'Beta', parentId: '1', depth: 1, position: 1 },
      ],
    });
  });

  it('pages through the space in batches of 200 until the API has no next link', async () => {
    const batch = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({ id: String(from + index), title: `Page ${from + index}`, ancestors: [] }));
    mocked.getContent
      .mockResolvedValueOnce({ results: batch(0, 200), _links: { next: '/next' } })
      .mockResolvedValueOnce({ results: batch(200, 2), _links: {} });

    const result = await setup().callJson('confluence_getSpacePageTree', { spaceKey: 'DEV', limit: 300 });

    expect(mocked.getContent).toHaveBeenNthCalledWith(1, 'DEV', 'ancestors', '200', '0', undefined, undefined, undefined, 'page');
    expect(mocked.getContent).toHaveBeenNthCalledWith(2, 'DEV', 'ancestors', '100', '200', undefined, undefined, undefined, 'page');
    expect(result.data).toMatchObject({ count: 202, hasMore: false });
    expect(result.data.nextStart).toBeUndefined();
  });

  it('reports API errors', async () => {
    mocked.getContent.mockRejectedValue(apiError(403, 'Forbidden'));

    expect(await errorOf(setup(), 'confluence_getSpacePageTree', { spaceKey: 'DEV' })).toBe('Error getting space page tree: 403 Forbidden');
  });

  it.each([
    [{ spaceKey: '' }],
    [{ spaceKey: 'DEV', limit: 1001 }],
  ])('rejects invalid input %j', async (args) => {
    await expect(setup().call('confluence_getSpacePageTree', args)).rejects.toThrow();
    expect(mocked.getContent).not.toHaveBeenCalled();
  });
});

describe('confluence_deletePage', () => {
  it('trashes the page and lists the child pages Confluence moves up', async () => {
    mocked.getById.mockResolvedValue(page('20', 'Old', { ancestors: [{ id: '1' }, { id: '5' }] }));
    mocked.children.mockResolvedValue({ results: [page('21', 'Kid')], _links: {} });
    mocked.remove.mockResolvedValue(undefined);

    const result = await setup().callJson('confluence_deletePage', { pageId: '20' });

    expect(mocked.getById).toHaveBeenCalledWith('20', 'space,version,ancestors');
    expect(mocked.children).toHaveBeenCalledWith('20', 'page', undefined, '50');
    expect(mocked.remove).toHaveBeenCalledWith('20');
    expect(result).toEqual({
      success: true,
      data: {
        id: '20',
        title: 'Old',
        type: 'page',
        status: 'trashed',
        spaceKey: 'DEV',
        version: 3,
        parentId: '5',
        webUrl: `${BASE}/pages/viewpage.action?pageId=20`,
        childPagesMovedUp: [{ id: '21', title: 'Kid' }],
        childPagesNewParentId: '5',
        note: expect.stringContaining('trash'),
      },
    });
  });

  it('refuses content Confluence would delete permanently', async () => {
    mocked.getById.mockResolvedValue({ ...page('30', 'Re: Old'), type: 'comment' });

    expect(await errorOf(setup(), 'confluence_deletePage', { pageId: '30' })).toContain('refusing to delete it');
    expect(mocked.remove).not.toHaveBeenCalled();
  });

  it('reports API errors without deleting', async () => {
    mocked.getById.mockRejectedValue(apiError(404, 'Not Found'));

    expect(await errorOf(setup(), 'confluence_deletePage', { pageId: '20' })).toBe('Error deleting page: 404 Not Found');
    expect(mocked.remove).not.toHaveBeenCalled();
  });

  it('rejects an empty page id', async () => {
    await expect(setup().call('confluence_deletePage', { pageId: '' })).rejects.toThrow();
  });
});

describe('confluence_movePage', () => {
  const movedUnder = (...ancestorIds: string[]) => page('20', 'Moved', { ancestors: ancestorIds.map((id) => ({ id })) });

  it('moves a page under a target and verifies where it landed', async () => {
    mocked.getById
      .mockResolvedValueOnce(page('40', 'Target', { ancestors: [{ id: '1' }] }))
      .mockResolvedValueOnce(movedUnder('1', '40'));
    mocked.request.mockResolvedValue('<html></html>');

    const result = await setup().callJson('confluence_movePage', { pageId: '20', targetId: '40' });

    expect(mocked.getById).toHaveBeenNthCalledWith(1, '40', 'space,ancestors');
    expect(mocked.request).toHaveBeenCalledWith(OpenAPI, {
      method: 'POST',
      url: '/pages/movepage.action',
      headers: { 'X-Atlassian-Token': 'no-check' },
      query: { pageId: '20', spaceKey: 'DEV', targetId: '40', position: 'append' },
    });
    expect(mocked.getById).toHaveBeenNthCalledWith(2, '20', 'space,version,ancestors');
    expect(result.data).toEqual({
      moved: true,
      page: { id: '20', title: 'Moved', type: 'page', status: 'current', spaceKey: 'DEV', version: 3, parentId: '40', webUrl: `${BASE}/pages/viewpage.action?pageId=20` },
    });
  });

  it("places a page next to a sibling under the target's parent", async () => {
    mocked.getById
      .mockResolvedValueOnce(page('40', 'Target', { ancestors: [{ id: '1' }] }))
      .mockResolvedValueOnce(movedUnder('1'));

    const result = await setup().callJson('confluence_movePage', { pageId: '20', targetId: '40', position: 'above' });

    expect(mocked.request.mock.calls[0][1].query).toEqual({ pageId: '20', spaceKey: 'DEV', targetId: '40', position: 'above' });
    expect(result.data.page.parentId).toBe('1');
  });

  it('moves a page to the top level of another space', async () => {
    mocked.getById.mockResolvedValueOnce({ ...movedUnder(), space: { key: 'OPS' } });

    const result = await setup().callJson('confluence_movePage', { pageId: '20', targetSpaceKey: 'OPS' });

    expect(mocked.request.mock.calls[0][1].query).toEqual({ pageId: '20', spaceKey: 'OPS', position: 'topLevel' });
    expect(mocked.getById).toHaveBeenCalledTimes(1);
    expect(result.data.page).toMatchObject({ spaceKey: 'OPS', parentId: null });
  });

  it('fails when the page is not where it was asked to go', async () => {
    mocked.getById
      .mockResolvedValueOnce(page('40', 'Target', { ancestors: [{ id: '1' }] }))
      .mockResolvedValueOnce(movedUnder('1'));

    expect(await errorOf(setup(), 'confluence_movePage', { pageId: '20', targetId: '40' })).toContain('is in space DEV under parent 1');
  });

  it('reports API errors from the move action', async () => {
    mocked.getById.mockResolvedValueOnce(page('40', 'Target'));
    mocked.request.mockRejectedValue(apiError(403, 'Forbidden'));

    expect(await errorOf(setup(), 'confluence_movePage', { pageId: '20', targetId: '40' })).toBe('Error moving page: 403 Forbidden');
  });

  it('refuses a target page outside the requested space', async () => {
    mocked.getById.mockResolvedValueOnce(page('40', 'Target'));

    expect(await errorOf(setup(), 'confluence_movePage', { pageId: '20', targetId: '40', targetSpaceKey: 'OPS' })).toContain('is in space DEV, not OPS');
    expect(mocked.request).not.toHaveBeenCalled();
  });

  it.each([
    [{ pageId: '20' }, 'Provide targetId'],
    [{ pageId: '20', targetSpaceKey: 'DEV', position: 'below' }, 'needs a targetId'],
    [{ pageId: '20', targetId: '20' }, 'must be different from pageId'],
  ])('validates %j before calling Confluence', async (args, message) => {
    expect(await errorOf(setup(), 'confluence_movePage', args)).toContain(message);
    expect(mocked.getById).not.toHaveBeenCalled();
    expect(mocked.request).not.toHaveBeenCalled();
  });
});

describe('confluence_copyPage', () => {
  it('creates a page from the source body and warns about attachments left behind', async () => {
    mocked.getById.mockResolvedValue(page('50', 'Source', {
      ...withBody('<p>Body</p>'),
      children: { attachment: { results: [{ id: 'att1' }], size: 1 } },
    }));
    mocked.create.mockResolvedValue(page('60', 'Copy of Source', { ancestors: [{ id: '7' }] }));

    const result = await setup().callJson('confluence_copyPage', { sourcePageId: '50', newTitle: 'Copy of Source', destinationParentId: '7' });

    expect(mocked.getById).toHaveBeenCalledWith('50', 'body.storage,space,children.attachment');
    expect(mocked.create).toHaveBeenCalledWith({
      type: 'page',
      title: 'Copy of Source',
      space: { key: 'DEV' },
      body: { storage: { value: '<p>Body</p>', representation: 'storage' } },
      ancestors: [{ id: '7' }],
    });
    expect(result.data).toEqual({
      page: { id: '60', title: 'Copy of Source', type: 'page', status: 'current', spaceKey: 'DEV', version: 3, parentId: '7', webUrl: `${BASE}/pages/viewpage.action?pageId=60` },
      copiedFrom: '50',
      notCopied: expect.stringContaining('attachments'),
      warning: expect.stringContaining('1 attachment(s)'),
    });
  });

  it('copies to the top level of another space', async () => {
    mocked.getById.mockResolvedValue(page('50', 'Source', withBody('<p>Body</p>')));
    mocked.create.mockResolvedValue({ ...page('61', 'Source'), space: { key: 'OPS' } });

    const result = await setup().callJson('confluence_copyPage', { sourcePageId: '50', newTitle: 'Source', destinationSpaceKey: 'OPS' });

    const created = mocked.create.mock.calls[0][0];
    expect(created.space).toEqual({ key: 'OPS' });
    expect(created).not.toHaveProperty('ancestors');
    expect(result.data.warning).toBeUndefined();
  });

  it('refuses content that is not a page', async () => {
    mocked.getById.mockResolvedValue({ ...page('50', 'News'), type: 'blogpost' });

    expect(await errorOf(setup(), 'confluence_copyPage', { sourcePageId: '50', newTitle: 'Copy' })).toContain('only pages can be copied');
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it('reports API errors', async () => {
    mocked.getById.mockResolvedValue(page('50', 'Source', withBody('<p>Body</p>')));
    mocked.create.mockRejectedValue(apiError(400, 'Bad Request'));

    expect(await errorOf(setup(), 'confluence_copyPage', { sourcePageId: '50', newTitle: 'Source' })).toBe('Error copying page: 400 Bad Request');
  });

  it('rejects an empty title', async () => {
    await expect(setup().call('confluence_copyPage', { sourcePageId: '50', newTitle: '' })).rejects.toThrow();
  });
});

describe('confluence_getPageHistory', () => {
  const current = page('70', 'Spec', { ...withBody('<p>New text</p>'), version: { number: 5 } });

  it('reads an older version as historical content', async () => {
    mocked.getById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(page('9001', 'Spec', {
        status: 'historical',
        ...withBody('<p>Old text</p>'),
        version: { number: 2, by: { username: 'jdoe', displayName: 'Jane Doe' }, when: '2026-10-01T09:00:00.000+03:00', message: 'first draft', minorEdit: false },
      }));

    const result = await setup().callJson('confluence_getPageHistory', { pageId: '70', version: 2 });

    expect(mocked.getById).toHaveBeenNthCalledWith(1, '70', VERSION_EXPAND);
    expect(mocked.getById).toHaveBeenNthCalledWith(2, '70', VERSION_EXPAND, '2', 'historical');
    expect(result.data).toEqual({
      id: '70',
      title: 'Spec',
      type: 'page',
      status: 'historical',
      spaceKey: 'DEV',
      version: { number: 2, by: 'Jane Doe', when: '2026-10-01T09:00:00.000+03:00', message: 'first draft', minorEdit: false },
      latestVersion: 5,
      webUrl: `${BASE}/pages/viewpage.action?pageId=9001`,
      body: 'Old text',
      bodyFormat: 'text',
    });
  });

  it('serves the latest version from the current page', async () => {
    mocked.getById.mockResolvedValueOnce(current);

    const result = await setup().callJson('confluence_getPageHistory', { pageId: '70', version: 5, bodyMode: 'storage' });

    expect(mocked.getById).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({ latestVersion: 5, body: '<p>New text</p>', bodyFormat: 'storage' });
  });

  it('reports a version newer than the page', async () => {
    mocked.getById.mockResolvedValueOnce(current);

    expect(await errorOf(setup(), 'confluence_getPageHistory', { pageId: '70', version: 9 })).toBe('Page 70 is at version 5; version 9 does not exist.');
    expect(mocked.getById).toHaveBeenCalledTimes(1);
  });

  it('reports API errors', async () => {
    mocked.getById.mockRejectedValue(apiError(404, 'Not Found'));

    expect(await errorOf(setup(), 'confluence_getPageHistory', { pageId: '70', version: 1 })).toBe('Error getting page version: 404 Not Found');
  });

  it('rejects version 0', async () => {
    await expect(setup().call('confluence_getPageHistory', { pageId: '70', version: 0 })).rejects.toThrow();
  });
});

describe('confluence_getPageDiff', () => {
  const version = (number: number, storage: string) => page('80', 'Spec', { ...withBody(storage), version: { number } });

  it('diffs an older version against the current text', async () => {
    mocked.getById
      .mockResolvedValueOnce(version(2, '<p>Line one</p><p>Line two changed</p><p>Line three</p>'))
      .mockResolvedValueOnce(version(1, '<p>Line one</p><p>Line two</p><p>Line three</p>'));

    const result = await setup().callJson('confluence_getPageDiff', { pageId: '80', fromVersion: 1, toVersion: 2 });

    expect(mocked.getById).toHaveBeenNthCalledWith(1, '80', VERSION_EXPAND);
    expect(mocked.getById).toHaveBeenNthCalledWith(2, '80', VERSION_EXPAND, '1', 'historical');
    expect(result.data).toEqual({
      pageId: '80',
      title: 'Spec',
      fromVersion: 1,
      toVersion: 2,
      latestVersion: 2,
      format: 'text',
      linesAdded: 1,
      linesRemoved: 1,
      diff: ['--- v1', '+++ v2', '@@ -1,3 +1,3 @@', ' Line one', '-Line two', '+Line two changed', ' Line three'].join('\n'),
    });
  });

  it('diffs storage XML split at block tags', async () => {
    mocked.getById
      .mockResolvedValueOnce(version(3, '<p>A</p><p><strong>B</strong></p>'))
      .mockResolvedValueOnce(version(2, '<p>A</p><p>B</p>'));

    const result = await setup().callJson('confluence_getPageDiff', { pageId: '80', fromVersion: 2, toVersion: 3, format: 'storage', contextLines: 0 });

    expect(result.data.diff).toBe(['--- v2', '+++ v3', '@@ -2,1 +2,1 @@', '-<p>B</p>', '+<p><strong>B</strong></p>'].join('\n'));
  });

  it('refuses to diff a version against itself', async () => {
    expect(await errorOf(setup(), 'confluence_getPageDiff', { pageId: '80', fromVersion: 2, toVersion: 2 })).toContain('must be different');
    expect(mocked.getById).not.toHaveBeenCalled();
  });

  it('reports a missing version', async () => {
    mocked.getById.mockResolvedValueOnce(version(2, '<p>A</p>'));

    expect(await errorOf(setup(), 'confluence_getPageDiff', { pageId: '80', fromVersion: 1, toVersion: 4 })).toContain('version 4 does not exist');
  });

  it('reports API errors', async () => {
    mocked.getById
      .mockResolvedValueOnce(version(2, '<p>A</p>'))
      .mockRejectedValueOnce(apiError(404, 'Not Found'));

    expect(await errorOf(setup(), 'confluence_getPageDiff', { pageId: '80', fromVersion: 1, toVersion: 2 })).toBe('Error diffing page versions: 404 Not Found');
  });

  it('rejects more than 20 context lines', async () => {
    await expect(setup().call('confluence_getPageDiff', { pageId: '80', fromVersion: 1, toVersion: 2, contextLines: 21 })).rejects.toThrow();
  });
});

describe('unifiedDiff', () => {
  const diff = (a: string[], b: string[], context = 3) => unifiedDiff(diffLines(a, b), context, 'a', 'b');

  it('is empty when nothing changed', () => {
    expect(diff(['x', 'y'], ['x', 'y'])).toBe('');
  });

  it('numbers pure insertions and deletions like diff -u', () => {
    expect(diff(['x'], ['new', 'x'])).toBe(['--- a', '+++ b', '@@ -1,1 +1,2 @@', '+new', ' x'].join('\n'));
    expect(diff(['gone'], [])).toBe(['--- a', '+++ b', '@@ -1,1 +0,0 @@', '-gone'].join('\n'));
  });

  it('splits distant changes into separate hunks', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const after = ['1', 'two', '3', '4', '5', '6', '7', '8', 'nine', '10'];

    expect(diff(before, after, 1)).toBe([
      '--- a', '+++ b',
      '@@ -1,3 +1,3 @@', ' 1', '-2', '+two', ' 3',
      '@@ -8,3 +8,3 @@', ' 8', '-9', '+nine', ' 10',
    ].join('\n'));
  });
});

describe('confluence_getLabels', () => {
  it('lists labels without links', async () => {
    mocked.labels.mockResolvedValue({ results: [{ prefix: 'global', name: 'reviewed', id: '99', label: 'reviewed' }], size: 1, _links: { base: BASE } });

    const result = await setup().callJson('confluence_getLabels', { contentId: '100' });

    expect(mocked.labels).toHaveBeenCalledWith('100', undefined, '200');
    expect(result).toEqual({ success: true, data: { contentId: '100', labels: [{ name: 'reviewed', prefix: 'global', id: '99' }] } });
  });

  it('reports API errors', async () => {
    mocked.labels.mockRejectedValue(apiError(404, 'Not Found'));

    expect(await errorOf(setup(), 'confluence_getLabels', { contentId: '100' })).toBe('Error getting labels: 404 Not Found');
  });

  it('rejects an empty content id', async () => {
    await expect(setup().call('confluence_getLabels', { contentId: '' })).rejects.toThrow();
  });
});

describe('confluence_addLabel', () => {
  it('adds global labels and returns the full list', async () => {
    mocked.addLabels.mockResolvedValue({
      results: [
        { prefix: 'global', name: 'reviewed', id: '99' },
        { prefix: 'global', name: 'release-notes', id: '100' },
      ],
    });

    const result = await setup().callJson('confluence_addLabel', { contentId: '100', names: ['reviewed', 'release-notes'] });

    expect(mocked.addLabels).toHaveBeenCalledWith('100', [{ prefix: 'global', name: 'reviewed' }, { prefix: 'global', name: 'release-notes' }]);
    expect(result.data.labels.map((label: { name: string }) => label.name)).toEqual(['reviewed', 'release-notes']);
  });

  it('reports API errors', async () => {
    mocked.addLabels.mockRejectedValue(apiError(403, 'Forbidden'));

    expect(await errorOf(setup(), 'confluence_addLabel', { contentId: '100', names: ['x'] })).toBe('Error adding labels: 403 Forbidden');
  });

  it.each([
    [{ contentId: '100', names: [] }],
    [{ contentId: '100', names: ['two words'] }],
  ])('rejects invalid input %j', async (args) => {
    await expect(setup().call('confluence_addLabel', args)).rejects.toThrow();
    expect(mocked.addLabels).not.toHaveBeenCalled();
  });
});

describe('page restrictions', () => {
  const restrictions = {
    read: {
      operation: 'read',
      restrictions: {
        user: { results: [{ type: 'known', username: 'jdoe', userKey: 'abc123', displayName: 'Jane Doe', profilePicture: {} }], size: 1 },
        group: { results: [{ type: 'group', name: 'confluence-admins' }], size: 1 },
      },
      _expandable: { content: '' },
    },
    update: { operation: 'update', restrictions: { user: { results: [], size: 0 }, group: { results: [], size: 0 } } },
  };

  const shaped = {
    pageId: '110',
    read: { users: [{ username: 'jdoe', userKey: 'abc123', displayName: 'Jane Doe' }], groups: ['confluence-admins'] },
    update: { users: [], groups: [] },
  };

  it('reads the direct restrictions by operation', async () => {
    mocked.byOperation.mockResolvedValue(restrictions);

    const result = await setup().callJson('confluence_getPageRestrictions', { pageId: '110' });

    expect(mocked.byOperation).toHaveBeenCalledWith('110', 'restrictions.user,restrictions.group');
    expect(result).toEqual({ success: true, data: shaped });
  });

  it('reports API errors when reading', async () => {
    mocked.byOperation.mockRejectedValue(apiError(404, 'Not Found'));

    expect(await errorOf(setup(), 'confluence_getPageRestrictions', { pageId: '110' })).toBe('Error getting page restrictions: 404 Not Found');
  });

  it('rejects an empty page id when reading', async () => {
    await expect(setup().call('confluence_getPageRestrictions', { pageId: '' })).rejects.toThrow();
  });

  it('sends only the lists it was given, then returns the new restrictions', async () => {
    mocked.updateRestrictions.mockResolvedValue({ results: [] });
    mocked.byOperation.mockResolvedValue(restrictions);

    const result = await setup().callJson('confluence_setPageRestrictions', { pageId: '110', readUsers: ['jdoe'], editGroups: [] });

    expect(mocked.updateRestrictions).toHaveBeenCalledWith('110', 'restrictions.user,restrictions.group', undefined, undefined, [
      { operation: 'read', restrictions: { user: [{ type: 'known', username: 'jdoe' }] } },
      { operation: 'update', restrictions: { group: [] } },
    ]);
    const payload = mocked.updateRestrictions.mock.calls[0][4];
    expect(payload[0].restrictions).not.toHaveProperty('group');
    expect(payload[1].restrictions).not.toHaveProperty('user');
    expect(result).toEqual({ success: true, data: shaped });
  });

  it('requires at least one list', async () => {
    expect(await errorOf(setup(), 'confluence_setPageRestrictions', { pageId: '110' })).toContain('Pass at least one of');
    expect(mocked.updateRestrictions).not.toHaveBeenCalled();
  });

  it('reports API errors when setting', async () => {
    mocked.updateRestrictions.mockRejectedValue(apiError(400, 'Bad Request'));

    expect(await errorOf(setup(), 'confluence_setPageRestrictions', { pageId: '110', editUsers: ['jdoe'] })).toBe('Error setting page restrictions: 400 Bad Request');
    expect(mocked.byOperation).not.toHaveBeenCalled();
  });

  it('rejects an empty username', async () => {
    await expect(setup().call('confluence_setPageRestrictions', { pageId: '110', readUsers: [''] })).rejects.toThrow();
  });
});
