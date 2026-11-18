import { createDefaultCategory, recomputeVirtualSeries } from '../src/lib/category';
import {
  createVirtualCorrelationInput,
  describeVirtualSeries,
  numericValue,
  sortedEventTimestamps,
  timeSinceMinutes,
} from '../src/lib/virtualSeries';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
  EventTimeCategory,
  VirtualSeriesDefinition,
} from '../src/types/category';

const record = (
  overrides: Partial<CategorySelectionRecord> = {},
): CategorySelectionRecord => ({
  key: 'k',
  categoryId: 'c',
  dateKey: '2026-01-01',
  ordinal: 0,
  localTime: '09:00:00',
  value: 1,
  ...overrides,
});

const definition = (
  overrides: Partial<VirtualSeriesDefinition>,
): VirtualSeriesDefinition => ({
  id: 'c:series',
  name: 'C series',
  sourceCategoryId: 'c',
  field: 'value',
  aggregation: 'mean',
  ...overrides,
});

describe('numericValue', () => {
  it.each(['noteLength', 'noteWordCount', 'noteAverageWordLength'] as const)(
    'returns null for %p of missing or blank notes',
    (field) => {
      expect(numericValue(record(), field)).toBeNull();
      expect(numericValue(record({ noteText: '  \n ' }), field)).toBeNull();
    },
  );

  it('has no average word length for punctuation-only notes', () => {
    const punctuation = record({ noteText: '!!! ... ?' });
    expect(numericValue(punctuation, 'noteAverageWordLength')).toBeNull();
    expect(numericValue(punctuation, 'noteWordCount')).toBe(0);
    expect(numericValue(record({ noteText: 'ab abcd' }), 'noteAverageWordLength')).toBe(3);
  });

  it('scores missing note text as neutral sentiment', () => {
    expect(numericValue(record(), 'noteText', 'sentimentScore')).toBe(0);
    expect(
      numericValue(record({ sentimentScore: 0.5 }), 'noteText', 'sentimentScore'),
    ).toBe(0.5);
  });

  it('returns null for missing durations and missing or invalid timestamps', () => {
    expect(numericValue(record(), 'durationMs')).toBeNull();
    expect(numericValue(record({ durationMs: 0 }), 'durationMs')).toBe(0);
    expect(numericValue(record(), 'startTime')).toBeNull();
    expect(numericValue(record({ stopTime: 'not a date' }), 'stopTime')).toBeNull();
    const start = new Date(2026, 0, 1, 1, 2, 3, 4).toISOString();
    expect(numericValue(record({ startTime: start }), 'startTime')).toBe(3723004);
  });

  it('derives event minutes, hours, and dayparts from the entry time', () => {
    const at = (localTime: string) => record({ localTime });
    expect(numericValue(at('13:45:10'), 'eventMinuteOfDay')).toBe(825);
    expect(numericValue(at('bogus'), 'eventMinuteOfDay')).toBeNull();
    expect(numericValue(at('13:45:10'), 'eventHourOfDay', undefined, 13)).toBe(1);
    expect(numericValue(at('13:45:10'), 'eventHourOfDay', undefined, 12)).toBe(0);
    expect(numericValue(at('00:00:00'), 'eventHourOfDay', undefined, 0)).toBe(1);
    expect(numericValue(at('bogus'), 'eventHourOfDay', undefined, 0)).toBeNull();
    expect(numericValue(at('05:59:59'), 'eventDaypart', undefined, 0)).toBe(1);
    expect(numericValue(at('06:00:00'), 'eventDaypart', undefined, 1)).toBe(1);
    expect(numericValue(at('12:00:00'), 'eventDaypart', undefined, 2)).toBe(1);
    expect(numericValue(at('23:59:00'), 'eventDaypart', undefined, 3)).toBe(1);
    expect(numericValue(at('23:59:00'), 'eventDaypart', undefined, 0)).toBe(0);
  });

  it('cannot compute time-since without the source records', () => {
    expect(numericValue(record(), 'timeSinceCategory')).toBeNull();
  });
});

