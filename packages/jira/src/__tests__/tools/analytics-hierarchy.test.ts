import {
  briefOf,
  childrenByEpic,
  detectEpicParent,
  extractCrossProjectLinks,
  groupDependencies,
  groupEpicsByParent,
  projectKeyOf,
} from '../../tools/analytics-hierarchy.js';

const linked = (key: string, summary = `${key} summary`, status = 'Open') => ({
  id: '1', key, fields: { summary, status: { name: status }, issuetype: { name: 'Story' } },
});

const linkType = (name: string, inward: string, outward: string) => ({ id: '10', name, inward, outward });

const epic = (key: string, fields: Record<string, unknown> = {}) => ({
  key,
  fields: { summary: `${key} summary`, status: { name: 'In Progress' }, issuetype: { name: 'Epic' }, issuelinks: [], ...fields },
});

describe('projectKeyOf', () => {
  it('takes everything before the last dash', () => {
    expect(projectKeyOf('ACS-123')).toBe('ACS');
    expect(projectKeyOf('MY-PROJ-7')).toBe('MY-PROJ');
    expect(projectKeyOf('NODASH')).toBe('NODASH');
  });
});

describe('briefOf', () => {
  it('keeps key, summary, status and type', () => {
    expect(briefOf(linked('ACS-1'))).toEqual({ key: 'ACS-1', summary: 'ACS-1 summary', status: 'Open', issueType: 'Story' });
    expect(briefOf({ key: 'ACS-2', fields: {} })).toEqual({ key: 'ACS-2', summary: '', status: 'Unknown' });
  });
});

describe('detectEpicParent', () => {
  it('uses a parent field that points at another project', () => {
    expect(detectEpicParent(epic('ACS-1', { parent: linked('INIT-1') }), 'ACS')).toEqual({
      key: 'INIT-1', summary: 'INIT-1 summary', status: 'Open', project: 'INIT', source: 'parent',
    });
  });

  it('reads the Advanced Roadmaps Parent Link field in any project', () => {
    const parentLink = { hasEpicLinkFieldDependency: false, showField: true, data: { id: 10005, issueKey: 'ACS-9', keyNum: 9, summary: 'Initiative' } };

    expect(detectEpicParent(epic('ACS-1', { customfield_10500: parentLink }), 'ACS', 'customfield_10500')).toEqual({
      key: 'ACS-9', summary: 'Initiative', project: 'ACS', source: 'parentLink',
    });
    expect(detectEpicParent(epic('ACS-1', { customfield_10500: 'INIT-2' }), 'ACS', 'customfield_10500')).toMatchObject({ key: 'INIT-2' });
  });

  it('ignores an empty Parent Link value', () => {
    const empty = { hasEpicLinkFieldDependency: false, showField: false, nonEditableReason: { reason: 'PLUGIN_LICENSE_ERROR' } };
    expect(detectEpicParent(epic('ACS-1', { customfield_10500: empty }), 'ACS', 'customfield_10500')).toBeUndefined();
  });

  it('follows a cross-project "is child of" link on either side', () => {
    const hierarchy = linkType('Hierarchy', 'is child of', 'is parent of');
    const inward = epic('ACS-1', { issuelinks: [{ type: hierarchy, inwardIssue: linked('INIT-3') }] });
    const outward = epic('ACS-1', { issuelinks: [{ type: linkType('Roll-up', 'contains', 'is contained by'), outwardIssue: linked('INIT-4') }] });

    expect(detectEpicParent(inward, 'ACS')).toEqual({
      key: 'INIT-3', summary: 'INIT-3 summary', status: 'Open', project: 'INIT', source: 'issueLink', linkType: 'Hierarchy',
    });
    expect(detectEpicParent(outward, 'ACS')).toMatchObject({ key: 'INIT-4', linkType: 'Roll-up' });
  });

  it('ignores same-project parents and unrelated links', () => {
    const issue = epic('ACS-1', {
      parent: linked('ACS-2'),
      issuelinks: [
        { type: linkType('Hierarchy', 'is child of', 'is parent of'), inwardIssue: linked('ACS-3') },
        { type: linkType('Blocks', 'is blocked by', 'blocks'), inwardIssue: linked('OPS-1') },
      ],
    });
    expect(detectEpicParent(issue, 'ACS')).toBeUndefined();
  });
});

