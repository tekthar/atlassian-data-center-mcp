import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { IssueService, SearchService } from '../../jira-client/index.js';
import { registerIssueManagementTools } from '../../tools/issue-management.js';

jest.mock('../../jira-client/index.js', () => ({
  IssueService: {
    createIssues: jest.fn(),
    assign: jest.fn(),
    getIssue1: jest.fn(),
    deleteIssue: jest.fn(),
    getIssueWatchers: jest.fn(),
    addWatcher1: jest.fn(),
    removeWatcher1: jest.fn(),
  },
  SearchService: { searchUsingSearchRequest: jest.fn() },
}));

const mocked = {
  search: SearchService.searchUsingSearchRequest as jest.Mock,
  createIssues: IssueService.createIssues as jest.Mock,
  assign: IssueService.assign as jest.Mock,
  getIssue: IssueService.getIssue1 as jest.Mock,
  deleteIssue: IssueService.deleteIssue as jest.Mock,
  getWatchers: IssueService.getIssueWatchers as jest.Mock,
  addWatcher: IssueService.addWatcher1 as jest.Mock,
  removeWatcher: IssueService.removeWatcher1 as jest.Mock,
};

const jdoe = {
  self: 'https://jira.example.com/rest/api/2/user?username=jdoe',
  name: 'jdoe',
  key: 'JIRAUSER10100',
  displayName: 'Jane Doe',
  emailAddress: 'jane.doe@example.com',
  active: true,
  timeZone: 'Asia/Riyadh',
  avatarUrls: { '48x48': 'https://jira.example.com/avatar' },
};

const shapedJdoe = {
  name: 'jdoe',
  key: 'JIRAUSER10100',
  displayName: 'Jane Doe',
  emailAddress: 'jane.doe@example.com',
  active: true,
  timeZone: 'Asia/Riyadh',
};

const apiError = (status: number, statusText: string, body: unknown = {}) =>
  Object.assign(new Error(statusText), { status, statusText, body });

