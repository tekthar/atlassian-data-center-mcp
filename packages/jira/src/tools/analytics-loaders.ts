import { FieldService, IssueService, SearchService, StatusService } from '../jira-client/index.js';
import { asArray, asRecord } from './context.js';

/* API access shared by the analytics tools. Response shaping lives in the pure analytics-* modules. */

const SEARCH_PAGE_SIZE = 100;
const EPICS_PER_CHILD_QUERY = 50;
const EPIC_LINK_TYPE = 'com.pyxis.greenhopper.jira:gh-epic-link';
const PARENT_LINK_TYPE = 'com.atlassian.jpo:jpo-custom-field-parent';

export const ISSUE_DATE_FIELDS = ['status', 'created', 'updated', 'duedate', 'resolutiondate'];
const BRIEF_FIELDS = ['summary', 'status', 'issuetype'];

export const errorStatus = (error: unknown): number | undefined => {
  const status = asRecord(error).status;
  return typeof status === 'number' ? status : undefined;
};

/** "404 Not Found" for API errors, the message otherwise. */
export function describeError(error: unknown): string {
  const status = errorStatus(error);
  if (status !== undefined) return `${status} ${String(asRecord(error).statusText ?? '')}`.trim();
  return error instanceof Error ? error.message : String(error);
}

/** Quote a value for a JQL string literal. */
export const jqlString = (value: string): string => `"${value.replace(/["\\]/g, '\\$&')}"`;

export interface SearchOutcome {
  issues: unknown[];
  /** Matches reported by Jira, which can exceed `issues.length` when `limit` cut the scan short. */
  total: number;
}

/** Run a JQL search page by page until `limit` issues are collected or the results run out. */
export async function searchAll(jql: string, fields: string[], limit: number): Promise<SearchOutcome> {
  const issues: unknown[] = [];
  let total = 0;
  while (issues.length < limit) {
    const maxResults = Math.min(SEARCH_PAGE_SIZE, limit - issues.length);
    const page = asRecord(await SearchService.searchUsingSearchRequest({ jql, fields, startAt: issues.length, maxResults }));
    const batch = asArray(page.issues);
    issues.push(...batch);
    total = typeof page.total === 'number' ? page.total : issues.length;
    if (batch.length === 0 || issues.length >= total) break;
  }
  return { issues: issues.slice(0, limit), total: Math.max(total, issues.length) };
}

export async function loadIssueForDates(issueKey: string, withChangelog: boolean): Promise<Record<string, unknown>> {
  return asRecord(await IssueService.getIssue1(issueKey, withChangelog ? 'changelog' : undefined, ISSUE_DATE_FIELDS.join(',')));
}

/** All statuses, for mapping historical statuses to their category. Empty when Jira refuses. */
export async function loadStatuses(): Promise<unknown[]> {
  try {
    return asArray(await StatusService.getStatuses());
  } catch {
    return [];
  }
}

export interface HierarchyFieldIds {
  /** Jira Software "Epic Link" custom field, e.g. customfield_10101. */
  epicLink?: string;
  /** Advanced Roadmaps "Parent Link" custom field, when that app is installed. */
  parentLink?: string;
}

export function hierarchyFieldIds(fields: unknown): HierarchyFieldIds {
  const all = asArray(fields).map(asRecord);
  const idOf = (customType: string) => {
    const id = all.find((field) => asRecord(field.schema).custom === customType)?.id;
    return typeof id === 'string' ? id : undefined;
  };
  return { epicLink: idOf(EPIC_LINK_TYPE), parentLink: idOf(PARENT_LINK_TYPE) };
}

export async function loadHierarchyFieldIds(): Promise<HierarchyFieldIds> {
  return hierarchyFieldIds(await FieldService.getFields());
}

export async function loadProjectEpics(projectKey: string, parentLinkFieldId: string | undefined, limit: number): Promise<SearchOutcome> {
  const fields = [...BRIEF_FIELDS, 'issuelinks', 'parent', ...(parentLinkFieldId ? [parentLinkFieldId] : [])];
  return searchAll(`project = ${jqlString(projectKey)} AND issuetype = Epic ORDER BY updated DESC`, fields, limit);
}

export async function loadProjectIssuesWithLinks(projectKey: string, limit: number): Promise<SearchOutcome> {
  return searchAll(`project = ${jqlString(projectKey)} ORDER BY updated DESC`, [...BRIEF_FIELDS, 'issuelinks'], limit);
}

export interface ChildrenOutcome {
  issues: unknown[];
  /** True when `limit` stopped the scan before every child was read. */
  truncated: boolean;
}

/** Issues whose Epic Link points at one of `epicKeys`, queried 50 epics at a time, up to `limit`. */
export async function loadEpicChildren(epicKeys: string[], epicLinkFieldId: string, limit: number): Promise<ChildrenOutcome> {
  const clause = `cf[${epicLinkFieldId.replace('customfield_', '')}]`;
  const children: unknown[] = [];
  for (let index = 0; index < epicKeys.length; index += EPICS_PER_CHILD_QUERY) {
    const budget = limit - children.length;
    if (budget <= 0) return { issues: children, truncated: true };
    const keys = epicKeys.slice(index, index + EPICS_PER_CHILD_QUERY).map(jqlString).join(', ');
    const outcome = await searchAll(`${clause} in (${keys}) ORDER BY key ASC`, [...BRIEF_FIELDS, epicLinkFieldId], budget);
    children.push(...outcome.issues);
    if (outcome.total > outcome.issues.length) return { issues: children, truncated: true };
  }
  return { issues: children, truncated: false };
}

/** Run `task` over `items` with at most `limit` in flight, keeping input order in the results. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
