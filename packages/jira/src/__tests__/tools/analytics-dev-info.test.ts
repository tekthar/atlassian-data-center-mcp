import { DEV_DATA_TYPES, mergeDevelopmentInfo, pairsFromSummary, parseDevelopmentDetail } from '../../tools/analytics-dev-info.js';

jest.mock('../../jira-client/index.js', () => ({ OpenAPI: {}, IssueService: { getIssue1: jest.fn() } }));
jest.mock('../../jira-client/core/request.js', () => ({ request: jest.fn() }));

const detailResponse = {
  errors: [],
  detail: [{
    _instance: { name: 'Bitbucket', baseUrl: 'https://bitbucket.example.com', type: 'stash' },
    pullRequests: [{
      id: '#12',
      name: 'ACS-1 fix login',
      status: 'MERGED',
      url: 'https://bitbucket.example.com/pr/12',
      source: { branch: 'feature/ACS-1', repository: { name: 'api', url: 'https://bitbucket.example.com/api' } },
      destination: { branch: 'main' },
      author: { name: 'Jane Doe', avatar: 'https://bitbucket.example.com/avatar' },
      reviewers: [{ name: 'Sam Lee', approved: true }, { approved: false }],
      lastUpdate: '2024-01-03T10:00:00.000+0000',
    }],
    branches: [{
      name: 'feature/ACS-1',
      url: 'https://bitbucket.example.com/branch',
      createPullRequestUrl: 'https://bitbucket.example.com/create',
      repository: { name: 'api', url: 'https://bitbucket.example.com/api' },
    }],
    repositories: [{
      name: 'api',
      url: 'https://bitbucket.example.com/api',
      avatar: 'https://bitbucket.example.com/repo-avatar',
      commits: [{
        id: 'abc123def',
        displayId: 'abc123d',
        message: 'ACS-1 fix login',
        author: { name: 'Jane Doe' },
        authorTimestamp: 1704189600000,
        url: 'https://bitbucket.example.com/commit/abc123def',
      }],
    }],
  }],
};

describe('parseDevelopmentDetail', () => {
  it('flattens pull requests, branches, commits and repositories', () => {
    expect(parseDevelopmentDetail(detailResponse)).toEqual({
      pullRequests: [{
        id: '#12',
        name: 'ACS-1 fix login',
        status: 'MERGED',
        url: 'https://bitbucket.example.com/pr/12',
        source: 'feature/ACS-1',
        destination: 'main',
        author: 'Jane Doe',
        reviewers: ['Sam Lee'],
        lastUpdate: '2024-01-03T10:00:00.000+0000',
        repository: 'api',
        repositoryUrl: 'https://bitbucket.example.com/api',
        instance: 'Bitbucket',
      }],
      branches: [{
        name: 'feature/ACS-1',
        url: 'https://bitbucket.example.com/branch',
        createPullRequestUrl: 'https://bitbucket.example.com/create',
        repository: 'api',
        repositoryUrl: 'https://bitbucket.example.com/api',
        instance: 'Bitbucket',
      }],
      commits: [{
        id: 'abc123def',
        displayId: 'abc123d',
        message: 'ACS-1 fix login',
        author: 'Jane Doe',
        authorTimestamp: '1704189600000',
        url: 'https://bitbucket.example.com/commit/abc123def',
        repository: 'api',
        repositoryUrl: 'https://bitbucket.example.com/api',
      }],
      repositories: [{ name: 'api', url: 'https://bitbucket.example.com/api' }],
    });
  });

  it('returns empty lists for an empty or unexpected response', () => {
    const empty = { pullRequests: [], branches: [], commits: [], repositories: [] };
    expect(parseDevelopmentDetail({ detail: [] })).toEqual(empty);
    expect(parseDevelopmentDetail('nope')).toEqual(empty);
  });
});

describe('mergeDevelopmentInfo', () => {
  it('drops entries repeated across data types', () => {
    const part = parseDevelopmentDetail(detailResponse);
    const merged = mergeDevelopmentInfo([part, part]);

    expect(merged.pullRequests).toHaveLength(1);
    expect(merged.branches).toHaveLength(1);
    expect(merged.commits).toHaveLength(1);
    expect(merged.repositories).toHaveLength(1);
  });
});

describe('pairsFromSummary', () => {
  const summary = {
    summary: {
      pullrequest: { overall: { count: 2 }, byInstanceType: { stash: { count: 2, name: 'Bitbucket Server' } } },
      branch: { overall: { count: 0 }, byInstanceType: { stash: { count: 0, name: 'Bitbucket Server' } } },
      repository: { overall: { count: 4 }, byInstanceType: { stash: { count: 3 }, github: { count: 1 } } },
    },
  };

  it('keeps only application and data type pairs that have data', () => {
    expect(pairsFromSummary(summary, DEV_DATA_TYPES)).toEqual([
      ['github', 'repository'],
      ['stash', 'pullrequest'],
      ['stash', 'repository'],
    ]);
    expect(pairsFromSummary(summary, ['pullrequest'])).toEqual([['stash', 'pullrequest']]);
  });

  it('treats a missing section as no data', () => {
    expect(pairsFromSummary({ summary: {} }, DEV_DATA_TYPES)).toEqual([]);
  });

  it('returns undefined for a malformed summary', () => {
    expect(pairsFromSummary({}, DEV_DATA_TYPES)).toBeUndefined();
    expect(pairsFromSummary({ summary: { pullrequest: 'broken' } }, DEV_DATA_TYPES)).toBeUndefined();
  });
});
