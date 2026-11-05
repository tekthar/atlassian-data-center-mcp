import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { EpicService, IssueService } from '../../jira-client/index.js';
import { registerWorklogLinksTools, toJiraDateTime } from '../../tools/worklog-links.js';

jest.mock('../../jira-client/index.js', () => ({
  IssueService: {
    getIssueWorklog: jest.fn(),
    addWorklog: jest.fn(),
    editIssue: jest.fn(),
    createOrUpdateRemoteIssueLink: jest.fn(),
  },
  EpicService: { moveIssuesToEpic: jest.fn() },
}));

const mocked = {
  getWorklog: IssueService.getIssueWorklog as jest.Mock,
  addWorklog: IssueService.addWorklog as jest.Mock,
  editIssue: IssueService.editIssue as jest.Mock,
  createRemoteLink: IssueService.createOrUpdateRemoteIssueLink as jest.Mock,
  moveToEpic: EpicService.moveIssuesToEpic as jest.Mock,
};

const apiError = (status: number, statusText: string, body: unknown = {}) =>
  Object.assign(new Error(statusText), { status, statusText, body });

const rawWorklog = (id: string, timeSpent: string, timeSpentSeconds: number) => ({
  self: `https://jira.example.com/rest/api/2/issue/10001/worklog/${id}`,
  id,
  issueId: '10001',
  author: { name: 'jdoe', key: 'JIRAUSER10100', displayName: 'Jane Doe', avatarUrls: { '48x48': 'https://jira.example.com/a' } },
  updateAuthor: { name: 'jdoe', displayName: 'Jane Doe' },
  comment: 'Reviewed the design',
  started: '2026-11-05T09:00:00.000+0300',
  created: '2026-11-05T10:00:00.000+0300',
  updated: '2026-11-05T10:00:00.000+0300',
  timeSpent,
  timeSpentSeconds,
});

const shapedWorklog = (id: string, timeSpent: string, timeSpentSeconds: number) => ({
  id,
  author: { name: 'jdoe', displayName: 'Jane Doe' },
  started: '2026-11-05T09:00:00.000+0300',
  timeSpent,
  timeSpentSeconds,
  comment: 'Reviewed the design',
  created: '2026-11-05T10:00:00.000+0300',
  updated: '2026-11-05T10:00:00.000+0300',
});

