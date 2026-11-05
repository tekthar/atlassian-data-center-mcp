import { asArray, asRecord } from './context.js';

/*
 * Pure helpers for project-level analysis, ported from sooperset/mcp-atlassian
 * jira/project_analysis.py. They read raw Jira DC REST issues (`fields.issuelinks`, `inwardIssue`, ...).
 */

/** Link labels that say the issue holding the link is the child (sooperset's CHILD_OF_PHRASES). */
const CHILD_OF_PHRASES = new Set(['is child of', 'is contained by', 'split from']);

export const projectKeyOf = (issueKey: string): string =>
  issueKey.includes('-') ? issueKey.slice(0, issueKey.lastIndexOf('-')) : issueKey;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export interface IssueBrief {
  key: string;
  summary: string;
  status: string;
  issueType?: string;
}

export function briefOf(value: unknown): IssueBrief {
  const issue = asRecord(value);
  const fields = asRecord(issue.fields);
  const issueType = text(asRecord(fields.issuetype).name);
  return {
    key: text(issue.key),
    summary: text(fields.summary),
    status: text(asRecord(fields.status).name) || 'Unknown',
    ...(issueType ? { issueType } : {}),
  };
}

export type ParentSource = 'parent' | 'parentLink' | 'issueLink';

export interface EpicParent {
  key: string;
  summary: string;
  status?: string;
  project: string;
  source: ParentSource;
  linkType?: string;
}

function parentFromIssue(value: unknown, source: ParentSource, linkType?: string): EpicParent | undefined {
  const brief = briefOf(value);
  if (!brief.key) return undefined;
  return {
    key: brief.key,
    summary: brief.summary,
    ...(brief.status !== 'Unknown' ? { status: brief.status } : {}),
    project: projectKeyOf(brief.key),
    source,
    ...(linkType ? { linkType } : {}),
  };
}

/**
 * Advanced Roadmaps "Parent Link" on DC returns `{ data: { issueKey, summary } }`; older versions and
 * some proxies return the bare key.
 */
function parentFromParentLink(value: unknown): EpicParent | undefined {
  const data = asRecord(asRecord(value).data);
  const key = typeof value === 'string' ? value : text(data.issueKey) || text(data.key);
  if (!key) return undefined;
  return { key, summary: text(data.summary), project: projectKeyOf(key), source: 'parentLink' };
}

function parentFromLinks(links: unknown, ownProject: string): EpicParent | undefined {
  for (const link of asArray(links).map(asRecord)) {
    const type = asRecord(link.type);
    const name = text(type.name).toLowerCase();
    const sides: Array<[unknown, string]> = [[link.inwardIssue, text(type.inward)], [link.outwardIssue, text(type.outward)]];
    for (const [issue, label] of sides) {
      const key = text(asRecord(issue).key);
      if (!key || projectKeyOf(key) === ownProject) continue;
      if (CHILD_OF_PHRASES.has(name) || CHILD_OF_PHRASES.has(label.toLowerCase())) {
        return parentFromIssue(issue, 'issueLink', text(type.name));
      }
    }
  }
  return undefined;
}

/**
 * An epic's parent: the `parent` field or a child-of issue link pointing at another project (as in
 * sooperset), or the DC Advanced Roadmaps "Parent Link" field, which is accepted in any project.
 */
export function detectEpicParent(epic: unknown, ownProject: string, parentLinkFieldId?: string): EpicParent | undefined {
  const fields = asRecord(asRecord(epic).fields);
  const parent = parentFromIssue(fields.parent, 'parent');
  if (parent && parent.project !== ownProject) return parent;
  const parentLink = parentLinkFieldId ? parentFromParentLink(fields[parentLinkFieldId]) : undefined;
  return parentLink ?? parentFromLinks(fields.issuelinks, ownProject);
}

export interface EpicNode extends IssueBrief {
  childCount?: number;
  children?: IssueBrief[];
}

export interface EpicGroup {
  parent: EpicParent | null;
  groupName?: 'Unlinked';
  epics: EpicNode[];
}

/** Epics grouped by parent key, parents sorted by key and the unlinked group last. */
export function groupEpicsByParent(epics: Array<{ epic: EpicNode; parent?: EpicParent }>): EpicGroup[] {
  const groups = new Map<string, EpicGroup>();
  const unlinked: EpicNode[] = [];
  for (const { epic, parent } of epics) {
    if (!parent) {
      unlinked.push(epic);
      continue;
    }
    const group = groups.get(parent.key) ?? { parent, epics: [] };
    group.epics.push(epic);
    groups.set(parent.key, group);
  }
  const sorted = [...groups.values()].sort((a, b) => (a.parent?.key ?? '').localeCompare(b.parent?.key ?? ''));
  return unlinked.length > 0 ? [...sorted, { parent: null, groupName: 'Unlinked', epics: unlinked }] : sorted;
}

/** Child issues keyed by the epic key held in their Epic Link field. */
export function childrenByEpic(children: unknown[], epicLinkFieldId: string): Map<string, IssueBrief[]> {
  const byEpic = new Map<string, IssueBrief[]>();
  for (const child of children) {
    const epicKey = text(asRecord(asRecord(child).fields)[epicLinkFieldId]);
    if (!epicKey) continue;
    byEpic.set(epicKey, [...(byEpic.get(epicKey) ?? []), briefOf(child)]);
  }
  return byEpic;
}

export interface CrossProjectLink {
  source: string;
  target: string;
  targetProject: string;
  targetSummary: string;
  targetStatus: string;
  linkType: string;
  direction: 'outward' | 'inward';
  /** How the source relates to the target, e.g. "blocks" or "is blocked by". */
  relationship: string;
}

/** Links from an issue to issues in other projects. */
export function extractCrossProjectLinks(issue: unknown, ownProject: string): CrossProjectLink[] {
  const source = text(asRecord(issue).key);
  return asArray(asRecord(asRecord(issue).fields).issuelinks).map(asRecord).flatMap((link) => {
    const type = asRecord(link.type);
    const sides: Array<['outward' | 'inward', unknown, string]> = [
      ['outward', link.outwardIssue, text(type.outward)],
      ['inward', link.inwardIssue, text(type.inward)],
    ];
    return sides.flatMap(([direction, target, relationship]): CrossProjectLink[] => {
      const brief = briefOf(target);
      if (!brief.key || projectKeyOf(brief.key) === ownProject) return [];
      const { key, summary, status } = brief;
      return [{ source, target: key, targetProject: projectKeyOf(key), targetSummary: summary, targetStatus: status, linkType: text(type.name), direction, relationship }];
    });
  });
}

export interface ProjectDependencies {
  totalLinks: number;
  byLinkType: Record<string, Array<Omit<CrossProjectLink, 'targetProject' | 'linkType'>>>;
}

/** Cross-project links grouped by target project, then by link type name. */
export function groupDependencies(links: CrossProjectLink[]): Record<string, ProjectDependencies> {
  const byProject: Record<string, ProjectDependencies> = {};
  for (const { targetProject, linkType, ...link } of links) {
    const project = (byProject[targetProject] ??= { totalLinks: 0, byLinkType: {} });
    (project.byLinkType[linkType] ??= []).push(link);
    project.totalLinks += 1;
  }
  return Object.fromEntries(Object.keys(byProject).sort().map((key) => [key, byProject[key]]));
}
