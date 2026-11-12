import { deflateRawSync } from 'node:zlib';
import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../confluence-client/core/request.js';
import { DRAWIO_CATALOG } from '../../apps/drawio/catalog.js';
import { readPages, summarizePage } from '../../apps/drawio/diagram-xml.js';
import { findPageDiagrams } from '../../apps/drawio/page-macros.js';
import { registerDrawioReadTools } from '../../apps/drawio/read-tools.js';

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

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    if (!(options.url in routes)) throw new Error(`Unexpected request to ${options.url}`);
    const response = routes[options.url];
    if (response instanceof Error) throw response;
    return response;
  });
}

const sent = (index = 0) => mockedRequest.mock.calls[index][1] as RequestOptions;

function setup() {
  const recorder = createRecordingRegistrar();
  registerDrawioReadTools(recorder.registrar, { instanceType: 'Confluence Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const MODEL = `<mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="lane" value="Checkout" style="swimlane;html=1;" vertex="1" parent="1"/>
  <mxCell id="a" value="&lt;b&gt;Cart&lt;/b&gt;&amp;nbsp;page" style="rounded=1;whiteSpace=wrap;" vertex="1" parent="lane"/>
  <UserObject label="Pay" id="b"><mxCell style="ellipse;" vertex="1" parent="lane"/></UserObject>
  <mxCell id="e1" style="edgeStyle=orthogonal;" edge="1" parent="1" source="a" target="b"/>
  <mxCell id="e1l" value="submit" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e1"/>
  <mxCell id="e2" value="retry" edge="1" parent="1" source="b"/>
</root></mxGraphModel>`;

const compress = (xml: string) => deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64');

describe('draw.io diagram files', () => {
  it('reads each page, inflating compressed ones', () => {
    const file = `<mxfile><diagram id="p1" name="Flow">${MODEL}</diagram><diagram id="p2" name="Old &amp; packed">${compress(MODEL)}</diagram></mxfile>`;

    const pages = readPages(file);

    expect(pages.map((page) => page.name)).toEqual(['Flow', 'Old & packed']);
    expect(pages[1].xml).toBe(MODEL);
  });

  it('treats a bare model as one page', () => {
    expect(readPages(MODEL)).toEqual([{ name: 'Page-1', xml: MODEL }]);
  });

  it('summarizes a page as labelled shapes and the connections between them', () => {
    expect(summarizePage({ name: 'Flow', xml: MODEL })).toEqual({
      name: 'Flow',
      shapes: [
        { id: 'b', label: 'Pay', shape: 'ellipse', in: 'Checkout' },
        { id: 'lane', label: 'Checkout', shape: 'swimlane' },
        { id: 'a', label: 'Cart page', in: 'Checkout' },
      ],
      connections: [
        { from: 'Cart page', to: 'Pay', label: 'submit' },
        { from: 'Pay', to: '(unconnected)', label: 'retry' },
      ],
    });
  });

  it('finds the diagrams a page shows, including one embedded from another page', () => {
    const storage = '<p>Intro</p>'
      + '<ac:structured-macro ac:name="drawio" ac:schema-version="1"><ac:parameter ac:name="diagramName">Flow</ac:parameter><ac:parameter ac:name="revision">3</ac:parameter></ac:structured-macro>'
      + '<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Not a diagram</ac:parameter></ac:structured-macro>'
      + '<ac:structured-macro ac:name="inc-drawio"><ac:parameter ac:name="diagramName">Arch</ac:parameter><ac:parameter ac:name="pageId">555</ac:parameter></ac:structured-macro>';

    expect(findPageDiagrams(storage, '100')).toEqual([
      { macro: 'drawio', diagramName: 'Flow', pageId: '100', revision: 3 },
      { macro: 'inc-drawio', diagramName: 'Arch', pageId: '555' },
    ]);
  });
});

describe('draw.io tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all read-only, in a toolset that is off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(DRAWIO_CATALOG.tools).sort());
    expect(Object.values(DRAWIO_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(DRAWIO_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('searches draw.io diagrams, leaving out thumbnails and links', async () => {
    routeRequests({ '/rest/drawio/1.0/diagramSearch': [{ name: 'Flow', pageId: 100, spaceKey: 'ENG', thumbnailURL: 'x', downloadURL: 'y', xml: null }] });

    const result = await setup().callJson('drawio_searchDiagrams', { name: 'Flow', spaceKeys: ['ENG'] });

    expect(sent()).toMatchObject({ method: 'GET', query: { diagramName: 'Flow', spaceKeys: ['ENG'], maxResults: 25, diagramTypes: 'DRAWIO' } });
    expect(result).toEqual({ success: true, data: [{ name: 'Flow', pageId: 100, spaceKey: 'ENG' }] });
  });

  it('lists a page\'s diagrams from its storage format', async () => {
    routeRequests({ '/rest/api/content/{id}': { title: 'Design', body: { storage: { value: '<ac:structured-macro ac:name="drawio"><ac:parameter ac:name="diagramName">Flow</ac:parameter></ac:structured-macro>' } } } });

    const result = await setup().callJson('drawio_listPageDiagrams', { pageId: '100' });

    expect(sent()).toMatchObject({ path: { id: '100' }, query: { expand: 'body.storage' } });
    expect(result.data).toEqual({ pageId: '100', title: 'Design', diagrams: [{ macro: 'drawio', diagramName: 'Flow', pageId: '100' }] });
  });

  it('reads a diagram as a summary by default, and as XML when asked', async () => {
    routeRequests({ '/rest/drawio/1.0/diagram/crud/{diagramName}/{owningPageId}': { name: 'Flow', pageId: 100, revision: 3, xml: `<mxfile><diagram name="Flow">${compress(MODEL)}</diagram></mxfile>`, thumbnailURL: 't' } });
    const tools = setup();

    const summary = await tools.callJson('drawio_getDiagram', { pageId: '100', diagramName: 'Flow' });
    const xml = await tools.callJson('drawio_getDiagram', { pageId: '100', diagramName: 'Flow', format: 'xml', revision: 2 });

    expect(sent(0)).toMatchObject({ path: { diagramName: 'Flow', owningPageId: '100' } });
    expect(sent(1).query).toEqual({ revision: 2 });
    expect(summary.data).toMatchObject({ name: 'Flow', revision: 3, pages: [{ name: 'Flow', connections: [{ from: 'Cart page', to: 'Pay', label: 'submit' }, { from: 'Pay', to: '(unconnected)', label: 'retry' }] }] });
    expect(summary.data).not.toHaveProperty('xml');
    expect(summary.data).not.toHaveProperty('thumbnailURL');
    expect(xml.data.pages).toEqual([{ name: 'Flow', xml: MODEL }]);
  });

  it('explains a 404 in terms of the diagram and draw.io', async () => {
    routeRequests({ '/rest/drawio/1.0/diagram/crud/{diagramName}/{owningPageId}': Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('drawio_getDiagram', { pageId: '100', diagramName: 'Gone' });

    expect(result.error).toContain('Diagram "Gone" on page 100 was not found (404)');
  });
});
