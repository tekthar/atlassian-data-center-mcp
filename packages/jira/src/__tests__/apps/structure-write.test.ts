import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { request } from '../../jira-client/core/request.js';
import { STRUCTURE_CATALOG } from '../../apps/structure/catalog.js';
import { registerStructureWriteTools } from '../../apps/structure/write-tools.js';

jest.mock('../../jira-client/core/request.js', () => ({
  request: jest.fn(),
}));

const mockedRequest = request as jest.Mock;

interface RequestOptions {
  method: string;
  url: string;
  body?: { jql?: string; validateQuery?: boolean; spec?: unknown; version?: unknown; actions?: Record<string, unknown>[]; [field: string]: unknown };
}

const BASE = '/structure/2.0';
const VERSION = { signature: 5, version: 9 };

/* Epic 101 with stories 102 and 103 (103 has a sub-task 104), then epic 105. */
const FOREST = { spec: { structureId: 7 }, formula: '101:0:10001,102:1:10002,103:1:10003,104:2:10004,105:0:10005', itemTypes: {}, version: VERSION };

function routeRequests(routes: Record<string, unknown>) {
  mockedRequest.mockImplementation(async (_config: unknown, options: RequestOptions) => {
    const route = routes[`${options.method} ${options.url}`];
    if (route === undefined) throw new Error(`Unexpected request to ${options.method} ${options.url}`);
    return typeof route === 'function' ? route(options) : route;
  });
}

const sentTo = (url: string) => mockedRequest.mock.calls.map((call) => call[1] as RequestOptions).filter((options) => options.url === url);
const updates = () => sentTo(`${BASE}/forest/update`).map((options) => options.body);

