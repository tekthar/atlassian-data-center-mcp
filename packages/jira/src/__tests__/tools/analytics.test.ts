import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { FieldService, IssueService, SearchService, StatusService } from '../../jira-client/index.js';
import { request } from '../../jira-client/core/request.js';
import { registerAnalyticsTools } from '../../tools/analytics.js';

jest.mock('../../jira-client/index.js', () => ({
  OpenAPI: { BASE: 'https://jira.example.com/rest' },
  FieldService: { getFields: jest.fn() },
  IssueService: { getIssue1: jest.fn() },
  SearchService: { searchUsingSearchRequest: jest.fn() },
  StatusService: { getStatuses: jest.fn() },
}));
jest.mock('../../jira-client/core/request.js', () => ({ request: jest.fn() }));

const mocked = {
  getFields: FieldService.getFields as jest.Mock,
  getIssue: IssueService.getIssue1 as jest.Mock,
  search: SearchService.searchUsingSearchRequest as jest.Mock,
  getStatuses: StatusService.getStatuses as jest.Mock,
  request: request as jest.Mock,
};

const NOW = Date.parse('2024-01-10T00:00:00.000Z');

const apiError = (status: number, statusText: string) => Object.assign(new Error(statusText), { status, statusText, body: {} });

const statusItem = (from: [string, string], to: [string, string]) => ({ field: 'status', from: from[0], fromString: from[1], to: to[0], toString: to[1] });

const resolvedIssue = {
  id: '10001',
  key: 'ACS-1',
  fields: {
    created: '2024-01-01T09:00:00.000+0000',
    updated: '2024-01-03T12:00:00.000+0000',
    duedate: '2024-01-03',
    resolutiondate: '2024-01-03T12:00:00.000+0000',
    status: { id: '6', name: 'Closed', statusCategory: { key: 'done' } },
  },
  changelog: {
    histories: [
      { created: '2024-01-02T09:00:00.000+0000', author: { displayName: 'Jane Doe' }, items: [statusItem(['1', 'Open'], ['3', 'Doing'])] },
      { created: '2024-01-03T12:00:00.000+0000', author: { displayName: 'Jane Doe' }, items: [statusItem(['3', 'Doing'], ['6', 'Closed'])] },
    ],
  },
};

const page = (issues: unknown[], total = issues.length) => ({ startAt: 0, maxResults: 100, total, issues });

const issueRef = (key: string, summary: string, status = 'Open') => ({ id: '1', key, fields: { summary, status: { name: status }, issuetype: { name: 'Story' } } });

function setup() {
  const recorder = createRecordingRegistrar();
  registerAnalyticsTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => jest.restoreAllMocks());

it('registers every analytics tool', () => {
  expect(setup().registrar.registeredTools()).toEqual([
    'jira_getIssueDates',
    'jira_getIssueSla',
    'jira_getProjectEpicHierarchy',
    'jira_getCrossProjectDependencies',
    'jira_getIssuesDevelopmentInfo',
  ]);
});