describe('time since sources', () => {
  const stamps = sortedEventTimestamps([
    record({ dateKey: '2026-01-02', localTime: '08:00:00' }),
    record({ dateKey: '2026-01-01', localTime: '20:00:00' }),
    record({ dateKey: '2026-01-01', localTime: 'bogus' }),
  ]);

  it('sorts source timestamps and drops unreadable ones', () => {
    expect(stamps).toEqual([
      new Date(2026, 0, 1, 20).getTime(),
      new Date(2026, 0, 2, 8).getTime(),
    ]);
  });

  it('expands duration source records into one timestamp per recorded period', () => {
    const runStart = (hour: number) => new Date(2026, 0, 1, hour).toISOString();
    expect(
      sortedEventTimestamps([
        record({
          dateKey: '2026-01-01',
          localTime: '23:00:00',
          startTime: runStart(8),
          durationRuns: [
            { startTime: runStart(8), stopTime: runStart(9), durationMs: 3600000 },
            { startTime: runStart(5), stopTime: runStart(6), durationMs: 3600000 },
          ],
        }),
      ]),
    ).toEqual([
      new Date(2026, 0, 1, 5).getTime(),
      new Date(2026, 0, 1, 8).getTime(),
    ]);
  });

  it('measures minutes since the latest prior source entry across days', () => {
    expect(
      timeSinceMinutes(
        record({ dateKey: '2026-01-02', localTime: '09:30:00' }),
        stamps,
      ),
    ).toEqual([90]);
    expect(
      timeSinceMinutes(
        record({ dateKey: '2026-01-02', localTime: '07:00:00' }),
        stamps,
      ),
    ).toEqual([660]);
    // A simultaneous source entry counts as zero elapsed minutes.
    expect(
      timeSinceMinutes(
        record({ dateKey: '2026-01-01', localTime: '20:00:00' }),
        stamps,
      ),
    ).toEqual([0]);
  });

  it('omits anchors before the first source entry or with unreadable times', () => {
    expect(
      timeSinceMinutes(
        record({ dateKey: '2026-01-01', localTime: '10:00:00' }),
        stamps,
      ),
    ).toEqual([]);
    expect(timeSinceMinutes(record({ localTime: 'bogus' }), stamps)).toEqual([]);
  });

  it('anchors duration records at each recorded period start', () => {
    const start = (hour: number, minute = 0) =>
      new Date(2026, 0, 2, hour, minute).toISOString();
    // Single-period record: the start time wins over localTime.
    expect(
      timeSinceMinutes(
        record({
          dateKey: '2026-01-02',
          localTime: '23:00:00',
          startTime: start(9, 30),
          stopTime: start(10),
        }),
        stamps,
      ),
    ).toEqual([90]);
    // Multi-run record: one value per run; runs before the first source entry drop out.
    expect(
      timeSinceMinutes(
        record({
          dateKey: '2026-01-02',
          localTime: '23:00:00',
          startTime: start(9),
          durationRuns: [
            { startTime: start(9), stopTime: start(9, 15), durationMs: 900000 },
            { startTime: start(10), stopTime: start(10, 30), durationMs: 1800000 },
          ],
        }),
        stamps,
      ),
    ).toEqual([60, 120]);
    // Unparseable start times fall back to the record's own local entry time.
    expect(
      timeSinceMinutes(
        record({
          dateKey: '2026-01-02',
          localTime: '09:00:00',
          startTime: 'not a date',
        }),
        stamps,
      ),
    ).toEqual([60]);
  });
});

