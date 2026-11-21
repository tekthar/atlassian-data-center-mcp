import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { STRUCTURE_CATALOG } from '../../apps/structure/catalog.js';
import { parseForest } from '../../apps/structure/forest.js';
import { registerStructureReadTools } from '../../apps/structure/read-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: { requests?: { forestSpec?: unknown; rows?: number[]; attributes?: unknown[] }[] };
}

const BASE = '/structure/2.0';

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    const route = routes[`${options.method} ${options.url}`];
    if (route === undefined) throw new Error(`Unexpected request to ${options.method} ${options.url}`);
    if (route instanceof Error) throw route;
    return typeof route === 'function' ? route(options) : route;
  });
}

const sentTo = (url: string) => mockedRequest.mock.calls.map((call) => call[1] as RequestOptions).filter((options) => options.url === url);

function setup() {
  const recorder = createRecordingRegistrar();
  registerStructureReadTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

/* Two epics with stories, a folder holding one of them, a generator row and an item with a string id. */
const FOREST = {
  spec: { structureId: 7 },
  formula: '101:0:10001,102:1:10002,103:1:10003:2,104:0:5/240,105:1:10004,106:2:10005,107:0:4/356,108:0:9//team%3Aa%2Cb',
  itemTypes: { 4: 'com.almworks.jira.structure:type-generator', 5: 'com.almworks.jira.structure:type-folder', 9: 'com.example:type-team' },
  version: { signature: 1, version: 3 },
};

/** Answers /value with a summary for each row asked for, and marks row 103 inaccessible. */
function values(options: RequestOptions) {
  const asked = options.body?.requests?.[0];
  const rows = asked?.rows ?? [];
  const data = (asked?.attributes as { id: string }[]).map((attribute) => ({
    attribute: { ...attribute, format: 'text' },
    values: rows.map((rowId) => (rowId === 103 ? null : `${attribute.id} of ${rowId}`)),
  }));
  return { responses: [{ forestSpec: asked?.forestSpec, rows, data, inaccessibleRows: rows.filter((rowId) => rowId === 103) }], itemTypes: {} };
}

describe('Structure tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued tool, all reading, in a toolset that is off by default', () => {
    expect(setup().registrar.registeredTools().sort()).toEqual(Object.keys(STRUCTURE_CATALOG.tools).sort());
    expect(Object.values(STRUCTURE_CATALOG.tools).every((entry) => entry.access === 'read')).toBe(true);
    expect(Object.values(STRUCTURE_CATALOG.toolsets).every((toolset) => !toolset.default)).toBe(true);
  });

  it('reads a forest formula: issues by id, other items by type, string ids decoded, the row semantics ignored', () => {
    expect(parseForest(FOREST.formula, FOREST.itemTypes)).toEqual([
      { rowId: 101, depth: 0, type: 'issue', itemId: '10001' },
      { rowId: 102, depth: 1, type: 'issue', itemId: '10002' },
      { rowId: 103, depth: 1, type: 'issue', itemId: '10003' },
      { rowId: 104, depth: 0, type: 'folder', itemId: '240' },
      { rowId: 105, depth: 1, type: 'issue', itemId: '10004' },
      { rowId: 106, depth: 2, type: 'issue', itemId: '10005' },
      { rowId: 107, depth: 0, type: 'generator', itemId: '356' },
      { rowId: 108, depth: 0, type: 'com.example:type-team', itemId: 'team:a,b' },
    ]);
    expect(parseForest('')).toEqual([]);
  });

  it('searches structures by name and access, a page at a time, with their owners', async () => {
    routeRequests({ [`GET ${BASE}/structure`]: { structures: [{ id: 7, name: 'Roadmap', owner: 'user:anna' }], haveMore: false } });

    const result = await setup().callJson('structure_getStructures', { name: 'road', permission: 'edit', page: 2 });

    expect(sentTo(`${BASE}/structure`)[0].query).toEqual({ name: 'road', permission: 'EDIT', archived: undefined, limit: 25, page: 2, withOwner: true });
    expect(result.data).toEqual({ structures: [{ id: 7, name: 'Roadmap', owner: 'user:anna' }], haveMore: false });
  });

  it('gets one structure with its owner and, for those who control it, its sharing rules', async () => {
    routeRequests({ [`GET ${BASE}/structure/{structureId}`]: { id: 7, name: 'Roadmap' } });

    await setup().callJson('structure_getStructure', { structureId: 7 });

    expect(sentTo(`${BASE}/structure/{structureId}`)[0]).toMatchObject({ path: { structureId: 7 }, query: { withOwner: true, withPermissions: true } });
  });

  it('reads a structure\'s rows in order with their values, marking the rows you may not read', async () => {
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST, [`POST ${BASE}/value`]: values });

    const result = await setup().callJson('structure_getStructureRows', { structureId: 7, limit: 3 });

    expect(sentTo(`${BASE}/forest/latest`)[0].query).toEqual({ s: '{"structureId":7}' });
    expect(sentTo(`${BASE}/value`)[0].body).toEqual({
      requests: [{
        forestSpec: { structureId: 7 },
        rows: [101, 102, 103],
        attributes: [{ id: 'key', format: 'text' }, { id: 'summary', format: 'text' }, { id: 'status', format: 'text' }],
      }],
    });
    expect(result.data).toEqual({
      structureId: 7,
      totalRows: 8,
      offset: 0,
      rows: [
        { rowId: 101, depth: 0, type: 'issue', itemId: '10001', key: 'key of 101', summary: 'summary of 101', status: 'status of 101' },
        { rowId: 102, depth: 1, type: 'issue', itemId: '10002', key: 'key of 102', summary: 'summary of 102', status: 'status of 102' },
        { rowId: 103, depth: 1, type: 'issue', itemId: '10003', inaccessible: true },
      ],
      nextOffset: 3,
    });
  });

  it('narrows the rows to one row\'s subtree and a depth, and asks only for the attributes given', async () => {
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST, [`POST ${BASE}/value`]: values });

    const result = await setup().callJson('structure_getStructureRows', { structureId: 7, underRowId: 104, maxDepth: 1, attributes: ['summary', 'assignee'] });

    expect(sentTo(`${BASE}/value`)[0].body?.requests?.[0]).toMatchObject({
      rows: [104, 105], attributes: [{ id: 'summary', format: 'text' }, { id: 'assignee', format: 'text' }],
    });
    expect(result.data).toMatchObject({ totalRows: 2, rows: [{ rowId: 104, type: 'folder', summary: 'summary of 104' }, { rowId: 105 }] });
    expect(result.data).not.toHaveProperty('nextOffset');
  });

  it('explains a row that isn\'t in the structure, and asks for no values past the last page', async () => {
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST });
    const tools = setup();

    const missing = await tools.callJson('structure_getStructureRows', { structureId: 7, underRowId: 999 });
    const pastEnd = await tools.callJson('structure_getStructureRows', { structureId: 7, offset: 8 });

    expect(missing.error).toContain('Row 999 is not in this structure');
    expect(pastEnd.data).toEqual({ structureId: 7, totalRows: 8, offset: 8, rows: [] });
    expect(sentTo(`${BASE}/value`)).toHaveLength(0);
  });

  it('refuses attributes Structure isn\'t asked for as text, and pages over 500 rows, before calling it', async () => {
    const tools = setup();

    await expect(tools.call('structure_getStructureRows', { structureId: 7, attributes: ['progress'] })).rejects.toThrow();
    await expect(tools.call('structure_getStructureRows', { structureId: 7, limit: 501 })).rejects.toThrow();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('lists the structures holding an issue by the issue\'s id, with their names', async () => {
    routeRequests({
      'GET /api/2/issue/{issueIdOrKey}': { id: '10002', key: 'PROJ-12' },
      [`GET ${BASE}/structure/list`]: {
        recent: [7], containingAnchor: [7, 9], totalContainingAnchor: 12, anchorIssue: 10002,
        structures: [{ id: 7, name: 'Roadmap' }, { id: 9, name: 'Q4 plan' }],
      },
    });

    const result = await setup().callJson('structure_getIssueStructures', { issueKey: 'PROJ-12' });

    expect(sentTo('/api/2/issue/{issueIdOrKey}')[0]).toMatchObject({ path: { issueIdOrKey: 'PROJ-12' }, query: { fields: 'summary' } });
    expect(sentTo(`${BASE}/structure/list`)[0].query).toEqual({ anchorIssue: '10002' });
    expect(result.data).toEqual({
      issueKey: 'PROJ-12',
      total: 12,
      structures: [{ id: 7, name: 'Roadmap' }, { id: 9, name: 'Q4 plan' }],
      note: 'Structure lists only the first 2, your recent structures first.',
    });
  });

  it('explains a 404 in terms of the structure and Structure', async () => {
    routeRequests({ [`GET ${BASE}/structure/{structureId}`]: Object.assign(new Error('Not Found'), { status: 404 }) });

    const result = await setup().callJson('structure_getStructure', { structureId: 99 });

    expect(result.error).toContain('Structure 99 was not found (404). Structure answers 404 for a structure you can\'t view, too.');
  });
});
