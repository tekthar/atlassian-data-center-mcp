import {
  categoryLookup,
  computeSlaMetrics,
  cycleTime,
  dueDateCompliance,
  firstResponseTime,
  isValidTimeZone,
  leadTime,
  measureFor,
  resolutionTime,
  SLA_METRICS,
  statusCategoryIndex,
  timeInStatus,
  workingHoursProblem,
  workingMinutes,
  type SlaFacts,
  type WorkingHours,
} from '../../tools/analytics-sla.js';
import { buildTimeline, calendarMinutes, type TimelineSegment } from '../../tools/analytics-timeline.js';

const at = (iso: string) => Date.parse(iso);
const NOW = at('2024-01-10T00:00:00.000Z');

const office: WorkingHours = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], timeZone: 'UTC' };

const transition = (iso: string, from: string, to: string, ids: [string, string]) => ({
  fromStatus: from, fromId: ids[0], toStatus: to, toId: ids[1], at: iso, atMs: at(iso), by: 'Jane Doe',
});

const segments = buildTimeline({
  created: '2024-01-01T09:00:00.000+0000',
  transitions: [
    transition('2024-01-02T09:00:00.000+0000', 'Open', 'In Progress', ['1', '3']),
    transition('2024-01-03T12:00:00.000+0000', 'In Progress', 'Closed', ['3', '6']),
  ],
  now: NOW,
});

const resolvedFacts: SlaFacts = {
  created: '2024-01-01T09:00:00.000+0000',
  resolutionDate: '2024-01-03T12:00:00.000+0000',
  dueDate: '2024-01-03',
  segments,
  now: NOW,
  categoryOf: () => undefined,
};

const openFacts: SlaFacts = { ...resolvedFacts, resolutionDate: undefined, dueDate: undefined };

describe('workingMinutes', () => {
  it('skips weekends and time outside working hours', () => {
    // Friday 16:00 to Monday 10:00 UTC: one hour each side of the weekend.
    expect(workingMinutes(at('2024-01-05T16:00:00Z'), at('2024-01-08T10:00:00Z'), office)).toBe(120);
  });

  it('honours a Sunday-Thursday week in a non-UTC zone', () => {
    const riyadh: WorkingHours = { start: '08:00', end: '16:00', days: [7, 1, 2, 3, 4], timeZone: 'Asia/Riyadh' };
    // Thursday 12:00 to Sunday 09:00 Riyadh time (UTC+3): 4h on Thursday, 1h on Sunday.
    expect(workingMinutes(at('2024-01-04T09:00:00Z'), at('2024-01-07T06:00:00Z'), riyadh)).toBe(300);
  });

  it('keeps an eight-hour day across a daylight-saving change', () => {
    const newYork: WorkingHours = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5, 6, 7], timeZone: 'America/New_York' };
    expect(workingMinutes(at('2024-03-10T00:00:00Z'), at('2024-03-11T00:00:00Z'), newYork)).toBe(480);
  });

  it('returns 0 for an empty or reversed range', () => {
    expect(workingMinutes(at('2024-01-08T10:00:00Z'), at('2024-01-08T10:00:00Z'), office)).toBe(0);
    expect(workingMinutes(at('2024-01-08T12:00:00Z'), at('2024-01-08T10:00:00Z'), office)).toBe(0);
  });
});

describe('working hours validation', () => {
  it('accepts IANA zones and rejects unknown ones', () => {
    expect(isValidTimeZone('Asia/Riyadh')).toBe(true);
    expect(workingHoursProblem({ ...office, timeZone: 'Mars/Base' })).toContain('Unknown time zone');
  });

  it('requires the day to end after it starts', () => {
    expect(workingHoursProblem({ ...office, end: '09:00' })).toBe('workingHoursEnd must be later than workingHoursStart.');
    expect(workingHoursProblem(office)).toBeUndefined();
  });

  it('measures calendar time without working hours', () => {
    expect(measureFor(undefined)).toBe(calendarMinutes);
    expect(measureFor(office)(at('2024-01-06T00:00:00Z'), at('2024-01-07T00:00:00Z'))).toBe(0);
  });
});

describe('cycle and lead time', () => {
  it('measures created to resolved', () => {
    expect(cycleTime(resolvedFacts, calendarMinutes)).toEqual({ calculated: true, valueMinutes: 3060, formatted: '2d 3h 0m' });
    expect(leadTime(resolvedFacts, calendarMinutes)).toEqual({ valueMinutes: 3060, formatted: '2d 3h 0m', isResolved: true });
  });

  it('explains why cycle time is missing and runs lead time to now for open issues', () => {
    expect(cycleTime(openFacts, calendarMinutes)).toEqual({ calculated: false, reason: 'Issue not resolved' });
    expect(cycleTime({ ...openFacts, created: undefined }, calendarMinutes)).toEqual({ calculated: false, reason: 'No created date' });
    expect(leadTime(openFacts, calendarMinutes)).toEqual({ valueMinutes: 12_420, formatted: '8d 15h 0m', isResolved: false });
  });
});