describe('jira_getIssueDates', () => {
  it('returns dates, the status timeline and time per status', async () => {
    mocked.getIssue.mockResolvedValue(resolvedIssue);

    const { success, data } = await setup().callJson('jira_getIssueDates', { issueKey: 'ACS-1' });

    expect(success).toBe(true);
    expect(mocked.getIssue).toHaveBeenCalledWith('ACS-1', 'changelog', 'status,created,updated,duedate,resolutiondate');
    expect(data).toMatchObject({
      issueKey: 'ACS-1',
      created: '2024-01-01T09:00:00.000+0000',
      dueDate: '2024-01-03',
      resolutionDate: '2024-01-03T12:00:00.000+0000',
      currentStatus: 'Closed',
    });
    expect(data.statusChanges.map((change: { status: string }) => change.status)).toEqual(['Open', 'Doing', 'Closed']);
    expect(data.statusChanges[2]).toMatchObject({ exitedAt: null, durationMinutes: 9360, ongoing: true });
    expect(data.statusSummary[0]).toEqual({ status: 'Closed', totalMinutes: 9360, totalFormatted: '6d 12h 0m', visitCount: 1 });
  });

  it('skips the changelog when no history is requested', async () => {
    mocked.getIssue.mockResolvedValue({ key: 'ACS-1', fields: resolvedIssue.fields });

    const { data } = await setup().callJson('jira_getIssueDates', { issueKey: 'ACS-1', includeStatusChanges: false, includeStatusSummary: false });

    expect(mocked.getIssue).toHaveBeenCalledWith('ACS-1', undefined, 'status,created,updated,duedate,resolutiondate');
    expect(data).not.toHaveProperty('statusChanges');
    expect(data).not.toHaveProperty('statusSummary');
  });

  it('reports API errors', async () => {
    mocked.getIssue.mockRejectedValue(apiError(404, 'Not Found'));

    const result = await setup().callJson('jira_getIssueDates', { issueKey: 'ACS-404' });

    expect(result).toMatchObject({ success: false, error: 'Error getting issue dates: 404 Not Found' });
  });
});

