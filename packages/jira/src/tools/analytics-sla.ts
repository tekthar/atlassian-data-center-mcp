import { asRecord } from './context.js';
import { calendarMinutes, formatDuration, parseJiraDate, type Measure, type TimelineSegment } from './analytics-timeline.js';

/*
 * Pure SLA calculations over a status timeline. Ported from sooperset/mcp-atlassian jira/sla.py
 * (SLAMixin); working-hours settings come from tool arguments instead of JIRA_SLA_* variables.
 */

export const SLA_METRICS = [
  'cycle_time',
  'lead_time',
  'time_in_status',
  'due_date_compliance',
  'resolution_time',
  'first_response_time',
] as const;

export type SlaMetric = (typeof SLA_METRICS)[number];

export const DEFAULT_SLA_METRICS: SlaMetric[] = ['cycle_time', 'time_in_status'];

export interface WorkingHours {
  start: string;
  end: string;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  days: number[];
  timeZone: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const IN_PROGRESS_CATEGORY = 'indeterminate';
const IN_PROGRESS_NAMES = new Set(['in progress', 'in development', 'working']);

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const toMinutesOfDay = (hhmm: string): number => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
};

/** Why the working-hours arguments are unusable, or undefined when they are fine. */
export function workingHoursProblem(hours: WorkingHours): string | undefined {
  if (!isValidTimeZone(hours.timeZone)) return `Unknown time zone "${hours.timeZone}". Use an IANA name such as "Asia/Riyadh".`;
  if (toMinutesOfDay(hours.end) <= toMinutesOfDay(hours.start)) return 'workingHoursEnd must be later than workingHoursStart.';
  return undefined;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClockParts(ms: number, timeZone: string): number[] {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(ms).map((part) => [part.type, Number(part.value)]));
  return [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second];
}

/** Offset of `timeZone` from UTC at an instant, in ms (positive east of Greenwich). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const [year, month, day, hour, minute, second] = wallClockParts(ms, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - (ms - (ms % 1000));
}

/** The instant a wall-clock time occurs in `timeZone`; `dayUtcMs` is midnight UTC of that calendar date. */
function zonedInstant(dayUtcMs: number, minuteOfDay: number, timeZone: string): number {
  const wall = dayUtcMs + minuteOfDay * MINUTE_MS;
  const guess = wall - zoneOffsetMs(wall, timeZone);
  return wall - zoneOffsetMs(guess, timeZone);
}

function localDayUtcMs(ms: number, timeZone: string): number {
  const [year, month, day] = wallClockParts(ms, timeZone);
  return Date.UTC(year, month - 1, day);
}

/**
 * Minutes between two instants that fall inside working hours, walking local calendar days in
 * the configured time zone (sooperset's _calculate_working_minutes).
 */
export function workingMinutes(startMs: number, endMs: number, hours: WorkingHours): number {
  if (endMs <= startMs) return 0;
  const days = new Set(hours.days);
  const [open, close] = [toMinutesOfDay(hours.start), toMinutesOfDay(hours.end)];
  const lastDay = localDayUtcMs(endMs, hours.timeZone);
  let total = 0;
  for (let day = localDayUtcMs(startMs, hours.timeZone); day <= lastDay; day += DAY_MS) {
    const isoWeekday = new Date(day).getUTCDay() || 7;
    if (!days.has(isoWeekday)) continue;
    const from = Math.max(zonedInstant(day, open, hours.timeZone), startMs);
    const to = Math.min(zonedInstant(day, close, hours.timeZone), endMs);
    if (to > from) total += Math.floor((to - from) / MINUTE_MS);
  }
  return total;
}

export const measureFor = (hours: WorkingHours | undefined): Measure =>
  hours ? (startMs, endMs) => workingMinutes(startMs, endMs, hours) : calendarMinutes;

export interface SlaFacts {
  created?: string;
  resolutionDate?: string;
  dueDate?: string;
  segments: TimelineSegment[];
  now: number;
  /** Status category key ("new", "indeterminate", "done") for a timeline segment, when known. */
  categoryOf: (segment: TimelineSegment) => string | undefined;
}

const timed = (minutes: number) => ({ valueMinutes: minutes, formatted: formatDuration(minutes) });

export function cycleTime(facts: SlaFacts, measure: Measure) {
  const created = parseJiraDate(facts.created);
  const resolved = parseJiraDate(facts.resolutionDate);
  if (created === undefined) return { calculated: false, reason: 'No created date' };
  if (resolved === undefined) return { calculated: false, reason: 'Issue not resolved' };
  return { calculated: true, ...timed(measure(created, resolved)) };
}

