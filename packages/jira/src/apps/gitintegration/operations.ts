import { asArray, asRecord } from '../../tools/context.js';
import { callGitIntegration } from './client.js';

/*
 * Commits are the app's public api.thirdparty.model.Commit (revision, message, createdAt in milliseconds, author with
 * name and email, repositoryId, isMergeCommit, branches, and files with lines added, changed and deleted), in a
 * PaginatedResponse { items, total, offset, limit, hasMore }. An issue's branches come in IssueWebPanelInfo, by
 * repository, and its pull and merge requests in MergeRequestsInfo. Repositories carry credentials (password, pat,
 * GitHub App secrets), so only named fields are kept, and any user name or password is cut from the origin URL.
 */

const defined = (entries: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined && value !== null && value !== ''));

const isoTime = (value: unknown) => (typeof value === 'number' ? new Date(value).toISOString() : value);
const withoutCredentials = (url: unknown) => (typeof url === 'string' ? url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/i, '$1') : url);
const MAX_DESCRIPTION = 1000;

function describeFile(value: unknown) {
  const file = asRecord(value);
  const change = file.isAdded ?? file.added ? 'added' : file.isDeleted ?? file.deleted ? 'deleted' : 'modified';
  return defined({ path: file.path, change, linesAdded: file.linesAdded, linesDeleted: file.linesDeleted });
}

function describeCommit(value: unknown) {
  const commit = asRecord(value);
  const files = asArray(commit.files);
  return defined({
    revision: commit.revision,
    message: typeof commit.message === 'string' ? commit.message.trim() : commit.message,
    author: asRecord(commit.author).name,
    authorEmail: asRecord(commit.author).email,
    date: isoTime(commit.createdAt),
    repositoryId: commit.repositoryId,
    mergeCommit: commit.isMergeCommit ?? commit.mergeCommit ? true : undefined,
    branches: asArray(commit.branches).length ? commit.branches : undefined,
    files: files.length ? files.map(describeFile) : undefined,
  });
}

/** An issue's commits across the connected repositories, a page at a time. */
export async function getIssueCommits(issueKey: string, withFiles = false, offset = 0, limit = 20) {
  const page = asRecord(await callGitIntegration({
    method: 'GET', url: '/issues/{issueKey}/commits', path: { issueKey }, query: { showFiles: withFiles, offset, limit },
  }, `Issue ${issueKey}'s commits`));
  const commits = asArray(page.items).map(describeCommit);
  const total = typeof page.total === 'number' ? page.total : commits.length;
  const more = page.hasMore === true || offset + commits.length < total;
  return { issueKey, total, offset, commits, ...(more ? { nextOffset: offset + commits.length } : {}) };
}

/** An issue's branches by repository, with how far each is ahead of and behind the main branch. */
export async function getIssueBranches(issueKey: string) {
  const info = asRecord(await callGitIntegration({
    method: 'GET', url: '/issuegitdetails/issue/{issueKey}', path: { issueKey },
  }, `Issue ${issueKey}'s branches`));
  return defined({
    issueKey,
    commitCount: info.commitCount,
    repositories: asArray(info.repositories).map(asRecord).map((repository) => defined({
      repositoryId: repository.repoId,
      repository: repository.repoName,
      branches: asArray(repository.branches).map(asRecord).map((branch) => defined({
        name: branch.name, ahead: branch.ahead, behind: branch.behind, url: branch.externalUrl,
      })),
    })),
    someHidden: info.notAllPermissions === true ? true : undefined,
  });
}

function describePullRequest(value: unknown) {
  const request = asRecord(value);
  const description = typeof request.description === 'string' ? request.description.slice(0, MAX_DESCRIPTION) : undefined;
  return defined({
    id: request.id,
    title: request.title,
    state: request.state,
    from: request.compareBranch,
    to: request.baseBranch,
    repository: asRecord(request.repository).name,
    author: asRecord(request.author).name ?? asRecord(request.author).username,
    reviewers: asArray(request.reviewers).map((reviewer) => asRecord(reviewer).name ?? asRecord(reviewer).username),
    url: request.url,
    description,
  });
}

/** An issue's pull requests (GitHub, Bitbucket, Azure DevOps) and merge requests (GitLab). */
export async function getIssuePullRequests(issueKey: string) {
  const info = asRecord(await callGitIntegration({
    method: 'GET', url: '/issuegitdetails/issue/{issueKey}/pullRequest', path: { issueKey },
  }, `Issue ${issueKey}'s pull requests`));
  const items = [...asArray(asRecord(info.pullRequests).items), ...asArray(asRecord(info.mergeRequests).items)];
  return { issueKey, pullRequests: items.map(describePullRequest) };
}

function describeRepository(value: unknown) {
  const repository = asRecord(value);
  return defined({
    id: repository.id,
    name: repository.displayName,
    group: repository.group,
    origin: withoutCredentials(repository.origin),
    mainBranch: repository.mainBranch,
    hosting: repository.integrationType,
    disabled: repository.disabled === true ? true : undefined,
    lastIndexed: isoTime(repository.lastIndexedDate),
    indexStatus: repository.indexStatus,
  });
}

/** The repositories connected to Jira, or to one project, that you may see. */
export async function getRepositories(projectKey?: string, offset = 0, limit = 50) {
  const page = asRecord(await callGitIntegration({
    method: 'GET', url: '/repository', query: { projectKey, short: true, offset, limit },
  }, projectKey ? `Project ${projectKey}'s repositories` : 'The repositories'));
  const repositories = asArray(page.items).map(describeRepository);
  const total = typeof page.total === 'number' ? page.total : repositories.length;
  return { total, offset, repositories, ...(offset + repositories.length < total ? { nextOffset: offset + repositories.length } : {}) };
}