describe('jira_getIssueSla', () => {
  it('calculates the default metrics and stops time in status at resolution', async () => {
    mocked.getIssue.mockResolvedValue(resolvedIssue);

    const { data } = await setup().callJson('jira_getIssueSla', { issueKey: 'ACS-1' });

    expect(data.metricsCalculated).toEqual(['cycle_time', 'time_in_status']);
    expect(data.workingHoursApplied).toBe(false);
    expect(data.metrics.cycle_time).toEqual({ calculated: true, valueMinutes: 3060, formatted: '2d 3h 0m' });
    expect(data.metrics.time_in_status.totalMinutes).toBe(3060);
    expect(data.metrics.time_in_status.statuses.find((entry: { status: string }) => entry.status === 'Closed')).toMatchObject({ valueMinutes: 0, visitCount: 1 });
    expect(mocked.getStatuses).not.toHaveBeenCalled();
    expect(data).not.toHaveProperty('rawDates');
  });

  it('uses status categories for resolution time and returns raw dates on request', async () => {
    mocked.getIssue.mockResolvedValue(resolvedIssue);
    mocked.getStatuses.mockResolvedValue([{ id: '3', name: 'Doing', statusCategory: { key: 'indeterminate' } }]);

    const { data } = await setup().callJson('jira_getIssueSla', { issueKey: 'ACS-1', metrics: ['resolution_time', 'lead_time'], includeRawDates: true });

    expect(data.metrics).toEqual({
      resolution_time: { calculated: true, valueMinutes: 1620, formatted: '1d 3h 0m' },
      lead_time: { valueMinutes: 3060, formatted: '2d 3h 0m', isResolved: true },
    });
    expect(data.rawDates.statusChanges[1]).toEqual({
      status: 'Doing', enteredAt: '2024-01-02T09:00:00.000+0000', exitedAt: '2024-01-03T12:00:00.000+0000', transitionedBy: 'Jane Doe',
    });
  });

  it('still answers when the status list cannot be read', async () => {
    mocked.getIssue.mockResolvedValue(resolvedIssue);
    mocked.getStatuses.mockRejectedValue(apiError(403, 'Forbidden'));

    const { data } = await setup().callJson('jira_getIssueSla', { issueKey: 'ACS-1', metrics: ['resolution_time'] });

    expect(data.metrics.resolution_time).toEqual({ calculated: false, reason: "No 'In Progress' status found" });
  });

  it('counts working hours in the requested zone', async () => {
    mocked.getIssue.mockResolvedValue(resolvedIssue);

    const { data } = await setup().callJson('jira_getIssueSla', { issueKey: 'ACS-1', workingHoursOnly: true });

    expect(data.workingHoursConfig).toEqual({ start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], timeZone: 'UTC' });
    expect(data.metrics.cycle_time.valueMinutes).toBe(1140);
  });

  it('rejects unusable working hours before calling Jira', async () => {
    const result = await setup().callJson('jira_getIssueSla', { issueKey: 'ACS-1', workingHoursOnly: true, timeZone: 'Mars/Base' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown time zone');
    expect(mocked.getIssue).not.toHaveBeenCalled();
  });

  it('validates the clock format', async () => {
    await expect(setup().call('jira_getIssueSla', { issueKey: 'ACS-1', workingHoursStart: '9am' })).rejects.toThrow();
  });
});

describe('jira_getProjectEpicHierarchy', () => {
  const fields = [
    { id: 'summary', name: 'Summary', schema: { type: 'string', system: 'summary' } },
    { id: 'customfield_10101', name: 'Epic Link', schema: { type: 'any', custom: 'com.pyxis.greenhopper.jira:gh-epic-link', customId: 10101 } },
    { id: 'customfield_10500', name: 'Parent Link', schema: { type: 'any', custom: 'com.atlassian.jpo:jpo-custom-field-parent', customId: 10500 } },
  ];
  const epics = [
    { key: 'ACS-1', fields: { summary: 'Login', status: { name: 'In Progress' }, issuetype: { name: 'Epic' }, issuelinks: [], customfield_10500: { data: { issueKey: 'INIT-1', summary: 'Portal' } } } },
    { key: 'ACS-2', fields: { summary: 'Reports', status: { name: 'Open' }, issuetype: { name: 'Epic' }, issuelinks: [] } },
  ];
  const children = [
    { key: 'ACS-10', fields: { summary: 'Login form', status: { name: 'Done' }, issuetype: { name: 'Story' }, customfield_10101: 'ACS-1' } },
  ];

  const searchByJql = () => mocked.search.mockImplementation(async ({ jql }: { jql: string }) => (jql.startsWith('cf[') ? page(children) : page(epics)));

  it('groups epics by parent and lists their children', async () => {
    mocked.getFields.mockResolvedValue(fields);
    searchByJql();

    const { data } = await setup().callJson('jira_getProjectEpicHierarchy', { projectKey: 'acs' });

    expect(mocked.search).toHaveBeenNthCalledWith(1, {
      jql: 'project = "ACS" AND issuetype = Epic ORDER BY updated DESC',
      fields: ['summary', 'status', 'issuetype', 'issuelinks', 'parent', 'customfield_10500'],
      startAt: 0,
      maxResults: 100,
    });
    expect(mocked.search).toHaveBeenNthCalledWith(2, {
      jql: 'cf[10101] in ("ACS-1", "ACS-2") ORDER BY key ASC',
      fields: ['summary', 'status', 'issuetype', 'customfield_10101'],
      startAt: 0,
      maxResults: 100,
    });
    expect(data).toEqual({
      projectKey: 'ACS',
      totalEpics: 2,
      epicsInProject: 2,
      groups: [
        {
          parent: { key: 'INIT-1', summary: 'Portal', project: 'INIT', source: 'parentLink' },
          epics: [{ key: 'ACS-1', summary: 'Login', status: 'In Progress', issueType: 'Epic', childCount: 1, children: [{ key: 'ACS-10', summary: 'Login form', status: 'Done', issueType: 'Story' }] }],
        },
        { parent: null, groupName: 'Unlinked', epics: [{ key: 'ACS-2', summary: 'Reports', status: 'Open', issueType: 'Epic', childCount: 0, children: [] }] },
      ],
      children: { included: true, total: 1, truncated: false },
    });
  });

  it('skips children when asked to', async () => {
    mocked.getFields.mockResolvedValue(fields);
    searchByJql();

    const { data } = await setup().callJson('jira_getProjectEpicHierarchy', { projectKey: 'ACS', includeChildren: false });

    expect(mocked.search).toHaveBeenCalledTimes(1);
    expect(data.children).toEqual({ included: false });
    expect(data.groups[1].epics[0]).not.toHaveProperty('children');
  });

  it('explains when there is no Epic Link field', async () => {
    mocked.getFields.mockResolvedValue(fields.slice(0, 1));
    searchByJql();

    const { data } = await setup().callJson('jira_getProjectEpicHierarchy', { projectKey: 'ACS' });

    expect(mocked.search.mock.calls[0][0].fields).toEqual(['summary', 'status', 'issuetype', 'issuelinks', 'parent']);
    expect(data.children.included).toBe(false);
    expect(data.children.reason).toContain('Epic Link');
  });

  it('flags a child scan cut short by maxChildren', async () => {
    mocked.getFields.mockResolvedValue(fields);
    mocked.search.mockImplementation(async ({ jql }: { jql: string }) => (jql.startsWith('cf[') ? page(children, 7) : page(epics)));

    const { data } = await setup().callJson('jira_getProjectEpicHierarchy', { projectKey: 'ACS', maxChildren: 1 });

    expect(mocked.search.mock.calls[1][0].maxResults).toBe(1);
    expect(data.children).toEqual({ included: true, total: 1, truncated: true });
  });

  it('rejects project keys that could break the JQL', async () => {
    await expect(setup().call('jira_getProjectEpicHierarchy', { projectKey: 'ACS" OR project = "OPS' })).rejects.toThrow();
  });
});

describe('jira_getCrossProjectDependencies', () => {
  const blocks = { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' };

  it('pages through the project and groups links by target project', async () => {
    const issues = Array.from({ length: 100 }, (_, index) => ({ key: `ACS-${index + 1}`, fields: { issuelinks: [] } }));
    const linkedIssue = { key: 'ACS-200', fields: { issuelinks: [{ type: blocks, inwardIssue: issueRef('OPS-7', 'Open firewall') }, { type: blocks, outwardIssue: issueRef('ACS-3', 'Local') }] } };
    mocked.search.mockResolvedValueOnce(page(issues, 101)).mockResolvedValueOnce(page([linkedIssue], 101));

    const { data } = await setup().callJson('jira_getCrossProjectDependencies', { projectKey: 'ACS', maxIssues: 150 });

    expect(mocked.search).toHaveBeenNthCalledWith(1, { jql: 'project = "ACS" ORDER BY updated DESC', fields: ['summary', 'status', 'issuetype', 'issuelinks'], startAt: 0, maxResults: 100 });
    expect(mocked.search).toHaveBeenNthCalledWith(2, expect.objectContaining({ startAt: 100, maxResults: 50 }));
    expect(data).toEqual({
      projectKey: 'ACS',
      totalIssuesScanned: 101,
      issuesInProject: 101,
      totalCrossProjectLinks: 1,
      byProject: {
        OPS: {
          totalLinks: 1,
          byLinkType: {
            Blocks: [{ source: 'ACS-200', target: 'OPS-7', targetSummary: 'Open firewall', targetStatus: 'Open', direction: 'inward', relationship: 'is blocked by' }],
          },
        },
      },
    });
  });

  it('caps the scan at 500 issues', async () => {
    await expect(setup().call('jira_getCrossProjectDependencies', { projectKey: 'ACS', maxIssues: 501 })).rejects.toThrow();
  });
});

describe('jira_getIssuesDevelopmentInfo', () => {
  const summary = {
    summary: {
      pullrequest: { byInstanceType: { stash: { count: 1, name: 'Bitbucket Server' } } },
      branch: { byInstanceType: {} },
      repository: { byInstanceType: { stash: { count: 1, name: 'Bitbucket Server' } } },
    },
  };
  const detail = {
    detail: [{
      _instance: { name: 'Bitbucket' },
      pullRequests: [{ id: '#5', name: 'ACS-1 fix', status: 'OPEN', url: 'https://bitbucket.example.com/pr/5', source: { branch: 'feature/ACS-1' }, destination: { branch: 'main' }, author: { name: 'Jane Doe' } }],
      repositories: [{ name: 'api', url: 'https://bitbucket.example.com/api', commits: [{ id: 'abc', message: 'ACS-1 fix', author: { name: 'Jane Doe' } }] }],
    }],
  };

  const routeDevStatus = () => mocked.request.mockImplementation(async (_config: unknown, options: { url: string }) =>
    (options.url.endsWith('/summary') ? summary : detail));

  it('discovers where data lives and fetches only those pairs', async () => {
    mocked.getIssue.mockResolvedValue({ id: '10001', key: 'ACS-1' });
    routeDevStatus();

    const { data } = await setup().callJson('jira_getIssuesDevelopmentInfo', { issueKeys: ['ACS-1'] });

    expect(mocked.getIssue).toHaveBeenCalledWith('ACS-1', undefined, 'id');
    expect(mocked.request.mock.calls.map(([, options]) => options)).toEqual([
      { method: 'GET', url: '/dev-status/1.0/issue/summary', query: { issueId: '10001' } },
      { method: 'GET', url: '/dev-status/1.0/issue/detail', query: { issueId: '10001', applicationType: 'stash', dataType: 'pullrequest' } },
      { method: 'GET', url: '/dev-status/1.0/issue/detail', query: { issueId: '10001', applicationType: 'stash', dataType: 'repository' } },
    ]);
    expect(data.totalCount).toBe(1);
    expect(data.issues[0].pullRequests).toHaveLength(1);
    expect(data.issues[0].commits).toEqual([expect.objectContaining({ id: 'abc', repository: 'api' })]);
  });

  it('uses the given application type without discovery', async () => {
    mocked.getIssue.mockResolvedValue({ id: '10001' });
    routeDevStatus();

    await setup().callJson('jira_getIssuesDevelopmentInfo', { issueKeys: ['ACS-1'], applicationType: 'github', dataType: 'branch' });

    expect(mocked.request).toHaveBeenCalledTimes(1);
    expect(mocked.request.mock.calls[0][1].query).toEqual({ issueId: '10001', applicationType: 'github', dataType: 'branch' });
  });

  it('reports each issue failure separately', async () => {
    mocked.getIssue.mockImplementation(async (key: string) => {
      if (key === 'ACS-404') throw apiError(404, 'Not Found');
      return { id: key === 'ACS-1' ? '10001' : '10002' };
    });
    mocked.request.mockImplementation(async (_config: unknown, options: { query: { issueId: string } }) => {
      if (options.query.issueId === '10002') throw apiError(404, 'Not Found');
      return summary;
    });

    const { data } = await setup().callJson('jira_getIssuesDevelopmentInfo', { issueKeys: ['ACS-1', 'ACS-404', 'ACS-2', 'ACS-1'] });

    expect(data).toMatchObject({ totalCount: 3, successCount: 1, errorCount: 2 });
    expect(data.issues.map((issue: { issueKey: string }) => issue.issueKey)).toEqual(['ACS-1', 'ACS-404', 'ACS-2']);
    expect(data.issues[1].error).toBe('Issue ACS-404 does not exist or you cannot see it.');
    expect(data.issues[2].error).toContain('dev-status plugin may not be installed');
  });

  it('keeps going past a failing data type and says so', async () => {
    mocked.getIssue.mockResolvedValue({ id: '10001' });
    mocked.request.mockImplementation(async (_config: unknown, options: { url: string; query: { dataType?: string } }) => {
      if (options.url.endsWith('/summary')) return summary;
      if (options.query.dataType === 'repository') throw apiError(500, 'Internal Server Error');
      return detail;
    });

    const { data } = await setup().callJson('jira_getIssuesDevelopmentInfo', { issueKeys: ['ACS-1'] });

    expect(data.issues[0].warnings).toEqual(['stash/repository: 500 Internal Server Error']);
    expect(data.issues[0].pullRequests).toHaveLength(1);
  });

  it('accepts at most 50 issues', async () => {
    const issueKeys = Array.from({ length: 51 }, (_, index) => `ACS-${index + 1}`);
    await expect(setup().call('jira_getIssuesDevelopmentInfo', { issueKeys })).rejects.toThrow();
  });
});
