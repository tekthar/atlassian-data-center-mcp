import { createRecordingRegistrar } from '@atlassian-dc-mcp/common';
import { BacklogService, BoardService, SprintService } from '../../jira-client/index.js';
import { registerAgileTools } from '../../tools/agile.js';

jest.mock('../../jira-client/index.js', () => ({
  BoardService: { getAllBoards: jest.fn(), getIssuesForBoard: jest.fn(), getAllSprints: jest.fn() },
  SprintService: {
    getIssuesForSprint1: jest.fn(),
    createSprint: jest.fn(),
    partiallyUpdateSprint: jest.fn(),
    moveIssuesToSprint: jest.fn(),
  },
  BacklogService: { moveIssuesToBacklog: jest.fn() },
}));

const mocked = {
  getBoards: BoardService.getAllBoards as jest.Mock,
  getBoardIssues: BoardService.getIssuesForBoard as jest.Mock,
  getSprints: BoardService.getAllSprints as jest.Mock,
  getSprintIssues: SprintService.getIssuesForSprint1 as jest.Mock,
  createSprint: SprintService.createSprint as jest.Mock,
  updateSprint: SprintService.partiallyUpdateSprint as jest.Mock,
  moveToSprint: SprintService.moveIssuesToSprint as jest.Mock,
  moveToBacklog: BacklogService.moveIssuesToBacklog as jest.Mock,
};

const ISSUE_FIELDS = ['summary,status,assignee,issuetype,priority'];

const apiError = (status: number, statusText: string) =>
  Object.assign(new Error(statusText), { status, statusText, body: { errorMessages: [statusText] } });

const board = {
  id: 84,
  self: 'https://jira.example.com/rest/agile/1.0/board/84',
  name: 'ACS board',
  type: 'scrum',
  location: { projectId: 10400, projectKey: 'ACS', projectName: 'Access Control', avatarURI: '/avatar' },
};

const sprint = {
  id: 37,
  self: 'https://jira.example.com/rest/agile/1.0/sprint/37',
  state: 'active',
  name: 'Sprint 12',
  startDate: '2026-11-01T09:00:00.000+03:00',
  endDate: '2026-11-15T09:00:00.000+03:00',
  activatedDate: '2026-11-01T09:01:00.000+03:00',
  originBoardId: 84,
  goal: 'Ship login',
  synced: false,
  autoStartStop: false,
};

const shapedSprint = {
  id: 37,
  name: 'Sprint 12',
  state: 'active',
  goal: 'Ship login',
  startDate: '2026-11-01T09:00:00.000+03:00',
  endDate: '2026-11-15T09:00:00.000+03:00',
  originBoardId: 84,
};

const issue = {
  id: '10001',
  self: 'https://jira.example.com/rest/agile/1.0/issue/10001',
  key: 'ACS-1',
  fields: {
    summary: 'Login page',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    issuetype: { name: 'Story', subtask: false },
    priority: { name: 'High' },
    assignee: { name: 'jdoe', displayName: 'Jane Doe', avatarUrls: {} },
  },
};

const unassignedIssue = { key: 'ACS-2', fields: { summary: 'Logout', status: { name: 'To Do' }, issuetype: { name: 'Bug' }, assignee: null } };

const issuePage = { expand: 'schema,names', startAt: 0, maxResults: 25, total: 2, issues: [issue, unassignedIssue] };

const shapedIssues = [
  { key: 'ACS-1', summary: 'Login page', status: 'In Progress', type: 'Story', priority: 'High', assignee: { name: 'jdoe', displayName: 'Jane Doe' } },
  { key: 'ACS-2', summary: 'Logout', status: 'To Do', type: 'Bug', assignee: null },
];

function setup() {
  const recorder = createRecordingRegistrar();
  registerAgileTools(recorder.registrar, { instanceType: 'JIRA Data Center edition instance', getPageSize: () => 25 });
  return recorder;
}