function setup() {
  const recorder = createRecordingRegistrar();
  registerStructureWriteTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('Structure write tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every catalogued write tool, removing rows as destructive', () => {
    const writes = Object.entries(STRUCTURE_CATALOG.tools).filter(([, entry]) => entry.access !== 'read').map(([name]) => name);

    expect(setup().registrar.registeredTools().sort()).toEqual(writes.sort());
    expect(STRUCTURE_CATALOG.tools.structure_removeRows.access).toBe('destructive');
    expect(STRUCTURE_CATALOG.tools.structure_addIssues.access).toBe('write');
  });

  it('adds issues last under a row, by their ids, with temporary row ids it maps to the new ones', async () => {
    routeRequests({
      'POST /api/2/search': { issues: [{ id: '20001', key: 'PROJ-21' }, { id: '20002', key: 'PROJ-22' }] },
      [`GET ${BASE}/forest/latest`]: FOREST,
      [`POST ${BASE}/forest/update`]: {
        successfulActions: 1, oldRowIds: [-1, -2], newRowIds: [201, 202],
        effects: [{ batchId: 3, effects: [{ generatorRowId: 0, external: false, description: 'Added 2 issues', reversible: true }] }],
      },
    });

    const result = await setup().callJson('structure_addIssues', { structureId: 7, issueKeys: ['PROJ-21', 'proj-22'], underRowId: 101 });

    expect(sentTo('/api/2/search')[0].body).toMatchObject({ jql: 'key in (PROJ-21, PROJ-22)', validateQuery: false });
    expect(updates()).toEqual([{
      spec: { structureId: 7 }, version: VERSION,
      actions: [{ action: 'add', forest: '-1:0:20001,-2:0:20002', under: 101, after: 103, before: 0 }],
    }]);
    expect(result.data).toEqual({
      structureId: 7,
      added: [{ issueKey: 'PROJ-21', rowId: 201 }, { issueKey: 'PROJ-22', rowId: 202 }],
      effects: [{ description: 'Added 2 issues', external: false, reversible: true }],
    });
  });

  it('adds nothing when Jira doesn\'t find every issue', async () => {
    routeRequests({ 'POST /api/2/search': { issues: [{ id: '20001', key: 'PROJ-21' }] } });

    const result = await setup().callJson('structure_addIssues', { structureId: 7, issueKeys: ['PROJ-21', 'PROJ-99'] });

    expect(result.error).toContain('Jira found no issue PROJ-99');
    expect(sentTo(`${BASE}/forest/update`)).toHaveLength(0);
  });

  it('moves rows after a sibling, placing them before the next one, or last at the top level', async () => {
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST, [`POST ${BASE}/forest/update`]: { successfulActions: 1 } });
    const tools = setup();

    const first = await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [103], underRowId: 105 });
    await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [105], afterRowId: 101 });
    await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [101] });

    expect(updates().map((body) => body?.actions?.[0])).toEqual([
      { action: 'move', rowIds: [103], under: 105, after: 0, before: 0 },
      { action: 'move', rowIds: [105], under: 0, after: 101, before: 0 },
      { action: 'move', rowIds: [101], under: 0, after: 105, before: 0 },
    ]);
    expect(first.data).toEqual({ structureId: 7, moved: [103], under: 105 });
  });

  it('refuses rows that aren\'t in the structure, an after row from another level, and moving a row under itself', async () => {
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST });
    const tools = setup();

    expect((await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [999] })).error).toContain('Row 999 is not in this structure');
    expect((await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [105], underRowId: 101, afterRowId: 104 })).error)
      .toContain('Row 104 is not directly under row 101');
    expect((await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [101], underRowId: 101 })).error).toContain('under itself');
    expect(sentTo(`${BASE}/forest/update`)).toHaveLength(0);
  });

  it('removes rows, reporting what Structure did beyond the structure', async () => {
    routeRequests({
      [`GET ${BASE}/forest/latest`]: FOREST,
      [`POST ${BASE}/forest/update`]: {
        successfulActions: 1,
        effects: [{ batchId: 4, effects: [{ generatorRowId: 88, external: true, description: 'Delete link PROJ-1 blocks PROJ-3', reversible: true }] }],
        problems: [{ generatorRowId: 89, description: 'A sorter skipped one row' }],
      },
    });

    const result = await setup().callJson('structure_removeRows', { structureId: 7, rowIds: [103] });

    expect(updates()[0]?.actions).toEqual([{ action: 'remove', rowIds: [103] }]);
    expect(result.data).toEqual({
      structureId: 7, removed: [103],
      effects: [{ description: 'Delete link PROJ-1 blocks PROJ-3', external: true, reversible: true }],
      problems: ['A sorter skipped one row'],
    });
  });

  it('creates a structure with a name and description, owned by whoever creates it', async () => {
    routeRequests({ [`POST ${BASE}/structure`]: { id: 12, name: 'Q1 plan', description: 'Epics for Q1', owner: 'user:anna', readOnly: false } });

    const result = await setup().callJson('structure_createStructure', { name: 'Q1 plan', description: 'Epics for Q1' });

    expect(sentTo(`${BASE}/structure`)[0].body).toEqual({ name: 'Q1 plan', description: 'Epics for Q1' });
    expect(result.data).toEqual({ id: 12, name: 'Q1 plan', description: 'Epics for Q1', owner: 'user:anna' });
  });

  it('adds a folder last under a row, sending the items version Structure reads after creating it', async () => {
    routeRequests({
      [`GET ${BASE}/forest/latest`]: FOREST,
      [`POST ${BASE}/item/create`]: { successfulActions: 1, itemId: 'com.almworks.jira.structure:type-folder/31', oldRowIds: [-1], newRowIds: [301] },
    });

    const result = await setup().callJson('structure_addFolder', { structureId: 7, name: 'Backend', underRowId: 101 });

    expect(sentTo(`${BASE}/item/create`)[0].body).toEqual({
      forest: { spec: { structureId: 7 }, version: VERSION },
      items: { version: { signature: 0, version: 0 } },
      rowId: -1,
      item: { type: 'com.almworks.jira.structure:type-folder', values: { summary: 'Backend' } },
      under: 101, after: 103, before: 0,
    });
    expect(result.data).toEqual({ structureId: 7, name: 'Backend', rowId: 301, itemId: 'com.almworks.jira.structure:type-folder/31' });
  });

  it('explains Structure\'s form errors for a folder, and refuses a blank name before calling it', async () => {
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST, [`POST ${BASE}/item/create`]: { formErrors: [], fieldErrors: { summary: 'Folder name cannot be empty' } } });
    const tools = setup();

    const refused = await tools.callJson('structure_addFolder', { structureId: 7, name: 'x' });
    await expect(tools.call('structure_addFolder', { structureId: 7, name: '   ' })).rejects.toThrow();

    expect(refused.error).toContain('Structure didn\'t create the folder in structure 7: Folder name cannot be empty');
    expect(sentTo(`${BASE}/item/create`)).toHaveLength(1);
  });

  it('explains a refusal and a choice Structure can\'t ask for here', async () => {
    const answers = [
      { successfulActions: 0, updateError: { error: { message: 'You don\'t have permission to edit this structure', itemDescription: 'PROJ-3' } } },
      { successfulActions: 0, updateError: { interactions: [{ message: 'Change the Epic Link of PROJ-3?', itemDescription: 'PROJ-3' }] } },
    ];
    routeRequests({ [`GET ${BASE}/forest/latest`]: FOREST, [`POST ${BASE}/forest/update`]: () => answers.shift() });
    const tools = setup();

    const refused = await tools.callJson('structure_removeRows', { structureId: 7, rowIds: [103] });
    const choice = await tools.callJson('structure_moveRows', { structureId: 7, rowIds: [103], underRowId: 105 });

    expect(refused.error).toContain('Structure refused the change to structure 7: You don\'t have permission to edit this structure (PROJ-3). Nothing was changed.');
    expect(choice.error).toContain('Structure needs a choice for this change to structure 7, which it can\'t ask here: Change the Epic Link of PROJ-3? (PROJ-3)');
  });
});