function setup() {
  const recorder = createRecordingRegistrar();
  registerWorklogLinksTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('jira worklog and link tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers all four tools', () => {
    expect(setup().registrar.registeredTools()).toEqual([
      'jira_getWorklog',
      'jira_addWorklog',
      'jira_createRemoteIssueLink',
      'jira_linkToEpic',
    ]);
  });

  describe('jira_getWorklog', () => {
    it('returns shaped worklogs with the total time logged', async () => {
      mocked.getWorklog.mockResolvedValue({
        startAt: 0, maxResults: 2, total: 2,
        worklogs: [rawWorklog('201', '1h 30m', 5400), rawWorklog('202', '2h', 7200)],
      });

      const result = await setup().callJson('jira_getWorklog', { issueKey: 'ACS-1' });

      expect(mocked.getWorklog).toHaveBeenCalledWith('ACS-1');
      expect(result).toEqual({
        success: true,
        data: {
          issueKey: 'ACS-1',
          total: 2,
          totalTimeSpentSeconds: 12600,
          worklogs: [shapedWorklog('201', '1h 30m', 5400), shapedWorklog('202', '2h', 7200)],
        },
      });
    });

    it('handles an issue without worklogs', async () => {
      mocked.getWorklog.mockResolvedValue({});

      const result = await setup().callJson('jira_getWorklog', { issueKey: 'ACS-1' });

      expect(result.data).toEqual({ issueKey: 'ACS-1', total: 0, totalTimeSpentSeconds: 0, worklogs: [] });
    });

    it('reports an API error', async () => {
      mocked.getWorklog.mockRejectedValue(apiError(404, 'Not Found'));

      const result = await setup().call('jira_getWorklog', { issueKey: 'ACS-404' });

      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe('Error fetching worklogs: 404 Not Found');
    });

    it('rejects a blank issue key', async () => {
      await expect(setup().call('jira_getWorklog', { issueKey: '  ' })).rejects.toThrow();
      expect(mocked.getWorklog).not.toHaveBeenCalled();
    });
  });

  describe('jira_addWorklog', () => {
    it('logs work with the duration, comment and normalised start time', async () => {
      mocked.addWorklog.mockResolvedValue(rawWorklog('301', '1h 30m', 5400));

      const result = await setup().callJson('jira_addWorklog', {
        issueKey: 'ACS-1', timeSpent: ' 1h 30m ', started: '2026-11-05T06:00:00Z', comment: 'Reviewed the design',
      });

      expect(mocked.addWorklog).toHaveBeenCalledWith('ACS-1', undefined, undefined, undefined, {
        timeSpent: '1h 30m', started: '2026-11-05T06:00:00.000+0000', comment: 'Reviewed the design',
      });
      expect(mocked.editIssue).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, data: shapedWorklog('301', '1h 30m', 5400) });
    });

    it("infers adjustEstimate 'new' from newEstimate", async () => {
      mocked.addWorklog.mockResolvedValue(rawWorklog('302', '2h', 7200));

      await setup().callJson('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '2h', newEstimate: '1d' });

      expect(mocked.addWorklog).toHaveBeenCalledWith('ACS-1', '1d', 'new', undefined, expect.objectContaining({ timeSpent: '2h' }));
    });

    it("infers adjustEstimate 'manual' from reduceBy and passes an explicit mode through", async () => {
      mocked.addWorklog.mockResolvedValue(rawWorklog('303', '2h', 7200));
      const tools = setup();

      await tools.callJson('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '2h', reduceBy: '30m' });
      await tools.callJson('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '2h', adjustEstimate: 'leave' });

      expect(mocked.addWorklog).toHaveBeenNthCalledWith(1, 'ACS-1', undefined, 'manual', '30m', expect.anything());
      expect(mocked.addWorklog).toHaveBeenNthCalledWith(2, 'ACS-1', undefined, 'leave', undefined, expect.anything());
    });

    it('sets the original estimate before logging work', async () => {
      mocked.editIssue.mockResolvedValue(undefined);
      mocked.addWorklog.mockResolvedValue(rawWorklog('304', '4h', 14400));

      const result = await setup().callJson('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '4h', originalEstimate: '3d' });

      expect(mocked.editIssue).toHaveBeenCalledWith('ACS-1', undefined, { fields: { timetracking: { originalEstimate: '3d' } } });
      expect(mocked.editIssue.mock.invocationCallOrder[0]).toBeLessThan(mocked.addWorklog.mock.invocationCallOrder[0]);
      expect(result.success).toBe(true);
    });

    it('logs no work when the original estimate cannot be set', async () => {
      mocked.editIssue.mockRejectedValue(apiError(400, 'Bad Request', { errors: { timetracking: 'Time tracking is disabled' } }));

      const result = await setup().callJson('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '4h', originalEstimate: '3d' });

      expect(result.error).toBe('Error setting the original estimate, so no work was logged: 400 Bad Request');
      expect(result.details).toEqual({ errors: { timetracking: 'Time tracking is disabled' } });
      expect(mocked.addWorklog).not.toHaveBeenCalled();
    });

    it('reports an API error', async () => {
      mocked.addWorklog.mockRejectedValue(apiError(403, 'Forbidden'));

      const result = await setup().call('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '1h' });

      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe('Error adding worklog: 403 Forbidden');
    });

    it.each([
      [{ newEstimate: '1d', reduceBy: '1h' }, 'not both'],
      [{ adjustEstimate: 'new' }, 'needs newEstimate'],
      [{ adjustEstimate: 'manual' }, 'needs reduceBy'],
      [{ adjustEstimate: 'leave', newEstimate: '1d' }, "newEstimate only applies when adjustEstimate is 'new'"],
      [{ adjustEstimate: 'auto', reduceBy: '1h' }, "reduceBy only applies when adjustEstimate is 'manual'"],
    ])('rejects inconsistent estimate options %o', async (options, message) => {
      const result = await setup().callJson('jira_addWorklog', { issueKey: 'ACS-1', timeSpent: '1h', ...options });

      expect(result.success).toBe(false);
      expect(result.error).toContain(message);
      expect(mocked.addWorklog).not.toHaveBeenCalled();
      expect(mocked.editIssue).not.toHaveBeenCalled();
    });

    it.each([
      { timeSpent: '1.5 hours' },
      { timeSpent: '90' },
      { timeSpent: '1h', started: 'yesterday' },
      { timeSpent: '1h', started: '2026-11-05T09:00:00' },
      { timeSpent: '1h', newEstimate: 'two days' },
      { timeSpent: '1h', adjustEstimate: 'reset' },
    ])('rejects invalid input %o', async (args) => {
      await expect(setup().call('jira_addWorklog', { issueKey: 'ACS-1', ...args })).rejects.toThrow();
      expect(mocked.addWorklog).not.toHaveBeenCalled();
    });
  });

  describe('toJiraDateTime', () => {
    it.each([
      ['2026-11-05T09:00:00.000+0300', '2026-11-05T09:00:00.000+0300'],
      ['2026-11-05T09:00:00+03:00', '2026-11-05T09:00:00.000+0300'],
      ['2026-11-05T09:00Z', '2026-11-05T09:00:00.000+0000'],
      ['2026-11-05T09:00:00.123456-05:30', '2026-11-05T09:00:00.123-0530'],
      ['2026-11-05T09:00:00.5Z', '2026-11-05T09:00:00.500+0000'],
    ])('converts %s to %s', (input, expected) => {
      expect(toJiraDateTime(input)).toBe(expected);
    });
  });

  describe('jira_createRemoteIssueLink', () => {
    it('creates a link with summary, relationship and icon', async () => {
      mocked.createRemoteLink.mockResolvedValue({ id: 10000, self: 'https://jira.example.com/rest/api/2/issue/ACS-1/remotelink/10000' });

      const result = await setup().callJson('jira_createRemoteIssueLink', {
        issueKey: 'ACS-1',
        url: 'https://confluence.example.com/pages/viewpage.action?pageId=42',
        title: 'Design document',
        summary: 'Approved design',
        relationship: 'documentation',
        iconUrl: 'https://confluence.example.com/favicon.ico',
      });

      expect(mocked.createRemoteLink).toHaveBeenCalledWith('ACS-1', {
        object: {
          url: 'https://confluence.example.com/pages/viewpage.action?pageId=42',
          title: 'Design document',
          summary: 'Approved design',
          icon: { url16x16: 'https://confluence.example.com/favicon.ico', title: 'Design document' },
        },
        relationship: 'documentation',
      });
      expect(result).toEqual({
        success: true,
        data: {
          id: 10000,
          issueKey: 'ACS-1',
          url: 'https://confluence.example.com/pages/viewpage.action?pageId=42',
          title: 'Design document',
          relationship: 'documentation',
        },
      });
    });

    it('sends only the URL and title when nothing else is given', async () => {
      mocked.createRemoteLink.mockResolvedValue({ id: 10001 });

      await setup().callJson('jira_createRemoteIssueLink', { issueKey: 'ACS-1', url: 'http://wiki/page', title: 'Wiki' });

      const body = mocked.createRemoteLink.mock.calls[0][1];
      expect(JSON.parse(JSON.stringify(body))).toEqual({ object: { url: 'http://wiki/page', title: 'Wiki' } });
    });

    it('reports an API error', async () => {
      mocked.createRemoteLink.mockRejectedValue(apiError(403, 'Forbidden'));

      const result = await setup().callJson('jira_createRemoteIssueLink', { issueKey: 'ACS-1', url: 'https://example.com', title: 'Example' });

      expect(result).toEqual({ success: false, error: 'Error creating remote issue link: 403 Forbidden', details: {} });
    });

    it.each([
      { url: 'not a url', title: 'Example' },
      { url: 'javascript:alert(1)', title: 'Example' },
      { url: 'https://example.com', title: ' ' },
      { url: 'https://example.com', title: 'Example', iconUrl: 'icon.png' },
    ])('rejects invalid input %o', async (args) => {
      await expect(setup().call('jira_createRemoteIssueLink', { issueKey: 'ACS-1', ...args })).rejects.toThrow();
      expect(mocked.createRemoteLink).not.toHaveBeenCalled();
    });
  });

  describe('jira_linkToEpic', () => {
    it('moves the issues into the epic through the agile API', async () => {
      mocked.moveToEpic.mockResolvedValue(undefined);

      const result = await setup().callJson('jira_linkToEpic', { epicKey: 'ACS-100', issueKeys: ['ACS-1', 'ACS-2'] });

      expect(mocked.moveToEpic).toHaveBeenCalledWith('ACS-100', { issues: ['ACS-1', 'ACS-2'] });
      expect(result).toEqual({ success: true, data: { epicKey: 'ACS-100', linkedIssues: ['ACS-1', 'ACS-2'] } });
    });

    it('refuses to link an epic to itself', async () => {
      const result = await setup().callJson('jira_linkToEpic', { epicKey: 'ACS-100', issueKeys: ['ACS-1', 'acs-100'] });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be linked to itself');
      expect(mocked.moveToEpic).not.toHaveBeenCalled();
    });

    it('reports an API error with its details', async () => {
      const body = { errorMessages: ['Issue ACS-100 is not an epic'] };
      mocked.moveToEpic.mockRejectedValue(apiError(400, 'Bad Request', body));

      const result = await setup().callJson('jira_linkToEpic', { epicKey: 'ACS-100', issueKeys: ['ACS-1'] });

      expect(result).toEqual({ success: false, error: 'Error linking issues to epic: 400 Bad Request', details: body });
    });

    it.each([
      { epicKey: 'ACS-100', issueKeys: [] },
      { epicKey: 'ACS-100', issueKeys: Array.from({ length: 51 }, (_, index) => `ACS-${index + 1}`) },
      { epicKey: '', issueKeys: ['ACS-1'] },
      { epicKey: 'ACS-100', issueKeys: 'ACS-1' },
    ])('rejects invalid input %#', async (args) => {
      await expect(setup().call('jira_linkToEpic', args)).rejects.toThrow();
      expect(mocked.moveToEpic).not.toHaveBeenCalled();
    });
  });
});