function setup() {
  const recorder = createRecordingRegistrar();
  registerIssueManagementTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('jira issue management tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every tool', () => {
    expect(setup().registrar.registeredTools()).toEqual([
      'jira_getProjectIssues',
      'jira_batchCreateIssues',
      'jira_assignIssue',
      'jira_deleteIssue',
      'jira_getIssueWatchers',
      'jira_addWatcher',
      'jira_removeWatcher',
    ]);
  });

  describe('jira_getProjectIssues', () => {
    const searchResult = {
      expand: 'schema,names',
      startAt: 0,
      maxResults: 25,
      total: 1,
      issues: [{
        id: '10001',
        key: 'ACS-1',
        self: 'https://jira.example.com/rest/api/2/issue/10001',
        expand: 'operations,editmeta',
        fields: {
          summary: 'Login fails',
          status: { name: 'Open', self: 'x', iconUrl: 'y' },
          issuetype: { name: 'Bug', iconUrl: 'z' },
          priority: { name: 'High' },
          assignee: jdoe,
          reporter: null,
          created: '2026-01-01T10:00:00.000+0300',
          updated: '2026-01-02T10:00:00.000+0300',
        },
      }],
    };

    it('searches the project with paging defaults and shapes the issues', async () => {
      mocked.search.mockResolvedValue(searchResult);

      const result = await setup().callJson('jira_getProjectIssues', { projectKey: 'ACS' });

      expect(mocked.search).toHaveBeenCalledWith({
        jql: 'project = "ACS" ORDER BY created DESC, key DESC',
        startAt: 0,
        maxResults: 25,
        fields: ['summary', 'status', 'issuetype', 'priority', 'assignee', 'reporter', 'created', 'updated'],
      });
      expect(result).toEqual({
        success: true,
        data: {
          jql: 'project = "ACS" ORDER BY created DESC, key DESC',
          total: 1,
          startAt: 0,
          maxResults: 25,
          issues: [{
            key: 'ACS-1',
            summary: 'Login fails',
            status: 'Open',
            issueType: 'Bug',
            priority: 'High',
            assignee: { name: 'jdoe', displayName: 'Jane Doe' },
            reporter: null,
            created: '2026-01-01T10:00:00.000+0300',
            updated: '2026-01-02T10:00:00.000+0300',
          }],
        },
      });
    });

    it('passes explicit paging through', async () => {
      mocked.search.mockResolvedValue({ ...searchResult, issues: [] });

      await setup().callJson('jira_getProjectIssues', { projectKey: 'ACS', startAt: 50, maxResults: 10 });

      expect(mocked.search).toHaveBeenCalledWith(expect.objectContaining({ startAt: 50, maxResults: 10 }));
    });

    it('reports an API error', async () => {
      mocked.search.mockRejectedValue(apiError(400, 'Bad Request', { errorMessages: ["The value 'NOPE' does not exist for the field 'project'."] }));

      const result = await setup().callJson('jira_getProjectIssues', { projectKey: 'NOPE' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Error getting project issues: 400 Bad Request');
      expect(result.details.errorMessages[0]).toContain('does not exist');
    });

    it('rejects a project key that could alter the JQL', async () => {
      await expect(setup().call('jira_getProjectIssues', { projectKey: 'ACS" OR project = "HR' })).rejects.toThrow();
      expect(mocked.search).not.toHaveBeenCalled();
    });

    it('rejects out-of-range paging', async () => {
      await expect(setup().call('jira_getProjectIssues', { projectKey: 'ACS', maxResults: 0 })).rejects.toThrow();
      await expect(setup().call('jira_getProjectIssues', { projectKey: 'ACS', startAt: -1 })).rejects.toThrow();
    });
  });

  describe('jira_batchCreateIssues', () => {
    const issues = [
      {
        projectKey: 'ACS',
        summary: 'First',
        issueType: 'Task',
        description: 'h1. Wiki',
        assignee: 'jdoe',
        components: ['Backend'],
        customFields: { labels: ['ui'], priority: { name: 'High' } },
      },
      { projectKey: 'ACS', summary: 'Second', issueType: '10003', parentKey: 'ACS-1' },
      { projectKey: 'ACS', summary: 'Third', issueType: 'Bug' },
    ];

    it('builds one fields payload per issue', async () => {
      mocked.createIssues.mockResolvedValue({ issues: [], errors: [] });

      await setup().callJson('jira_batchCreateIssues', { issues });

      expect(mocked.createIssues).toHaveBeenCalledWith({
        issueUpdates: [
          {
            fields: {
              project: { key: 'ACS' },
              summary: 'First',
              issuetype: { name: 'Task' },
              description: 'h1. Wiki',
              assignee: { name: 'jdoe' },
              components: [{ name: 'Backend' }],
              labels: ['ui'],
              priority: { name: 'High' },
            },
          },
          { fields: { project: { key: 'ACS' }, summary: 'Second', issuetype: { id: '10003' }, parent: { key: 'ACS-1' } } },
          { fields: { project: { key: 'ACS' }, summary: 'Third', issuetype: { name: 'Bug' } } },
        ],
      });
    });

    it('pairs created issues with their inputs and reports per-issue errors', async () => {
      mocked.createIssues.mockResolvedValue({
        issues: [
          { id: '10010', key: 'ACS-10', self: 'https://jira.example.com/rest/api/2/issue/10010' },
          { id: '10011', key: 'ACS-11', self: 'https://jira.example.com/rest/api/2/issue/10011' },
        ],
        errors: [{ status: 400, failedElementNumber: 1, elementErrors: { errorMessages: [], errors: { parent: 'Parent not found' } } }],
      });

      const result = await setup().callJson('jira_batchCreateIssues', { issues });

      expect(result).toEqual({
        success: true,
        data: {
          created: [
            { index: 0, key: 'ACS-10', id: '10010', summary: 'First' },
            { index: 2, key: 'ACS-11', id: '10011', summary: 'Third' },
          ],
          failed: [{ index: 1, summary: 'Second', status: 400, errorMessages: [], errors: { parent: 'Parent not found' } }],
        },
      });
    });

    it('fails with the per-issue errors when Jira rejects every issue', async () => {
      mocked.createIssues.mockRejectedValue(apiError(400, 'Bad Request', {
        issues: [],
        errors: [{ status: 400, failedElementNumber: 0, elementErrors: { errors: { summary: 'Summary is too long' } } }],
      }));

      const result = await setup().callJson('jira_batchCreateIssues', { issues: [issues[2]] });

      expect(result).toEqual({
        success: false,
        error: 'None of the 1 issues were created.',
        details: { created: [], failed: [{ index: 0, summary: 'Third', status: 400, errors: { summary: 'Summary is too long' } }] },
      });
    });

    it('reports other API errors', async () => {
      mocked.createIssues.mockRejectedValue(apiError(403, 'Forbidden'));

      const result = await setup().callJson('jira_batchCreateIssues', { issues: [issues[2]] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Error creating issues: 403 Forbidden');
    });

    it('rejects an empty batch, an oversized batch and an issue without a summary', async () => {
      const tooMany = Array.from({ length: 51 }, () => issues[2]);

      await expect(setup().call('jira_batchCreateIssues', { issues: [] })).rejects.toThrow();
      await expect(setup().call('jira_batchCreateIssues', { issues: tooMany })).rejects.toThrow();
      await expect(setup().call('jira_batchCreateIssues', { issues: [{ projectKey: 'ACS', issueType: 'Task' }] })).rejects.toThrow();
      expect(mocked.createIssues).not.toHaveBeenCalled();
    });
  });

  describe('jira_assignIssue', () => {
    it('assigns by username and returns the resulting assignee', async () => {
      mocked.assign.mockResolvedValue(undefined);
      mocked.getIssue.mockResolvedValue({ key: 'ACS-1', fields: { assignee: jdoe } });

      const result = await setup().callJson('jira_assignIssue', { issueKey: 'ACS-1', assignee: 'jdoe' });

      expect(mocked.assign).toHaveBeenCalledWith('ACS-1', { name: 'jdoe' });
      expect(mocked.getIssue).toHaveBeenCalledWith('ACS-1', undefined, 'assignee');
      expect(result).toEqual({ success: true, data: { issueKey: 'ACS-1', assignee: shapedJdoe } });
    });

    it('unassigns with an explicit null name', async () => {
      mocked.assign.mockResolvedValue(undefined);
      mocked.getIssue.mockResolvedValue({ key: 'ACS-1', fields: { assignee: null } });

      const result = await setup().callJson('jira_assignIssue', { issueKey: 'ACS-1', assignee: null });

      expect(mocked.assign).toHaveBeenCalledWith('ACS-1', { name: null });
      expect(result).toEqual({ success: true, data: { issueKey: 'ACS-1', assignee: null } });
    });

    it('reports an API error', async () => {
      mocked.assign.mockRejectedValue(apiError(404, 'Not Found', { errorMessages: ['User does not exist'] }));

      const result = await setup().callJson('jira_assignIssue', { issueKey: 'ACS-1', assignee: 'ghost' });

      expect(result.error).toBe('Error assigning issue: 404 Not Found');
      expect(mocked.getIssue).not.toHaveBeenCalled();
    });

    it('requires an explicit assignee or null', async () => {
      await expect(setup().call('jira_assignIssue', { issueKey: 'ACS-1' })).rejects.toThrow();
      await expect(setup().call('jira_assignIssue', { issueKey: 'ACS-1', assignee: '' })).rejects.toThrow();
      expect(mocked.assign).not.toHaveBeenCalled();
    });
  });

  describe('jira_deleteIssue', () => {
    it.each([true, false])('passes deleteSubtasks=%s to Jira', async (deleteSubtasks) => {
      mocked.deleteIssue.mockResolvedValue(undefined);

      const result = await setup().callJson('jira_deleteIssue', { issueKey: 'ACS-1', deleteSubtasks });

      expect(mocked.deleteIssue).toHaveBeenCalledWith('ACS-1', String(deleteSubtasks));
      expect(result).toEqual({ success: true, data: { issueKey: 'ACS-1', deleted: true, deleteSubtasks } });
    });

    it('reports a refusal when the issue has sub-tasks', async () => {
      mocked.deleteIssue.mockRejectedValue(apiError(400, 'Bad Request', { errorMessages: ['The issue has subtasks.'] }));

      const result = await setup().callJson('jira_deleteIssue', { issueKey: 'ACS-1', deleteSubtasks: false });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Error deleting issue: 400 Bad Request');
      expect(result.details).toEqual({ errorMessages: ['The issue has subtasks.'] });
    });

    it('requires deleteSubtasks to be given explicitly', async () => {
      await expect(setup().call('jira_deleteIssue', { issueKey: 'ACS-1' })).rejects.toThrow();
      await expect(setup().call('jira_deleteIssue', { issueKey: 'ACS-1', deleteSubtasks: 'true' })).rejects.toThrow();
      expect(mocked.deleteIssue).not.toHaveBeenCalled();
    });
  });

  describe('jira_getIssueWatchers', () => {
    it('returns the count and shaped watchers', async () => {
      mocked.getWatchers.mockResolvedValue({
        self: 'https://jira.example.com/rest/api/2/issue/ACS-1/watchers',
        isWatching: false,
        watchCount: 1,
        watchers: [jdoe],
      });

      const result = await setup().callJson('jira_getIssueWatchers', { issueKey: 'ACS-1' });

      expect(mocked.getWatchers).toHaveBeenCalledWith('ACS-1');
      expect(result).toEqual({ success: true, data: { issueKey: 'ACS-1', watchCount: 1, isWatching: false, watchers: [shapedJdoe] } });
    });

    it('reports an API error', async () => {
      mocked.getWatchers.mockRejectedValue(apiError(404, 'Not Found'));

      const result = await setup().callJson('jira_getIssueWatchers', { issueKey: 'ACS-404' });

      expect(result.error).toBe('Error getting issue watchers: 404 Not Found');
    });

    it('requires an issue key', async () => {
      await expect(setup().call('jira_getIssueWatchers', {})).rejects.toThrow();
    });
  });

  describe('jira_addWatcher', () => {
    it('adds the user through both the body and the userName parameter', async () => {
      mocked.addWatcher.mockResolvedValue(undefined);

      const result = await setup().callJson('jira_addWatcher', { issueKey: 'ACS-1', username: 'jdoe' });

      expect(mocked.addWatcher).toHaveBeenCalledWith('ACS-1', 'jdoe', 'jdoe');
      expect(result).toEqual({ success: true, data: { issueKey: 'ACS-1', addedWatcher: 'jdoe' } });
    });

    it('reports an API error', async () => {
      mocked.addWatcher.mockRejectedValue(apiError(401, 'Unauthorized'));

      const result = await setup().callJson('jira_addWatcher', { issueKey: 'ACS-1', username: 'jdoe' });

      expect(result.error).toBe('Error adding watcher: 401 Unauthorized');
    });

    it('requires a username', async () => {
      await expect(setup().call('jira_addWatcher', { issueKey: 'ACS-1' })).rejects.toThrow();
      await expect(setup().call('jira_addWatcher', { issueKey: 'ACS-1', username: '' })).rejects.toThrow();
      expect(mocked.addWatcher).not.toHaveBeenCalled();
    });
  });

  describe('jira_removeWatcher', () => {
    it('removes the user under both query parameter spellings', async () => {
      mocked.removeWatcher.mockResolvedValue(undefined);

      const result = await setup().callJson('jira_removeWatcher', { issueKey: 'ACS-1', username: 'jdoe' });

      expect(mocked.removeWatcher).toHaveBeenCalledWith('ACS-1', 'jdoe', 'jdoe');
      expect(result).toEqual({ success: true, data: { issueKey: 'ACS-1', removedWatcher: 'jdoe' } });
    });

    it('reports an API error', async () => {
      mocked.removeWatcher.mockRejectedValue(apiError(404, 'Not Found'));

      const result = await setup().callJson('jira_removeWatcher', { issueKey: 'ACS-1', username: 'jdoe' });

      expect(result.error).toBe('Error removing watcher: 404 Not Found');
    });

    it('requires a username', async () => {
      await expect(setup().call('jira_removeWatcher', { issueKey: 'ACS-1' })).rejects.toThrow();
      expect(mocked.removeWatcher).not.toHaveBeenCalled();
    });
  });
});