describe('describeVirtualSeries', () => {
  it('explains legacy inverse series', () => {
    expect(describeVirtualSeries(definition({ transform: 'inverse' }))).toMatch(
      /^Mirrors the main series/,
    );
  });

  it('names time statistics without earliest/latest wording when not min or max', () => {
    expect(
      describeVirtualSeries(
        definition({ field: 'startTime', aggregation: 'mean', group: 'Center' }),
      ),
    ).toBe("Charts the mean of each day's start times by date.");
    expect(
      describeVirtualSeries(
        definition({ field: 'stopTime', aggregation: 'max', group: 'Spread' }),
      ),
    ).toBe("Charts the latest of each day's stop times by date.");
  });

  it('describes event daypart, hour, and time-since series', () => {
    expect(
      describeVirtualSeries(
        definition({ field: 'eventDaypart', aggregation: 'max', optionValue: 1, group: 'Dayparts' }),
      ),
    ).toBe('1 on days with an event in this six-hour window, 0 otherwise.');
    expect(
      describeVirtualSeries(
        definition({ field: 'eventHourOfDay', aggregation: 'max', optionValue: 9 }),
      ),
    ).toBe('1 on days with an event in this hour, 0 otherwise.');
    expect(
      describeVirtualSeries(
        definition({ field: 'eventHourOfDay', aggregation: 'max' }),
      ),
    ).toBe(
      'Adds 24 series, one per hour of day: each is 1 on days with an event in that hour, 0 otherwise.',
    );
    expect(
      describeVirtualSeries(
        definition({
          field: 'timeSinceCategory',
          timeSinceCategoryId: 'meals',
          group: 'Time since',
        }),
      ),
    ).toMatch(/most recent prior entry in the source category/);
    expect(
      describeVirtualSeries(
        definition({ field: 'eventMinuteOfDay', aggregation: 'min', group: 'Minimum' }),
      ),
    ).toBe("Charts the earliest of each day's event times by date.");
    expect(
      describeVirtualSeries(definition({ field: 'eventMinuteOfDay' })),
    ).toBe('Charts the event time of day by date.');
  });
});

describe('event-time correlation input', () => {
  const build = (kind: 'event-time', id: string, name: string, extras: Partial<EventTimeCategory> = {}) => {
    const base = {
      ...(createDefaultCategory(kind, 0, name) as EventTimeCategory),
      id,
      allowMultiplePerDay: false,
      ...extras,
    };
    return { ...base, virtualSeries: recomputeVirtualSeries(base) };
  };
  const pain = (() => {
    const base = build('event-time', 'pain', 'Pain', {
      eventTime: { use24HourClock: true, timeSinceCategoryIds: ['meals'] },
    });
    return {
      ...base,
      // The hourly toggle defaults off; enable it to verify the 24-way fan-out values.
      virtualSeries: base.virtualSeries.map((definition) =>
        definition.id === 'pain:hours'
          ? { ...definition, enabled: true }
          : definition,
      ),
    };
  })();
  const meals = build('event-time', 'meals', 'Meals');
  const records = {
    m1: record({ key: 'm1', categoryId: 'meals', dateKey: '2026-01-01', localTime: '20:00:00' }),
    p0: record({ key: 'p0', categoryId: 'pain', dateKey: '2026-01-01', localTime: '10:00:00' }),
    p1: record({ key: 'p1', categoryId: 'pain', dateKey: '2026-01-02', localTime: '08:30:00' }),
  };
  const input = createVirtualCorrelationInput([pain, meals], records, [], false);
  const rows = (id: string) =>
    input.records
      .filter((entry) => entry.categoryId === id)
      .map((entry) => [entry.dateKey, entry.value]);

  it('emits minute-of-day, daypart, and fanned-out hourly series values', () => {
    expect(rows('pain:time')).toEqual([
      ['2026-01-01', 600],
      ['2026-01-02', 510],
    ]);
    expect(rows('pain:daypart:1')).toEqual([
      ['2026-01-01', 1],
      ['2026-01-02', 1],
    ]);
    expect(rows('pain:hours:8')).toEqual([
      ['2026-01-01', 0],
      ['2026-01-02', 1],
    ]);
    expect(rows('pain:hours:10')).toEqual([
      ['2026-01-01', 1],
      ['2026-01-02', 0],
    ]);
    expect(
      input.categories.filter((entry) => entry.id.startsWith('pain:hours:')),
    ).toHaveLength(24);
    expect(
      input.categories.find((entry) => entry.id === 'pain:hours:8')!.name,
    ).toBe('Pain at 08:00');
  });

  it('emits time-since values only for events with a prior source entry', () => {
    expect(rows('pain:since:meals')).toEqual([['2026-01-02', 750]]);
  });
});

