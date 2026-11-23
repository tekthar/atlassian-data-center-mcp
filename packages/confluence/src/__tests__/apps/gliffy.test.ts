import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../confluence-client/core/request.js';
import { GLIFFY_CATALOG } from '../../apps/gliffy/catalog.js';
import { summarizeGliffyDiagram } from '../../apps/gliffy/gon.js';
import { findGliffyDiagrams } from '../../apps/gliffy/page-macros.js';
import { registerGliffyReadTools } from '../../apps/gliffy/read-tools.js';

jest.mock('../../confluence-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

const BASE = '/rest/gliffy/1.0';

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    const response = routes[options.url];
    if (response instanceof Error) throw response;
    return response;
  });
}

const sentTo = (url: string) => mockedRequest.mock.calls.map((call) => call[1] as RequestOptions).filter((options) => options.url === url);

function setup() {
  const recorder = createRecordingRegistrar();
  registerGliffyReadTools(recorder.registrar, { instanceType: 'Confluence Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const text = (id: number, html: string) => ({ id, uid: null, graphic: { type: 'Text', Text: { html } }, children: [] });
const shape = (id: number, uid: string, label?: string, children: unknown[] = []) => ({
  id, uid, graphic: { type: 'Shape', Shape: { tid: 'stencil' } }, children: [...(label ? [text(id * 100, label)] : []), ...children],
});
const line = (id: number, start?: number, end?: number, label?: string) => ({
  id,
  uid: 'com.gliffy.shape.basic.basic_v1.default.line',
  graphic: { type: 'Line', Line: { strokeWidth: 2 } },
  children: label ? [text(id * 100, label)] : [],
  constraints: {
    constraints: [],
    ...(start === undefined ? {} : { startConstraint: { type: 'StartPositionConstraint', StartPositionConstraint: { nodeId: start, px: 1, py: 0.5 } } }),
    ...(end === undefined ? {} : { endConstraint: { type: 'EndPositionConstraint', EndPositionConstraint: { nodeId: String(end), px: 0, py: 0.5 } } }),
  },
});

/* A start shape, a decision inside a group with a free text, and two lines, one with a loose end. */
const GON = {
  contentType: 'application/gliffy+json',
  version: '1.3',
  stage: {
    objects: [
      shape(1, 'com.gliffy.shape.flowchart.flowchart_v1.default.start_end', '<p style="text-align:center;"><span>Start</span></p>'),
      {
        id: 2, uid: 'com.gliffy.shape.basic.basic_v1.default.group', graphic: null,
        children: [shape(3, 'com.gliffy.shape.flowchart.flowchart_v1.default.decision', '<p>Paid&nbsp;<b>yet?</b></p>'), text(4, '<p>Checkout</p>')],
      },
      line(5, 1, 3, '<p>next</p>'),
      line(6, 3),
    ],
  },
};

describe('Gliffy diagrams', () => {
  it('reads a diagram as shapes with their labels and the connections between them, by label', () => {
    expect(summarizeGliffyDiagram(GON)).toEqual({
      shapes: [
        { id: '1', label: 'Start', shape: 'start_end' },
        { id: '2', label: '', shape: 'group' },
        { id: '3', label: 'Paid yet?', shape: 'decision', in: 'group' },
        { id: '4', label: 'Checkout', shape: 'text', in: 'group' },
      ],
      connections: [
        { from: 'Start', to: 'Paid yet?', label: 'next' },
        { from: 'Paid yet?', to: '(unconnected)' },
      ],
    });
    expect(summarizeGliffyDiagram({})).toEqual({ shapes: [], connections: [] });
  });

  it('counts the shapes past the first 300 instead of listing them', () => {
    const many = { stage: { objects: Array.from({ length: 305 }, (_, index) => shape(index + 1, 'x.rectangle', `<p>${index}</p>`)) } };

    const summary = summarizeGliffyDiagram(many);

    expect(summary.shapes).toHaveLength(300);
    expect(summary.notListed).toEqual({ shapes: 5, connections: 0 });
  });

  it('finds the gliffy macros on a page: its own diagrams, pinned versions and diagrams from other pages', () => {
    const storage = `<p>Flow</p>
      <ac:structured-macro ac:name="gliffy" ac:schema-version="1"><ac:parameter ac:name="name">Checkout flow</ac:parameter><ac:parameter ac:name="displayName">Checkout</ac:parameter><ac:parameter ac:name="pagePin">3</ac:parameter></ac:structured-macro>
      <ac:structured-macro ac:name="info"><ac:rich-text-body><p>note</p></ac:rich-text-body></ac:structured-macro>
      <ac:structured-macro ac:name="gliffy"><ac:parameter ac:name="name">Architecture</ac:parameter><ac:parameter ac:name="pageid">555</ac:parameter></ac:structured-macro>
      <ac:structured-macro ac:name="gliffy"><ac:parameter ac:name="name">Org chart</ac:parameter><ac:parameter ac:name="space">HR</ac:parameter><ac:parameter ac:name="page">People</ac:parameter></ac:structured-macro>`;

    expect(findGliffyDiagrams(storage, '123')).toEqual([
      { diagramName: 'Checkout flow', displayName: 'Checkout', pageId: '123', version: 3 },
      { diagramName: 'Architecture', pageId: '555' },
      { diagramName: 'Org chart', page: 'People', space: 'HR' },
    ]);
  });
});

describe('Gliffy tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all reading, in a toolset that is off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(GLIFFY_CATALOG.tools).sort());
    expect(Object.values(GLIFFY_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(GLIFFY_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('searches diagrams by name, space and creator, sorting only with an order, and trims what it returns', async () => {
    routeRequests({
      [`${BASE}/diagrams`]: {
        diagrams: [{
          attachmentId: 77, pageId: 123, name: 'Checkout flow', displayName: 'Checkout', pageName: 'Payments', spaceKey: 'ENG', spaceName: 'Engineering',
          lastModifier: 'anna', lastModified: Date.UTC(2026, 10, 20), lastModifiedFriendly: 'yesterday', urls: { view: '/x' }, version: 0,
        }],
      },
    });
    const tools = setup();

    const result = await tools.callJson('gliffy_searchDiagrams', { name: 'checkout', spaceKey: 'ENG', mine: true, sort: 'modified' });
    await tools.callJson('gliffy_searchDiagrams', { sort: 'title', limit: 5, start: 5 });
    await tools.callJson('gliffy_searchDiagrams', {});

    expect(sentTo(`${BASE}/diagrams`).map((options) => options.query)).toEqual([
      { query: 'checkout', spaceKey: 'ENG', filterByUser: true, sort: 'modified', order: 'descending', results: 25, index: 0 },
      { query: undefined, spaceKey: undefined, filterByUser: undefined, sort: 'title', order: 'ascending', results: 5, index: 5 },
      { query: undefined, spaceKey: undefined, filterByUser: undefined, sort: undefined, order: undefined, results: 25, index: 0 },
    ]);
    expect(result.data).toEqual([{
      attachmentId: 77, name: 'Checkout flow', displayName: 'Checkout', pageId: 123, pageName: 'Payments', spaceKey: 'ENG', spaceName: 'Engineering',
      version: 0, lastModifier: 'anna', lastModified: '2026-11-20T00:00:00.000Z',
    }]);
  });

  it('lists the diagrams a page shows from its storage format', async () => {
    routeRequests({
      '/rest/api/content/{id}': { id: '123', title: 'Payments', body: { storage: { value: '<ac:structured-macro ac:name="gliffy"><ac:parameter ac:name="name">Flow</ac:parameter></ac:structured-macro>' } } },
    });

    const result = await setup().callJson('gliffy_listPageDiagrams', { pageId: '123' });

    expect(result.data).toEqual({ pageId: '123', title: 'Payments', diagrams: [{ diagramName: 'Flow', pageId: '123' }] });
  });

  it('reads a diagram by its id, an earlier version, as a summary or as Gliffy\'s JSON', async () => {
    routeRequests({ [`${BASE}/diagrams/{id}`]: { attachmentId: 77, name: 'Checkout flow', version: 4, gon: GON, urls: {}, imageUrl: '/download/x.png' } });
    const tools = setup();

    const summary = await tools.callJson('gliffy_getDiagram', { diagramId: 'att77', version: 2 });
    const json = await tools.callJson('gliffy_getDiagram', { diagramId: '77', format: 'json' });

    expect(sentTo(`${BASE}/diagrams/{id}`)[0]).toMatchObject({ method: 'GET', path: { id: '77' }, query: { version: 2 } });
    expect(summary.data).toMatchObject({ attachmentId: 77, name: 'Checkout flow', version: 4, diagram: { connections: [{ from: 'Start', to: 'Paid yet?', label: 'next' }, expect.anything()] } });
    expect(json.data).toEqual({ attachmentId: 77, name: 'Checkout flow', version: 4, diagram: GON });
  });

  it('finds a diagram by page and name among the page\'s attachments, and explains what it can\'t find', async () => {
    routeRequests({
      '/rest/api/content/{id}/child/attachment': { results: [{ id: 'att88', title: 'Checkout flow' }] },
      [`${BASE}/diagrams/{id}`]: { attachmentId: 88, name: 'Checkout flow', gon: GON },
    });
    const tools = setup();

    const found = await tools.callJson('gliffy_getDiagram', { pageId: '123', diagramName: 'Checkout flow' });
    const missing = await tools.callJson('gliffy_getDiagram', { pageId: '123', diagramName: 'Nope' });
    const neither = await tools.callJson('gliffy_getDiagram', { pageId: '123' });

    expect(sentTo('/rest/api/content/{id}/child/attachment')[0]).toMatchObject({ path: { id: '123' }, query: { filename: 'Checkout flow' } });
    expect(sentTo(`${BASE}/diagrams/{id}`)[0].path).toEqual({ id: '88' });
    expect(found.data).toMatchObject({ attachmentId: 88 });
    expect(missing.error).toContain('Page 123 has no Gliffy diagram named "Nope"');
    expect(neither.error).toContain('Give diagramId, or pageId and diagramName.');
  });

  it('lists a diagram\'s versions with who saved each', async () => {
    routeRequests({
      [`${BASE}/diagrams/{id}/history`]: { numRevisions: 4, revisions: [{ attachmentId: 77, version: 4, lastModifier: 'anna', lastModified: Date.UTC(2026, 10, 21) }] },
    });

    const result = await setup().callJson('gliffy_getDiagramHistory', { diagramId: '77', limit: 1 });

    expect(sentTo(`${BASE}/diagrams/{id}/history`)[0].query).toEqual({ results: 1, index: 0 });
    expect(result.data).toEqual({ diagramId: '77', versions: 4, revisions: [{ attachmentId: 77, version: 4, lastModifier: 'anna', lastModified: '2026-11-21T00:00:00.000Z' }] });
  });

  it('explains a 404 in terms of the diagram and Gliffy', async () => {
    routeRequests({ [`${BASE}/diagrams/{id}`]: Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('gliffy_getDiagram', { diagramId: '99' });

    expect(result.error).toContain('Gliffy diagram 99 was not found (404)');
  });
});