describe('jira agile tools', () => {
  beforeEach(() => jest.resetAllMocks());

  it('registers every agile tool', () => {
    expect(setup().registrar.registeredTools()).toEqual([
      'jira_getAgileBoards',
      'jira_getBoardIssues',
      'jira_getSprintsFromBoard',
      'jira_getSprintIssues',
      'jira_createSprint',
      'jira_updateSprint',
      'jira_addIssuesToSprint',
      'jira_moveIssuesToBacklog',
    ]);
  });

  describe('jira_getAgileBoards', () => {
    it('maps the filters and shapes boards with their project', async () => {
      mocked.getBoards.mockResolvedValue({ maxResults: 10, startAt: 5, total: 6, isLast: true, values: [board] });

      const result = await setup().callJson('jira_getAgileBoards', {
        boardName: 'ACS', projectKey: 'ACS', boardType: 'scrum', startAt: 5, maxResults: 10,
      });

      expect(mocked.getBoards).toHaveBeenCalledWith(10, 'ACS', 'ACS', 'scrum', 5);
      expect(result).toEqual({
        success: true,
        data: {
          startAt: 5, maxResults: 10, total: 6, isLast: true,
          boards: [{ id: 84, name: 'ACS board', type: 'scrum', projectKey: 'ACS', projectName: 'Access Control' }],
        },
      });
    });

    it('defaults to the server page size and no filters', async () => {
      mocked.getBoards.mockResolvedValue({ values: [] });

      await setup().callJson('jira_getAgileBoards', {});

      expect(mocked.getBoards).toHaveBeenCalledWith(25, undefined, undefined, undefined, undefined);
    });

    it('explains a 404 as a missing agile API', async () => {
      mocked.getBoards.mockRejectedValue(apiError(404, 'Not Found'));

      const result = await setup().call('jira_getAgileBoards', {});

      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toContain('/rest/agile/1.0) is not available');
    });

    it('reports other API errors with their status', async () => {
      mocked.getBoards.mockRejectedValue(apiError(401, 'Unauthorized'));

      expect((await setup().callJson('jira_getAgileBoards', {})).error).toBe('Error fetching agile boards: 401 Unauthorized');
    });

    it('rejects an unknown board type', async () => {
      await expect(setup().call('jira_getAgileBoards', { boardType: 'simple' })).rejects.toThrow();
      expect(mocked.getBoards).not.toHaveBeenCalled();
    });
  });

  describe('jira_getBoardIssues', () => {
    it('passes the JQL, paging and a narrow field list, and shapes the issues', async () => {
      mocked.getBoardIssues.mockResolvedValue(issuePage);

      const result = await setup().callJson('jira_getBoardIssues', { boardId: 84, jql: 'assignee = currentUser()', startAt: 0 });

      expect(mocked.getBoardIssues).toHaveBeenCalledWith(84, undefined, 'assignee = currentUser()', 25, undefined, ISSUE_FIELDS, 0);
      expect(result).toEqual({ success: true, data: { startAt: 0, maxResults: 25, total: 2, issues: shapedIssues } });
    });

    it('reports an unknown board as a failure', async () => {
      mocked.getBoardIssues.mockRejectedValue(apiError(404, 'Not Found'));

      const result = await setup().callJson('jira_getBoardIssues', { boardId: 999 });

      expect(result).toMatchObject({ success: false, error: 'Error fetching board issues: 404 Not Found' });
    });

    it('requires a positive integer board id', async () => {
      await expect(setup().call('jira_getBoardIssues', { boardId: 0 })).rejects.toThrow();
      await expect(setup().call('jira_getBoardIssues', { boardId: '84' })).rejects.toThrow();
      expect(mocked.getBoardIssues).not.toHaveBeenCalled();
    });
  });

  describe('jira_getSprintsFromBoard', () => {
    it('joins the state filter and shapes sprints', async () => {
      mocked.getSprints.mockResolvedValue({ maxResults: 50, startAt: 0, isLast: false, values: [sprint] });

      const result = await setup().callJson('jira_getSprintsFromBoard', { boardId: 84, state: ['active', 'future'], maxResults: 50 });

      expect(mocked.getSprints).toHaveBeenCalledWith(84, 50, 'active,future', undefined);
      expect(result).toEqual({ success: true, data: { startAt: 0, maxResults: 50, isLast: false, sprints: [shapedSprint] } });
    });

    it('lists sprints in every state when no state is given', async () => {
      mocked.getSprints.mockResolvedValue({ values: [] });

      await setup().callJson('jira_getSprintsFromBoard', { boardId: 84 });

      expect(mocked.getSprints).toHaveBeenCalledWith(84, 25, undefined, undefined);
    });

    it('reports a kanban board error as a failure', async () => {
      mocked.getSprints.mockRejectedValue(apiError(400, 'Bad Request'));

      expect((await setup().callJson('jira_getSprintsFromBoard', { boardId: 12 })).error).toBe('Error fetching sprints: 400 Bad Request');
    });

    it('rejects an unknown sprint state', async () => {
      await expect(setup().call('jira_getSprintsFromBoard', { boardId: 84, state: ['open'] })).rejects.toThrow();
      expect(mocked.getSprints).not.toHaveBeenCalled();
    });
  });

  describe('jira_getSprintIssues', () => {
    it('passes the sprint id, JQL and paging, and shapes the issues', async () => {
      mocked.getSprintIssues.mockResolvedValue(issuePage);

      const result = await setup().callJson('jira_getSprintIssues', { sprintId: 37, jql: 'status != Done', startAt: 25, maxResults: 25 });

      expect(mocked.getSprintIssues).toHaveBeenCalledWith(37, undefined, 'status != Done', 25, undefined, ISSUE_FIELDS, 25);
      expect(result).toEqual({ success: true, data: { startAt: 0, maxResults: 25, total: 2, issues: shapedIssues } });
    });

    it('reports an unknown sprint as a failure', async () => {
      mocked.getSprintIssues.mockRejectedValue(apiError(404, 'Not Found'));

      expect((await setup().callJson('jira_getSprintIssues', { sprintId: 1 })).error).toBe('Error fetching sprint issues: 404 Not Found');
    });

    it('rejects a non-integer sprint id and an oversized page', async () => {
      await expect(setup().call('jira_getSprintIssues', { sprintId: 1.5 })).rejects.toThrow();
      await expect(setup().call('jira_getSprintIssues', { sprintId: 1, maxResults: 500 })).rejects.toThrow();
      expect(mocked.getSprintIssues).not.toHaveBeenCalled();
    });
  });

  describe('jira_createSprint', () => {
    it('creates the sprint on the board and shapes it', async () => {
      mocked.createSprint.mockResolvedValue({ ...sprint, state: 'future' });

      const result = await setup().callJson('jira_createSprint', {
        boardId: 84, name: ' Sprint 12 ', startDate: sprint.startDate, endDate: sprint.endDate, goal: 'Ship login',
      });

      expect(mocked.createSprint).toHaveBeenCalledWith({
        name: 'Sprint 12', originBoardId: 84, startDate: sprint.startDate, endDate: sprint.endDate, goal: 'Ship login',
      });
      expect(result).toEqual({ success: true, data: { ...shapedSprint, state: 'future' } });
    });

    it('sends only the fields given', async () => {
      mocked.createSprint.mockResolvedValue(sprint);

      await setup().callJson('jira_createSprint', { boardId: 84, name: 'Sprint 13' });

      expect(Object.keys(mocked.createSprint.mock.calls[0][0])).toEqual(['name', 'originBoardId']);
    });

    it('refuses a start date after the end date without calling Jira', async () => {
      const result = await setup().callJson('jira_createSprint', {
        boardId: 84, name: 'Sprint 13', startDate: '2026-11-20T09:00:00Z', endDate: '2026-11-10T09:00:00Z',
      });

      expect(result).toEqual({ success: false, error: 'startDate must be before endDate.' });
      expect(mocked.createSprint).not.toHaveBeenCalled();
    });

    it('refuses an unparseable date', async () => {
      const result = await setup().callJson('jira_createSprint', { boardId: 84, name: 'Sprint 13', endDate: 'next friday' });

      expect(result.error).toContain('endDate "next friday" is not a valid ISO 8601 date-time');
    });

    it('reports a Jira error as a failure', async () => {
      mocked.createSprint.mockRejectedValue(apiError(403, 'Forbidden'));

      expect((await setup().callJson('jira_createSprint', { boardId: 84, name: 'Sprint 13' })).error).toBe('Error creating sprint: 403 Forbidden');
    });

    it('requires a non-blank name', async () => {
      await expect(setup().call('jira_createSprint', { boardId: 84, name: '   ' })).rejects.toThrow();
      expect(mocked.createSprint).not.toHaveBeenCalled();
    });
  });

  describe('jira_updateSprint', () => {
    it('sends a partial update with only the fields given', async () => {
      mocked.updateSprint.mockResolvedValue({ ...sprint, state: 'closed', completeDate: '2026-11-15T10:00:00.000+03:00' });

      const result = await setup().callJson('jira_updateSprint', { sprintId: 37, state: 'closed', goal: '' });

      expect(mocked.updateSprint).toHaveBeenCalledWith(37, { state: 'closed', goal: '' });
      expect(result.data).toEqual({ ...shapedSprint, state: 'closed', completeDate: '2026-11-15T10:00:00.000+03:00' });
    });

    it('refuses an update with nothing to change', async () => {
      const result = await setup().callJson('jira_updateSprint', { sprintId: 37 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provide at least one of');
      expect(mocked.updateSprint).not.toHaveBeenCalled();
    });

    it('refuses a reversed date range', async () => {
      const result = await setup().callJson('jira_updateSprint', {
        sprintId: 37, startDate: '2026-11-15T09:00:00Z', endDate: '2026-11-15T09:00:00Z',
      });

      expect(result).toEqual({ success: false, error: 'startDate must be before endDate.' });
    });

    it('reports a rejected state change as a failure', async () => {
      mocked.updateSprint.mockRejectedValue(apiError(400, 'Bad Request'));

      expect((await setup().callJson('jira_updateSprint', { sprintId: 37, state: 'active' })).error).toBe('Error updating sprint: 400 Bad Request');
    });

    it('rejects an unknown state', async () => {
      await expect(setup().call('jira_updateSprint', { sprintId: 37, state: 'done' })).rejects.toThrow();
      expect(mocked.updateSprint).not.toHaveBeenCalled();
    });
  });

  describe('jira_addIssuesToSprint', () => {
    it('moves the issues into the sprint', async () => {
      mocked.moveToSprint.mockResolvedValue(undefined);

      const result = await setup().callJson('jira_addIssuesToSprint', { sprintId: 37, issueKeys: [' ACS-1', 'ACS-2'] });

      expect(mocked.moveToSprint).toHaveBeenCalledWith(37, { issues: ['ACS-1', 'ACS-2'] });
      expect(result).toEqual({
        success: true,
        data: { sprintId: 37, issueKeys: ['ACS-1', 'ACS-2'], message: 'Moved 2 issue(s) to sprint 37.' },
      });
    });

    it('reports a closed sprint as a failure', async () => {
      mocked.moveToSprint.mockRejectedValue(apiError(400, 'Bad Request'));

      expect((await setup().callJson('jira_addIssuesToSprint', { sprintId: 37, issueKeys: ['ACS-1'] })).error)
        .toBe('Error adding issues to sprint: 400 Bad Request');
    });

    it('requires between 1 and 50 issue keys', async () => {
      const tooMany = Array.from({ length: 51 }, (_, index) => `ACS-${index + 1}`);

      await expect(setup().call('jira_addIssuesToSprint', { sprintId: 37, issueKeys: [] })).rejects.toThrow();
      await expect(setup().call('jira_addIssuesToSprint', { sprintId: 37, issueKeys: tooMany })).rejects.toThrow();
      expect(mocked.moveToSprint).not.toHaveBeenCalled();
    });
  });

  describe('jira_moveIssuesToBacklog', () => {
    it('moves the issues to the backlog', async () => {
      mocked.moveToBacklog.mockResolvedValue(undefined);

      const result = await setup().callJson('jira_moveIssuesToBacklog', { issueKeys: ['ACS-1'] });

      expect(mocked.moveToBacklog).toHaveBeenCalledWith({ issues: ['ACS-1'] });
      expect(result).toEqual({ success: true, data: { issueKeys: ['ACS-1'], message: 'Moved 1 issue(s) to the backlog.' } });
    });

    it('reports a missing agile API as a failure, not a crash', async () => {
      mocked.moveToBacklog.mockRejectedValue(apiError(404, 'Not Found'));

      const result = await setup().call('jira_moveIssuesToBacklog', { issueKeys: ['ACS-1'] });

      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content[0] as { text: string }).text).error).toBe('Error moving issues to backlog: 404 Not Found');
    });

    it('rejects blank issue keys', async () => {
      await expect(setup().call('jira_moveIssuesToBacklog', { issueKeys: [' '] })).rejects.toThrow();
      expect(mocked.moveToBacklog).not.toHaveBeenCalled();
    });
  });
});