describe('duration time-since correlation input', () => {
  const start = (hour: number) => new Date(2026, 0, 2, hour).toISOString();
  const timer = (() => {
    const base = {
      ...(createDefaultCategory('duration', 0, 'Timer') as Extract<
        CategoryDefinition,
        { kind: 'duration' }
      >),
      id: 'timer',
    };
    const configured = {
      ...base,
      duration: { ...base.duration, timeSinceCategoryIds: ['meals'] },
    };
    return {
      ...configured,
      virtualSeries: recomputeVirtualSeries(configured),
    };
  })();
  const records = {
    m1: record({
      key: 'm1',
      categoryId: 'meals',
      dateKey: '2026-01-02',
      localTime: '08:00:00',
    }),
    t1: record({
      key: 't1',
      categoryId: 'timer',
      dateKey: '2026-01-02',
      localTime: '23:00:00',
      startTime: start(9),
      stopTime: start(11),
      durationRuns: [
        { startTime: start(9), stopTime: start(10), durationMs: 3600000 },
        { startTime: start(10), stopTime: start(11), durationMs: 3600000 },
      ],
    }),
  };
  const input = createVirtualCorrelationInput([timer], records, [], false);

  it('emits one datapoint per recorded period, anchored at each run start', () => {
    // Runs start 60 and 120 minutes after the 08:00 meal; mean aggregation → 90.
    expect(
      input.records
        .filter((entry) => entry.categoryId === 'timer:since:meals')
        .map((entry) => [entry.dateKey, entry.value]),
    ).toEqual([['2026-01-02', 90]]);
  });
});

describe('describeVirtualSeries sentiment', () => {
  it('adds a privacy note to grouped sentiment series', () => {
    expect(
      describeVirtualSeries(
        definition({
          field: 'noteText',
          transform: 'sentimentScore',
          aggregation: 'median',
          group: 'Center',
        }),
      ),
    ).toBe(
      "Charts the median of each day's note sentiment scores by date. Notes are scored locally and never leave this device.",
    );
  });
});

describe('createVirtualCorrelationInput', () => {
  const number = { ...createDefaultCategory('number', 0, 'C'), id: 'c' };
  const records = {
    a: record({ key: 'a', value: 2 }),
    b: record({ key: 'b', dateKey: '2026-01-02', value: 6 }),
  };
  const valuesFor = (
    input: ReturnType<typeof createVirtualCorrelationInput>,
    id: string,
  ) =>
    input.records
      .filter((entry) => entry.categoryId === id)
      .map((entry) => entry.value);

  it('derives series from the category kind when none are stored', () => {
    const input = createVirtualCorrelationInput(
      [{ ...number, virtualSeries: [] }],
      records,
      [],
      false,
    );
    expect(input.categories.map((category) => category.id)).toEqual(['c:value']);
    expect(valuesFor(input, 'c:value')).toEqual([2, 6]);
  });

  it('emits nothing for a time-since series without a source category', () => {
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [
            definition({ id: 'c:since', field: 'timeSinceCategory' }),
          ],
        },
      ],
      records,
      [],
      false,
    );
    expect(valuesFor(input, 'c:since')).toEqual([]);
  });

  it('emits only the mirrored inverse when the base series is disabled', () => {
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [
            definition({ id: 'c:value', enabled: false, inverseEnabled: true }),
          ],
        },
      ],
      records,
      [],
      false,
    );
    expect(input.categories).toEqual([
      expect.objectContaining({ id: 'c:value:inverse', name: 'C series inverse' }),
    ]);
    expect(valuesFor(input, 'c:value:inverse')).toEqual([6, 2]);
  });

  it('groups per-instance series by ordinal when records have no instance id', () => {
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [definition({ id: 'c:instance', perInstance: true })],
        },
      ],
      {
        a: record({ key: 'a', value: 1 }),
        b: record({ key: 'b', ordinal: 1, value: 2 }),
        c: record({ key: 'c', dateKey: '2026-01-02', value: 3 }),
      },
      [],
      false,
    );
    expect(
      input.categories.map((category) => [category.id, category.name]),
    ).toEqual([
      ['c:instance:c:0', 'C series 1'],
      ['c:instance:c:1', 'C series 2'],
    ]);
    expect(valuesFor(input, 'c:instance:c:0')).toEqual([1, 3]);
  });

  it('omits the position number for legacy records without an ordinal', () => {
    const legacy = record({ key: 'a', instanceId: 'legacy' });
    delete (legacy as Partial<CategorySelectionRecord>).ordinal;
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [definition({ id: 'c:instance', perInstance: true })],
        },
      ],
      { a: legacy },
      [],
      false,
    );
    expect(input.categories).toEqual([
      expect.objectContaining({ id: 'c:instance:legacy', name: 'C series' }),
    ]);
  });
});
