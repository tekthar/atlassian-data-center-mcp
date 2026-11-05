import {
  buildTimeline,
  calendarMinutes,
  describeTimeline,
  extractStatusTransitions,
  formatDuration,
  parseJiraDate,
  readIssueDates,
  summariseStatusTime,
} from '../../tools/analytics-timeline.js';

const at = (iso: string) => Date.parse(iso);

const history = (created: string, ...items: Array<Record<string, string>>) => ({
  created,
  author: { name: 'jdoe', displayName: 'Jane Doe' },
  items,
});

const statusItem = (from: [string, string], to: [string, string]) => ({
  field: 'status',
  fieldtype: 'jira',
  from: from[0],
  fromString: from[1],
  to: to[0],
  toString: to[1],
});

const changelog = {
  histories: [
    history('2024-01-03T12:00:00.000+0000', statusItem(['3', 'In Progress'], ['6', 'Closed'])),
    history('2024-01-01T12:00:00.000+0300', { field: 'assignee', fromString: '', toString: 'Jane Doe' }),
    history('2024-01-02T09:00:00.000+0000', statusItem(['1', 'Open'], ['3', 'In Progress'])),
  ],
};

describe('parseJiraDate', () => {
  it('accepts the +0300 offsets Jira DC sends', () => {
    expect(parseJiraDate('2024-01-15T10:30:00.000+0300')).toBe(at('2024-01-15T07:30:00.000Z'));
  });

  it('reads date-only values as UTC midnight', () => {
    expect(parseJiraDate('2024-01-20')).toBe(at('2024-01-20T00:00:00.000Z'));
  });

  it('returns undefined for missing or invalid values', () => {
    expect(parseJiraDate(undefined)).toBeUndefined();
    expect(parseJiraDate('')).toBeUndefined();
    expect(parseJiraDate('not a date')).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [-5, '0m'],
    [59, '59m'],
    [90, '1h 30m'],
    [1440, '1d 0h 0m'],
    [1500, '1d 1h 0m'],
  ])('formats %d minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('calendarMinutes', () => {
  it('floors to whole minutes and never goes negative', () => {
    expect(calendarMinutes(0, 119_999)).toBe(1);
    expect(calendarMinutes(60_000, 0)).toBe(0);
  });
});

describe('extractStatusTransitions', () => {
  it('keeps only status items, oldest first, with ids and author', () => {
    const transitions = extractStatusTransitions(changelog);

    expect(transitions.map((transition) => transition.toStatus)).toEqual(['In Progress', 'Closed']);
    expect(transitions[0]).toEqual({
      fromStatus: 'Open',
      fromId: '1',
      toStatus: 'In Progress',
      toId: '3',
      at: '2024-01-02T09:00:00.000+0000',
      atMs: at('2024-01-02T09:00:00.000Z'),
      by: 'Jane Doe',
    });
  });

  it('copes with a missing changelog', () => {
    expect(extractStatusTransitions(undefined)).toEqual([]);
  });
});

describe('buildTimeline and describeTimeline', () => {
  const now = at('2024-01-10T00:00:00.000Z');

  it('starts with the status the issue was created in and measures the current stay up to now', () => {
    const segments = buildTimeline({ created: '2024-01-01T09:00:00.000+0000', transitions: extractStatusTransitions(changelog), now });

    expect(describeTimeline(segments)).toEqual([
      { status: 'Open', enteredAt: '2024-01-01T09:00:00.000+0000', exitedAt: '2024-01-02T09:00:00.000+0000', durationMinutes: 1440, durationFormatted: '1d 0h 0m' },
      {
        status: 'In Progress', enteredAt: '2024-01-02T09:00:00.000+0000', exitedAt: '2024-01-03T12:00:00.000+0000',
        durationMinutes: 1620, durationFormatted: '1d 3h 0m', transitionedBy: 'Jane Doe',
      },
      {
        status: 'Closed', enteredAt: '2024-01-03T12:00:00.000+0000', exitedAt: null,
        durationMinutes: 9360, durationFormatted: '6d 12h 0m', ongoing: true, transitionedBy: 'Jane Doe',
      },
    ]);
    expect(segments.map((segment) => segment.fromCreation)).toEqual([true, false, false]);
    expect(segments.map((segment) => segment.statusId)).toEqual(['1', '3', '6']);
  });

  it('gives an issue that never transitioned its current status since creation', () => {
    const segments = buildTimeline({ created: '2024-01-09T00:00:00.000+0000', currentStatus: 'Open', currentStatusId: '1', transitions: [], now });

    expect(describeTimeline(segments)).toEqual([
      { status: 'Open', enteredAt: '2024-01-09T00:00:00.000+0000', exitedAt: null, durationMinutes: 1440, durationFormatted: '1d 0h 0m', ongoing: true },
    ]);
  });

  it('uses the supplied measure for durations', () => {
    const segments = buildTimeline({ created: '2024-01-09T00:00:00.000+0000', currentStatus: 'Open', transitions: [], now });

    expect(describeTimeline(segments, () => 7)[0].durationMinutes).toBe(7);
  });
});

describe('summariseStatusTime', () => {
  it('adds up repeat visits and sorts by total time', () => {
    const summary = summariseStatusTime([
      { status: 'Open', enteredAt: '', exitedAt: '', durationMinutes: 30, durationFormatted: '' },
      { status: 'In Progress', enteredAt: '', exitedAt: '', durationMinutes: 50, durationFormatted: '' },
      { status: 'Open', enteredAt: '', exitedAt: null, durationMinutes: 40, durationFormatted: '', ongoing: true },
    ]);

    expect(summary).toEqual([
      { status: 'Open', totalMinutes: 70, totalFormatted: '1h 10m', visitCount: 2 },
      { status: 'In Progress', totalMinutes: 50, totalFormatted: '50m', visitCount: 1 },
    ]);
  });
});

describe('readIssueDates', () => {
  it('reads dates, the current status and transitions from a raw issue', () => {
    const facts = readIssueDates({
      key: 'ACS-1',
      fields: {
        created: '2024-01-01T09:00:00.000+0000',
        updated: '2024-01-03T12:00:00.000+0000',
        duedate: null,
        resolutiondate: '2024-01-03T12:00:00.000+0000',
        status: { id: '6', name: 'Closed' },
      },
      changelog,
    });

    expect(facts).toMatchObject({
      created: '2024-01-01T09:00:00.000+0000',
      updated: '2024-01-03T12:00:00.000+0000',
      dueDate: undefined,
      resolutionDate: '2024-01-03T12:00:00.000+0000',
      currentStatus: 'Closed',
      currentStatusId: '6',
    });
    expect(facts.transitions).toHaveLength(2);
  });
});