describe('timeInStatus', () => {
  it('reports minutes, share and visits per status, longest first', () => {
    const result = timeInStatus(segments, calendarMinutes);

    expect(result.totalMinutes).toBe(12_420);
    expect(result.statuses.map(({ status, valueMinutes, percentage }) => [status, valueMinutes, percentage])).toEqual([
      ['Closed', 9360, 75.36],
      ['In Progress', 1620, 13.04],
      ['Open', 1440, 11.59],
    ]);
  });

  it('returns no shares when nothing was measured', () => {
    expect(timeInStatus([], calendarMinutes)).toEqual({ statuses: [], totalMinutes: 0 });
  });
});

describe('dueDateCompliance', () => {
  it('compares resolution with the end of the due day in the resolution offset', () => {
    expect(dueDateCompliance(resolvedFacts)).toEqual({ status: 'met', marginMinutes: 719, formattedMargin: '11h 59m early' });
    // 22:00 at +03:00 is 1h59m before the end of the due day there (it would be 4h59m in UTC).
    expect(dueDateCompliance({ ...resolvedFacts, resolutionDate: '2024-01-03T22:00:00.000+0300' })).toEqual({ status: 'met', marginMinutes: 119, formattedMargin: '1h 59m early' });
  });

  it('reports a missed due date as minutes late', () => {
    expect(dueDateCompliance({ ...resolvedFacts, dueDate: '2024-01-02' })).toEqual({ status: 'missed', marginMinutes: -720, formattedMargin: '12h 0m late' });
  });

  it('flags missing inputs', () => {
    expect(dueDateCompliance(openFacts)).toEqual({ status: 'no_due_date' });
    expect(dueDateCompliance({ ...openFacts, dueDate: '2024-01-05' })).toEqual({ status: 'not_resolved' });
  });
});

describe('status categories and resolution time', () => {
  const index = statusCategoryIndex([
    { id: '3', name: 'Doing', statusCategory: { key: 'indeterminate' } },
    { id: '1', name: 'Open', statusCategory: { key: 'new' } },
    { id: '9', name: 'Broken' },
  ]);

  it('indexes categories by status id and lowercase name', () => {
    const lookup = categoryLookup(index);
    expect(lookup({ status: 'Renamed', statusId: '3' } as TimelineSegment)).toBe('indeterminate');
    expect(lookup({ status: 'OPEN' } as TimelineSegment)).toBe('new');
    expect(lookup({ status: 'Broken', statusId: '9' } as TimelineSegment)).toBeUndefined();
  });

  it('starts at the first status in the In Progress category', () => {
    expect(resolutionTime({ ...resolvedFacts, categoryOf: categoryLookup(index) }, calendarMinutes)).toEqual({
      calculated: true, valueMinutes: 1620, formatted: '1d 3h 0m',
    });
  });

  it('falls back to status names when categories are unknown', () => {
    expect(resolutionTime(resolvedFacts, calendarMinutes)).toMatchObject({ calculated: true, valueMinutes: 1620 });
    expect(resolutionTime({ ...resolvedFacts, segments: segments.filter((segment) => segment.status !== 'In Progress') }, calendarMinutes))
      .toEqual({ calculated: false, reason: "No 'In Progress' status found" });
    expect(resolutionTime(openFacts, calendarMinutes)).toEqual({ calculated: false, reason: 'Issue not resolved' });
  });
});

describe('firstResponseTime', () => {
  it('measures creation to the first transition', () => {
    expect(firstResponseTime(resolvedFacts, calendarMinutes)).toEqual({ calculated: true, valueMinutes: 1440, formatted: '1d 0h 0m', responseType: 'transition' });
  });

  it('is not calculated for an issue that never moved', () => {
    expect(firstResponseTime({ ...resolvedFacts, segments: segments.slice(0, 1) }, calendarMinutes)).toEqual({ calculated: false });
  });
});

describe('computeSlaMetrics', () => {
  it('computes only the requested metrics, once each', () => {
    const result = computeSlaMetrics(['lead_time', 'lead_time', 'due_date_compliance'], resolvedFacts, calendarMinutes);
    expect(Object.keys(result)).toEqual(['lead_time', 'due_date_compliance']);
  });

  it('knows every advertised metric', () => {
    expect(Object.keys(computeSlaMetrics([...SLA_METRICS], resolvedFacts, calendarMinutes))).toEqual([...SLA_METRICS]);
  });

  it('applies working hours to durations', () => {
    const result = computeSlaMetrics(['cycle_time'], resolvedFacts, measureFor(office));
    // Mon 09:00-17:00, Tue 09:00-17:00, Wed 09:00-12:00.
    expect(result.cycle_time).toEqual({ calculated: true, valueMinutes: 1140, formatted: '19h 0m' });
  });
});
