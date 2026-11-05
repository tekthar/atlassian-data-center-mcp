import { asArray, asRecord } from './context.js';

/*
 * Pure helpers that turn an issue's changelog into a status timeline. Ported from
 * sooperset/mcp-atlassian jira/metrics.py (MetricsMixin).
 */

/** Minutes between two instants (epoch ms); lets callers swap in working-hours counting. */
export type Measure = (startMs: number, endMs: number) => number;

export interface StatusTransition {
  fromStatus?: string;
  fromId?: string;
  toStatus?: string;
  toId?: string;
  at: string;
  atMs: number;
  by?: string;
}

/** One stay in a status. `endMs` is "now" while the stay is ongoing. */
export interface TimelineSegment {
  status: string;
  statusId?: string;
  enteredAt: string;
  exitedAt: string | null;
  startMs: number;
  endMs: number;
  /** True for the status the issue was created in, false for stays that began with a transition. */
  fromCreation: boolean;
  transitionedBy?: string;
}

export interface StatusChange {
  status: string;
  enteredAt: string;
  exitedAt: string | null;
  durationMinutes: number;
  durationFormatted: string;
  ongoing?: true;
  transitionedBy?: string;
}

export interface StatusTimeSummary {
  status: string;
  totalMinutes: number;
  totalFormatted: string;
  visitCount: number;
}

const MINUTE_MS = 60_000;

/** Jira DC sends offsets as `+0300`; rewrite them as `+03:00` so parsing follows the ECMAScript format. */
export function parseJiraDate(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const normalised = value.includes('T') ? value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : value;
  const ms = Date.parse(normalised);
  return Number.isNaN(ms) ? undefined : ms;
}

export const calendarMinutes: Measure = (startMs, endMs) => Math.max(0, Math.floor((endMs - startMs) / MINUTE_MS));

/** 90 -> "1h 30m", 1500 -> "1d 1h 0m", 0 -> "0m". Days are calendar days of 24 hours. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const parts = days > 0 ? [`${days}d`, `${hours}h`] : hours > 0 ? [`${hours}h`] : [];
  return [...parts, `${minutes % 60}m`].join(' ');
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function statusItemsOf(history: Record<string, unknown>): StatusTransition[] {
  const at = optionalString(history.created);
  const atMs = parseJiraDate(at);
  if (!at || atMs === undefined) return [];
  const by = optionalString(asRecord(history.author).displayName);
  return asArray(history.items)
    .map(asRecord)
    .filter((item) => String(item.field ?? '').toLowerCase() === 'status')
    .map((item) => ({
      fromStatus: optionalString(item.fromString),
      fromId: optionalString(item.from),
      toStatus: optionalString(item.toString),
      toId: optionalString(item.to),
      at,
      atMs,
      by,
    }));
}

/** Status transitions from an issue's `changelog` expand, oldest first. */
export function extractStatusTransitions(changelog: unknown): StatusTransition[] {
  const transitions = asArray(asRecord(changelog).histories).map(asRecord).flatMap(statusItemsOf);
  return transitions.sort((a, b) => a.atMs - b.atMs);
}

export interface TimelineInput {
  created?: string;
  currentStatus?: string;
  currentStatusId?: string;
  transitions: StatusTransition[];
  now: number;
}

function initialSegment(input: TimelineInput): TimelineSegment | undefined {
  const createdMs = parseJiraDate(input.created);
  const first = input.transitions[0];
  const status = first ? first.fromStatus : input.currentStatus;
  if (!input.created || createdMs === undefined || !status) return undefined;
  return {
    status,
    statusId: first ? first.fromId : input.currentStatusId,
    enteredAt: input.created,
    exitedAt: first ? first.at : null,
    startMs: createdMs,
    endMs: first ? first.atMs : Math.max(createdMs, input.now),
    fromCreation: true,
  };
}

/**
 * Each stay in a status, oldest first: the status the issue was created in, then one segment per
 * transition. Unlike sooperset, an issue that never transitioned still gets its current status.
 */
export function buildTimeline(input: TimelineInput): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const initial = initialSegment(input);
  if (initial) segments.push(initial);
  input.transitions.forEach((transition, index) => {
    if (!transition.toStatus) return;
    const next = input.transitions[index + 1];
    segments.push({
      status: transition.toStatus,
      statusId: transition.toId,
      enteredAt: transition.at,
      exitedAt: next ? next.at : null,
      startMs: transition.atMs,
      endMs: next ? next.atMs : Math.max(transition.atMs, input.now),
      fromCreation: false,
      transitionedBy: transition.by,
    });
  });
  return segments;
}

/** Timeline entries for output. The ongoing stay is measured up to now and flagged. */
export function describeTimeline(segments: TimelineSegment[], measure: Measure = calendarMinutes): StatusChange[] {
  return segments.map((segment) => {
    const durationMinutes = measure(segment.startMs, segment.endMs);
    return {
      status: segment.status,
      enteredAt: segment.enteredAt,
      exitedAt: segment.exitedAt,
      durationMinutes,
      durationFormatted: formatDuration(durationMinutes),
      ...(segment.exitedAt === null ? { ongoing: true as const } : {}),
      ...(segment.transitionedBy ? { transitionedBy: segment.transitionedBy } : {}),
    };
  });
}

/** Total time and number of visits per status, longest first. */
export function summariseStatusTime(changes: StatusChange[]): StatusTimeSummary[] {
  const totals = new Map<string, { minutes: number; visits: number }>();
  for (const change of changes) {
    const total = totals.get(change.status) ?? { minutes: 0, visits: 0 };
    total.minutes += change.durationMinutes;
    total.visits += 1;
    totals.set(change.status, total);
  }
  return [...totals.entries()]
    .map(([status, total]) => ({
      status,
      totalMinutes: total.minutes,
      totalFormatted: formatDuration(total.minutes),
      visitCount: total.visits,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export interface IssueDateFacts {
  created?: string;
  updated?: string;
  dueDate?: string;
  resolutionDate?: string;
  currentStatus?: string;
  currentStatusId?: string;
  transitions: StatusTransition[];
}

/** Dates, current status and status transitions from a raw issue (fields + `changelog` expand). */
export function readIssueDates(issue: unknown): IssueDateFacts {
  const fields = asRecord(asRecord(issue).fields);
  const status = asRecord(fields.status);
  return {
    created: optionalString(fields.created),
    updated: optionalString(fields.updated),
    dueDate: optionalString(fields.duedate),
    resolutionDate: optionalString(fields.resolutiondate),
    currentStatus: optionalString(status.name),
    currentStatusId: optionalString(status.id),
    transitions: extractStatusTransitions(asRecord(issue).changelog),
  };
}