describe('groupEpicsByParent', () => {
  it('groups by parent key and puts unlinked epics last', () => {
    const parentB = { key: 'INIT-2', summary: 'B', project: 'INIT', source: 'parent' as const };
    const parentA = { key: 'INIT-1', summary: 'A', project: 'INIT', source: 'parent' as const };
    const node = (key: string) => ({ key, summary: key, status: 'Open' });

    const groups = groupEpicsByParent([
      { epic: node('ACS-1'), parent: parentB },
      { epic: node('ACS-2') },
      { epic: node('ACS-3'), parent: parentA },
      { epic: node('ACS-4'), parent: parentB },
    ]);

    expect(groups).toEqual([
      { parent: parentA, epics: [node('ACS-3')] },
      { parent: parentB, epics: [node('ACS-1'), node('ACS-4')] },
      { parent: null, groupName: 'Unlinked', epics: [node('ACS-2')] },
    ]);
  });

  it('omits the unlinked group when every epic has a parent', () => {
    expect(groupEpicsByParent([])).toEqual([]);
  });
});

describe('childrenByEpic', () => {
  it('buckets children by their Epic Link value', () => {
    const child = (key: string, epicKey?: string) => ({ key, fields: { summary: key, status: { name: 'Done' }, customfield_10101: epicKey } });
    const byEpic = childrenByEpic([child('ACS-5', 'ACS-1'), child('ACS-6', 'ACS-1'), child('ACS-7', 'ACS-2'), child('ACS-8')], 'customfield_10101');

    expect(byEpic.get('ACS-1')?.map((issue) => issue.key)).toEqual(['ACS-5', 'ACS-6']);
    expect(byEpic.get('ACS-2')?.map((issue) => issue.key)).toEqual(['ACS-7']);
    expect(byEpic.size).toBe(2);
  });
});

describe('cross-project dependencies', () => {
  const blocks = linkType('Blocks', 'is blocked by', 'blocks');
  const relates = linkType('Relates', 'relates to', 'relates to');
  const issue = {
    key: 'ACS-1',
    fields: {
      issuelinks: [
        { type: blocks, outwardIssue: linked('OPS-1', 'Firewall', 'Done') },
        { type: blocks, inwardIssue: linked('NET-2', 'Switch', 'In Progress') },
        { type: relates, outwardIssue: linked('ACS-9') },
        { type: relates, inwardIssue: linked('OPS-3') },
      ],
    },
  };

  it('extracts links to other projects with direction and relationship', () => {
    expect(extractCrossProjectLinks(issue, 'ACS')).toEqual([
      { source: 'ACS-1', target: 'OPS-1', targetProject: 'OPS', targetSummary: 'Firewall', targetStatus: 'Done', linkType: 'Blocks', direction: 'outward', relationship: 'blocks' },
      { source: 'ACS-1', target: 'NET-2', targetProject: 'NET', targetSummary: 'Switch', targetStatus: 'In Progress', linkType: 'Blocks', direction: 'inward', relationship: 'is blocked by' },
      { source: 'ACS-1', target: 'OPS-3', targetProject: 'OPS', targetSummary: 'OPS-3 summary', targetStatus: 'Open', linkType: 'Relates', direction: 'inward', relationship: 'relates to' },
    ]);
  });

  it('groups by target project, sorted, then by link type', () => {
    const grouped = groupDependencies(extractCrossProjectLinks(issue, 'ACS'));

    expect(Object.keys(grouped)).toEqual(['NET', 'OPS']);
    expect(grouped.OPS.totalLinks).toBe(2);
    expect(Object.keys(grouped.OPS.byLinkType)).toEqual(['Blocks', 'Relates']);
    expect(grouped.NET.byLinkType.Blocks).toEqual([
      { source: 'ACS-1', target: 'NET-2', targetSummary: 'Switch', targetStatus: 'In Progress', direction: 'inward', relationship: 'is blocked by' },
    ]);
  });
});
