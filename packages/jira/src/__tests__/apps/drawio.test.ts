import { deflateRawSync } from 'node:zlib';
import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { DRAWIO_CATALOG } from '../../apps/drawio/catalog.js';
import { registerDrawioReadTools } from '../../apps/drawio/read-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
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
  registerDrawioReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

const MODEL = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
  + '<mxCell id="a" value="Login" vertex="1" parent="1"/><mxCell id="b" value="Dashboard" vertex="1" parent="1"/>'
  + '<mxCell id="e" edge="1" parent="1" source="a" target="b"/></root></mxGraphModel>';
const FILE = `<mxfile><diagram name="Flow">${deflateRawSync(Buffer.from(encodeURIComponent(MODEL))).toString('base64')}</diagram></mxfile>`;

describe('draw.io for Jira tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all read-only, in a toolset that is off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(DRAWIO_CATALOG.tools).sort());
    expect(Object.values(DRAWIO_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(DRAWIO_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('lists an issue\'s diagrams under /drawio/1.0, without thumbnails and links', async () => {
    routeRequests({ '/drawio/1.0/diagram/list/{issueKey}': [{ name: 'Flow', displayName: 'Login flow', attachmentId: 7, thumbnailURL: 't', imageId: 8 }] });

    const result = await setup().callJson('drawio_listIssueDiagrams', { issueKey: 'ENG-12' });

    expect(sent()).toMatchObject({ method: 'GET', path: { issueKey: 'ENG-12' } });
    expect(result.data).toEqual({ issueKey: 'ENG-12', diagrams: [{ name: 'Flow', displayName: 'Login flow', attachmentId: 7 }] });
  });

  it('reads a diagram as shapes and connections by default, and as XML when asked', async () => {
    routeRequests({ '/drawio/1.0/diagram/crud/{diagramName}/{issueKey}': { name: 'Flow', revision: 2, xml: FILE, downloadURL: 'd' } });
    const tools = setup();

    const summary = await tools.callJson('drawio_getDiagram', { issueKey: 'ENG-12', diagramName: 'Flow' });
    const xml = await tools.callJson('drawio_getDiagram', { issueKey: 'ENG-12', diagramName: 'Flow', format: 'xml' });

    expect(sent()).toMatchObject({ path: { diagramName: 'Flow', issueKey: 'ENG-12' } });
    expect(summary.data).toEqual({
      issueKey: 'ENG-12',
      name: 'Flow',
      revision: 2,
      pages: [{ name: 'Flow', shapes: [{ id: 'a', label: 'Login' }, { id: 'b', label: 'Dashboard' }], connections: [{ from: 'Login', to: 'Dashboard' }] }],
    });
    expect(xml.data.pages).toEqual([{ name: 'Flow', xml: MODEL }]);
  });

  it('explains a 404 in terms of the diagram and draw.io', async () => {
    routeRequests({ '/drawio/1.0/diagram/crud/{diagramName}/{issueKey}': Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('drawio_getDiagram', { issueKey: 'ENG-12', diagramName: 'Gone' });

    expect(result.error).toContain('Diagram "Gone" on ENG-12 was not found (404)');
  });

  it('rejects a malformed issue key before calling draw.io', async () => {
    await expect(setup().call('drawio_listIssueDiagrams', { issueKey: 'not a key' })).rejects.toThrow('Expected a Jira issue key');
  });
});