export function leadTime(facts: SlaFacts, measure: Measure) {
  const created = parseJiraDate(facts.created);
  const resolved = parseJiraDate(facts.resolutionDate);
  if (created === undefined) return { ...timed(0), isResolved: false };
  return { ...timed(measure(created, resolved ?? facts.now)), isResolved: resolved !== undefined };
}

export function timeInStatus(segments: TimelineSegment[], measure: Measure) {
  const totals = new Map<string, { minutes: number; visits: number }>();
  for (const segment of segments) {
    const total = totals.get(segment.status) ?? { minutes: 0, visits: 0 };
    total.minutes += measure(segment.startMs, segment.endMs);
    total.visits += 1;
    totals.set(segment.status, total);
  }
  const totalMinutes = [...totals.values()].reduce((sum, total) => sum + total.minutes, 0);
  const statuses = [...totals.entries()].map(([status, total]) => ({
    status,
    ...timed(total.minutes),
    percentage: totalMinutes > 0 ? Math.round((total.minutes / totalMinutes) * 10_000) / 100 : 0,
    visitCount: total.visits,
  }));
  return { statuses: statuses.sort((a, b) => b.valueMinutes - a.valueMinutes), totalMinutes };
}

const offsetOf = (timestamp: string | undefined): string => /([+-]\d{2}:?\d{2}|Z)$/.exec(timestamp ?? '')?.[1] ?? 'Z';

/** Resolution compared with the end of the due day, in the resolution timestamp's own offset. */
export function dueDateCompliance(facts: SlaFacts) {
  if (!facts.dueDate) return { status: 'no_due_date' };
  const resolved = parseJiraDate(facts.resolutionDate);
  if (resolved === undefined) return { status: 'not_resolved' };
  const dueEnd = parseJiraDate(`${facts.dueDate.slice(0, 10)}T23:59:59${offsetOf(facts.resolutionDate)}`);
  if (dueEnd === undefined) return { status: 'no_due_date' };
  const margin = Math.trunc((dueEnd - resolved) / MINUTE_MS);
  return margin >= 0
    ? { status: 'met', marginMinutes: margin, formattedMargin: `${formatDuration(margin)} early` }
    : { status: 'missed', marginMinutes: margin, formattedMargin: `${formatDuration(-margin)} late` };
}

/** Status category key by `id:<status id>` and `name:<lowercase status name>`, from /rest/api/2/status entries. */
export function statusCategoryIndex(statuses: unknown[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const status of statuses.map(asRecord)) {
    const category = asRecord(status.statusCategory).key;
    if (typeof category !== 'string') continue;
    if (typeof status.id === 'string') index.set(`id:${status.id}`, category);
    if (typeof status.name === 'string') index.set(`name:${status.name.toLowerCase()}`, category);
  }
  return index;
}

export const categoryLookup = (index: Map<string, string>) => (segment: TimelineSegment): string | undefined =>
  (segment.statusId ? index.get(`id:${segment.statusId}`) : undefined) ?? index.get(`name:${segment.status.toLowerCase()}`);

export function isInProgress(segment: TimelineSegment, category: string | undefined): boolean {
  return category !== undefined ? category === IN_PROGRESS_CATEGORY : IN_PROGRESS_NAMES.has(segment.status.toLowerCase());
}

/** From the first entry into an "In Progress" category status until resolution. */
export function resolutionTime(facts: SlaFacts, measure: Measure) {
  const resolved = parseJiraDate(facts.resolutionDate);
  if (resolved === undefined) return { calculated: false, reason: 'Issue not resolved' };
  const started = facts.segments.find((segment) => isInProgress(segment, facts.categoryOf(segment)));
  if (!started) return { calculated: false, reason: "No 'In Progress' status found" };
  return { calculated: true, ...timed(measure(started.startMs, resolved)) };
}

/** From creation until the first status transition. */
export function firstResponseTime(facts: SlaFacts, measure: Measure) {
  const created = parseJiraDate(facts.created);
  const firstTransition = facts.segments.find((segment) => !segment.fromCreation);
  if (created === undefined || !firstTransition) return { calculated: false };
  return { calculated: true, ...timed(measure(created, firstTransition.startMs)), responseType: 'transition' };
}

export function computeSlaMetrics(metrics: SlaMetric[], facts: SlaFacts, measure: Measure): Record<string, unknown> {
  const calculators: Record<SlaMetric, () => unknown> = {
    cycle_time: () => cycleTime(facts, measure),
    lead_time: () => leadTime(facts, measure),
    time_in_status: () => timeInStatus(facts.segments, measure),
    due_date_compliance: () => dueDateCompliance(facts),
    resolution_time: () => resolutionTime(facts, measure),
    first_response_time: () => firstResponseTime(facts, measure),
  };
  return Object.fromEntries([...new Set(metrics)].map((metric) => [metric, calculators[metric]()]));
}
