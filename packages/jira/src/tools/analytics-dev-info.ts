import { IssueService, OpenAPI } from '../jira-client/index.js';
import { request as __request } from '../jira-client/core/request.js';
import { asArray, asRecord } from './context.js';
import { describeError, errorStatus, mapWithConcurrency } from './analytics-loaders.js';

/*
 * Batch development info (pull requests, branches, commits) from the /rest/dev-status/1.0 API,
 * ported from sooperset/mcp-atlassian jira/development.py.
 */

export const DEV_DATA_TYPES = ['pullrequest', 'branch', 'repository'] as const;
export type DevDataType = (typeof DEV_DATA_TYPES)[number];

/** Tried when the summary endpoint cannot say which source-control apps hold data (DC casing). */
export const FALLBACK_APPLICATION_TYPES = ['stash', 'bitbucket', 'github', 'githube', 'gitlab'];

const ISSUE_CONCURRENCY = 5;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
/** Ids and timestamps arrive as strings or numbers depending on the source-control app. */
const scalar = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const nameOf = (value: unknown): string => text(asRecord(value).name);

export interface DevelopmentInfo {
  pullRequests: Record<string, unknown>[];
  branches: Record<string, unknown>[];
  commits: Record<string, unknown>[];
  repositories: Array<{ name: string; url: string }>;
}

interface RepositoryContext {
  repository?: string;
  repositoryUrl?: string;
  instance?: string;
}

function shapePullRequest(value: unknown, context: RepositoryContext) {
  const pr = asRecord(value);
  const source = asRecord(pr.source);
  const sourceRepo = asRecord(source.repository);
  return {
    id: scalar(pr.id),
    name: text(pr.name),
    status: text(pr.status),
    url: text(pr.url),
    source: text(source.branch),
    destination: text(asRecord(pr.destination).branch),
    author: nameOf(pr.author),
    reviewers: asArray(pr.reviewers).map(nameOf).filter(Boolean),
    lastUpdate: scalar(pr.lastUpdate),
    repository: context.repository ?? text(sourceRepo.name),
    repositoryUrl: context.repositoryUrl ?? text(sourceRepo.url),
    ...(context.instance ? { instance: context.instance } : {}),
  };
}

function shapeBranch(value: unknown, context: RepositoryContext) {
  const branch = asRecord(value);
  const repository = asRecord(branch.repository);
  return {
    name: text(branch.name),
    url: text(branch.url),
    createPullRequestUrl: text(branch.createPullRequestUrl),
    repository: context.repository ?? text(repository.name),
    repositoryUrl: context.repositoryUrl ?? text(repository.url),
    ...(context.instance ? { instance: context.instance } : {}),
  };
}

function shapeCommit(value: unknown, context: RepositoryContext) {
  const commit = asRecord(value);
  return {
    id: scalar(commit.id),
    displayId: text(commit.displayId),
    message: text(commit.message),
    author: nameOf(commit.author),
    authorTimestamp: scalar(commit.authorTimestamp),
    url: text(commit.url),
    repository: context.repository ?? '',
    repositoryUrl: context.repositoryUrl ?? '',
  };
}

const emptyInfo = (): DevelopmentInfo => ({ pullRequests: [], branches: [], commits: [], repositories: [] });

function addRepository(info: DevelopmentInfo, value: unknown): void {
  const repo = asRecord(value);
  const context = { repository: text(repo.name) || 'Unknown', repositoryUrl: text(repo.url) };
  info.commits.push(...asArray(repo.commits).map((commit) => shapeCommit(commit, context)));
  info.pullRequests.push(...asArray(repo.pullRequests).map((pr) => shapePullRequest(pr, context)));
  info.branches.push(...asArray(repo.branches).map((branch) => shapeBranch(branch, context)));
  if (context.repository !== 'Unknown') info.repositories.push({ name: context.repository, url: context.repositoryUrl });
}

/** Pull requests, branches, commits and repositories from one `issue/detail` response. */
export function parseDevelopmentDetail(response: unknown): DevelopmentInfo {
  const info = emptyInfo();
  for (const detail of asArray(asRecord(response).detail).map(asRecord)) {
    const context = { instance: text(asRecord(detail._instance).name) || 'Unknown' };
    info.pullRequests.push(...asArray(detail.pullRequests).map((pr) => shapePullRequest(pr, context)));
    info.branches.push(...asArray(detail.branches).map((branch) => shapeBranch(branch, context)));
    asArray(detail.repositories).forEach((repo) => addRepository(info, repo));
  }
  return info;
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Merge per-(app, data type) results; the same PR or branch can come back for several data types. */
export function mergeDevelopmentInfo(parts: DevelopmentInfo[]): DevelopmentInfo {
  const all = (pick: (info: DevelopmentInfo) => Record<string, unknown>[]) => parts.flatMap(pick);
  const keyOf = (fields: string[]) => (item: Record<string, unknown>) => fields.map((field) => String(item[field] ?? '')).join('|');
  return {
    pullRequests: uniqueBy(all((info) => info.pullRequests), keyOf(['url', 'id', 'repository'])),
    branches: uniqueBy(all((info) => info.branches), keyOf(['url', 'name', 'repository'])),
    commits: uniqueBy(all((info) => info.commits), keyOf(['id', 'repository'])),
    repositories: uniqueBy(parts.flatMap((info) => info.repositories), (repo) => `${repo.url}|${repo.name}`),
  };
}

export type DevPair = [applicationType: string, dataType: DevDataType];

/**
 * (application type, data type) pairs the `issue/summary` response reports data for, or undefined
 * when the response is not shaped as expected.
 */
export function pairsFromSummary(response: unknown, dataTypes: readonly DevDataType[]): DevPair[] | undefined {
  const summary = asRecord(response).summary;
  if (typeof summary !== 'object' || summary === null) return undefined;
  const pairs: DevPair[] = [];
  for (const dataType of dataTypes) {
    const section = (summary as Record<string, unknown>)[dataType] ?? {};
    const byInstanceType = asRecord(section).byInstanceType ?? {};
    if (typeof section !== 'object' || typeof byInstanceType !== 'object') return undefined;
    for (const [applicationType, instance] of Object.entries(byInstanceType as Record<string, unknown>)) {
      const count = asRecord(instance).count;
      if (typeof count === 'number' && count > 0) pairs.push([applicationType, dataType]);
    }
  }
  return pairs.sort(([a], [b]) => a.localeCompare(b));
}

export interface DevInfoOptions {
  applicationType?: string;
  dataType?: DevDataType;
}

const UNAVAILABLE: Record<number, string> = {
  404: 'Development info is not available: the Jira dev-status plugin may not be installed on this instance.',
  403: 'Access denied to development info: check the View Development Tools permission.',
};

/** 403 and 404 mean every other dev-status call will fail the same way, so they end the issue. */
const unavailableReason = (error: unknown): string | undefined => UNAVAILABLE[errorStatus(error) ?? 0];
const isFatal = (error: unknown) => unavailableReason(error) !== undefined;

async function pairsFor(issueId: string, options: DevInfoOptions): Promise<DevPair[]> {
  const dataTypes = options.dataType ? [options.dataType] : DEV_DATA_TYPES;
  const allOf = (apps: string[]) => apps.flatMap((app) => dataTypes.map((dataType): DevPair => [app, dataType]));
  if (options.applicationType) return allOf([options.applicationType]);
  try {
    const summary = await __request(OpenAPI, { method: 'GET', url: '/dev-status/1.0/issue/summary', query: { issueId } });
    return pairsFromSummary(summary, dataTypes) ?? allOf(FALLBACK_APPLICATION_TYPES);
  } catch (error) {
    if (isFatal(error)) throw error;
    return allOf(FALLBACK_APPLICATION_TYPES);
  }
}

async function fetchPairs(issueId: string, pairs: DevPair[]) {
  const parts: DevelopmentInfo[] = [];
  const warnings: string[] = [];
  for (const [applicationType, dataType] of pairs) {
    try {
      const detail = await __request(OpenAPI, { method: 'GET', url: '/dev-status/1.0/issue/detail', query: { issueId, applicationType, dataType } });
      parts.push(parseDevelopmentDetail(detail));
    } catch (error) {
      if (isFatal(error)) throw error;
      warnings.push(`${applicationType}/${dataType}: ${describeError(error)}`);
    }
  }
  return { info: mergeDevelopmentInfo(parts), warnings };
}

const failed = (issueKey: string, error: string) => ({ issueKey, error, ...emptyInfo() });

async function resolveIssueId(issueKey: string): Promise<string> {
  // The dev-status API is keyed by the numeric issue id, not the issue key.
  const issueId = text(asRecord(await IssueService.getIssue1(issueKey, undefined, 'id')).id);
  if (!issueId) throw new Error(`Could not resolve the numeric id of ${issueKey}`);
  return issueId;
}

async function loadIssueDevelopmentInfo(issueKey: string, options: DevInfoOptions) {
  let issueId: string;
  try {
    issueId = await resolveIssueId(issueKey);
  } catch (error) {
    return failed(issueKey, errorStatus(error) === 404 ? `Issue ${issueKey} does not exist or you cannot see it.` : describeError(error));
  }
  try {
    const { info, warnings } = await fetchPairs(issueId, await pairsFor(issueId, options));
    return { issueKey, ...info, ...(warnings.length > 0 ? { warnings } : {}) };
  } catch (error) {
    return failed(issueKey, unavailableReason(error) ?? describeError(error));
  }
}

/** Development info for each issue, five issues at a time; one failing issue does not fail the batch. */
export async function loadIssuesDevelopmentInfo(issueKeys: string[], options: DevInfoOptions) {
  const issues = await mapWithConcurrency([...new Set(issueKeys)], ISSUE_CONCURRENCY, (key) => loadIssueDevelopmentInfo(key, options));
  const errorCount = issues.filter((issue) => 'error' in issue).length;
  return { totalCount: issues.length, successCount: issues.length - errorCount, errorCount, issues };
}
