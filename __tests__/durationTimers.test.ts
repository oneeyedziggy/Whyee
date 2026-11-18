import {
  applyDurationPrecision,
  editDurationStartTime,
  editDurationStopTime,
  findCarryoverTimers,
  getCompletedDurationIntervals,
  getDurationEditBounds,
  getDurationIntervals,
  getLocalDayBounds,
  getOldestRunningTimerByCategory,
  intervalOverlapsDate,
  resolveRolloverDate,
  resumeDurationRecord,
  splitIntervalHoursByLocalDate,
  stopDurationRecord,
  syncLocalTimeToStart,
} from '../src/lib/durationTimers';
import { createDefaultCategory } from '../src/lib/category';
import type { CategorySelectionRecord } from '../src/types/category';

const makeRecord = (
  overrides: Partial<CategorySelectionRecord> = {},
): CategorySelectionRecord => ({
  key: '2026-03-01:0:timer',
  categoryId: 'timer',
  dateKey: '2026-03-01',
  ordinal: 0,
  localTime: '23:00:00',
  value: 0,
  ...overrides,
});

describe('duration timer helpers', () => {
  it('keeps localTime matched to the first period start across stop and edits', () => {
    const localStart = (hour: number, minute = 0) =>
      new Date(2026, 2, 1, hour, minute);
    const started = makeRecord({ startTime: localStart(9, 30).toISOString() });
    const stopped = stopDurationRecord(started, localStart(10), false);
    expect(stopped?.localTime).toBe('09:30:00');

    const editedWithRuns = editDurationStartTime(
      stopped!,
      localStart(8, 15),
      false,
    );
    expect(editedWithRuns?.localTime).toBe('08:15:00');

    // Editing the start of a not-yet-stopped record also moves the stamp.
    const bare = makeRecord({ startTime: localStart(9).toISOString() });
    const edited = editDurationStartTime(bare, localStart(7, 5), false);
    expect(edited?.localTime).toBe('07:05:00');

    // Records without a parseable start, or already in sync, pass through unchanged.
    const unparseable = makeRecord({ startTime: 'bogus' });
    expect(syncLocalTimeToStart(unparseable)).toBe(unparseable);
    const synced = makeRecord({
      localTime: '09:00:00',
      startTime: localStart(9).toISOString(),
    });
    expect(syncLocalTimeToStart(synced)).toBe(synced);
  });
  it.each([
    ['without a gap', '2026-03-02T00:30:00.000Z'],
    ['with a gap', '2026-03-02T02:00:00.000Z'],
  ])('resumes %s using the edited stop instead of stale banked history', (_mode, resumedAt) => {
    const record = makeRecord({
      startTime: '2026-03-01T23:00:00.000Z',
      stopTime: '2026-03-02T00:30:00.000Z',
      stopDateManual: true,
      durationRuns: [
        {
          startTime: '2026-03-01T20:00:00.000Z',
          stopTime: '2026-03-01T21:00:00.000Z',
          durationMs: 3600000,
        },
        {
          startTime: '2026-03-01T23:00:00.000Z',
          stopTime: '2026-03-02T01:00:00.000Z',
          durationMs: 7200000,
        },
      ],
    });
    const resumed = resumeDurationRecord(record, new Date(resumedAt), true);

    expect(resumed).toMatchObject({
      startTime: resumedAt,
      durationMsExact: 9000000,
      durationMs: 9000000,
      value: 9000000,
    });
    expect(resumed?.stopTime).toBeUndefined();
    expect(resumed?.stopDateManual).toBeUndefined();
    expect(resumed?.durationRuns?.[0]).toEqual(record.durationRuns?.[0]);
    expect(resumed?.durationRuns?.[1]).toMatchObject({
      stopTime: record.stopTime,
      durationMs: 5400000,
    });
    const stopped = stopDurationRecord(
      resumed!,
      new Date('2026-03-02T03:00:00.000Z'),
      true,
    );
    expect(stopped?.durationMsExact).toBe(
      9000000 + Date.parse('2026-03-02T03:00:00.000Z') - Date.parse(resumedAt),
    );
  });

  it('stops an active timer and banks its interval', () => {
    const record = makeRecord({ startTime: '2026-03-01T23:00:00.000Z' });
    const stopped = stopDurationRecord(
      record,
      new Date('2026-03-02T01:00:00.000Z'),
      true,
    );

    expect(stopped).toMatchObject({
      key: record.key,
      dateKey: record.dateKey,
      durationMsExact: 7200000,
      durationMs: 7200000,
      value: 7200000,
      durationRuns: [
        {
          startTime: '2026-03-01T23:00:00.000Z',
          stopTime: '2026-03-02T01:00:00.000Z',
          durationMs: 7200000,
        },
      ],
    });
  });

  it('counts a 19:00 start to 06:00 the following local day as eleven hours', () => {
    const start = new Date(2026, 2, 1, 19, 0, 0);
    const stop = new Date(2026, 2, 2, 6, 0, 0);
    const stopped = stopDurationRecord(
      makeRecord({ startTime: start.toISOString() }),
      stop,
      false,
    );

    expect(stopped?.durationMs).toBe(11 * 60 * 60 * 1000);
  });

  it('updates the latest banked run when its stop time is corrected', () => {
    const record = makeRecord({
      startTime: '2026-03-01T23:00:00.000Z',
      stopTime: '2026-03-02T01:00:00.000Z',
      durationRuns: [
        {
          startTime: '2026-03-01T20:00:00.000Z',
          stopTime: '2026-03-01T21:00:00.000Z',
          durationMs: 3600000,
        },
        {
          startTime: '2026-03-01T23:00:00.000Z',
          stopTime: '2026-03-02T01:00:00.000Z',
          durationMs: 7200000,
        },
      ],
    });
    const edited = editDurationStopTime(
      record,
      new Date('2026-03-01T23:30:00.000Z'),
      true,
    );

    expect(edited?.durationRuns?.[0].durationMs).toBe(3600000);
    expect(edited?.durationRuns?.[1]).toMatchObject({
      stopTime: '2026-03-01T23:30:00.000Z',
      durationMs: 1800000,
    });
    expect(edited?.durationMsExact).toBe(5400000);
  });

  it('updates the first banked run when the overall start time is corrected', () => {
    const record = makeRecord({
      startTime: '2026-03-01T23:00:00.000Z',
      stopTime: '2026-03-02T01:00:00.000Z',
      durationRuns: [
        {
          startTime: '2026-03-01T20:00:00.000Z',
          stopTime: '2026-03-01T21:00:00.000Z',
          durationMs: 3600000,
        },
        {
          startTime: '2026-03-01T23:00:00.000Z',
          stopTime: '2026-03-02T01:00:00.000Z',
          durationMs: 7200000,
        },
      ],
    });
    const edited = editDurationStartTime(
      record,
      new Date('2026-03-01T19:00:00.000Z'),
      true,
    );

    // The record stamp belongs to the resumed run, so only the first run moves.
    expect(edited?.startTime).toBe('2026-03-01T23:00:00.000Z');
    expect(edited?.durationRuns?.[0]).toMatchObject({
      startTime: '2026-03-01T19:00:00.000Z',
      durationMs: 7200000,
    });
    expect(edited?.durationRuns?.[1].durationMs).toBe(7200000);
    expect(edited?.durationMsExact).toBe(14400000);
    expect(edited?.value).toBe(14400000);
  });

  it('moves the first run and leaves the resumed lap stamp alone while running', () => {
    const record = makeRecord({
      startTime: '2026-03-02T00:00:00.000Z',
      durationRuns: [
        {
          startTime: '2026-03-01T20:00:00.000Z',
          stopTime: '2026-03-01T21:00:00.000Z',
          durationMs: 3600000,
        },
      ],
    });
    const edited = editDurationStartTime(
      record,
      new Date('2026-03-01T19:00:00.000Z'),
      true,
    );

    expect(edited?.startTime).toBe('2026-03-02T00:00:00.000Z');
    expect(edited?.durationRuns?.[0]).toMatchObject({
      startTime: '2026-03-01T19:00:00.000Z',
      durationMs: 7200000,
    });
  });

  it('moves the stamp when a never-resumed timer start is edited', () => {
    const record = makeRecord({ startTime: '2026-03-02T00:00:00.000Z' });

    expect(
      editDurationStartTime(record, new Date('2026-03-01T23:00:00.000Z'), true)
        ?.startTime,
    ).toBe('2026-03-01T23:00:00.000Z');
  });

  it('rejects a start time later than the stop time', () => {
    const record = makeRecord({
      startTime: '2026-03-01T23:00:00.000Z',
      stopTime: '2026-03-02T01:00:00.000Z',
    });

    expect(
      editDurationStartTime(record, new Date('2026-03-02T02:00:00.000Z'), true),
    ).toBeNull();
  });

  it('adds an active interval after completed cumulative runs', () => {
    const record = makeRecord({
      startTime: '2026-03-02T00:00:00.000Z',
      durationRuns: [
        {
          startTime: '2026-03-01T20:00:00.000Z',
          stopTime: '2026-03-01T21:00:00.000Z',
          durationMs: 3600000,
        },
      ],
    });

    expect(
      getDurationIntervals(record, Date.parse('2026-03-02T02:00:00.000Z')),
    ).toHaveLength(2);
  });

  it('appends an active cumulative run when a stop time is entered', () => {
    const record = makeRecord({
      startTime: '2026-03-02T00:00:00.000Z',
      durationRuns: [
        {
          startTime: '2026-03-01T20:00:00.000Z',
          stopTime: '2026-03-01T21:00:00.000Z',
          durationMs: 3600000,
        },
      ],
    });
    const edited = editDurationStopTime(
      record,
      new Date('2026-03-02T02:00:00.000Z'),
      true,
    );

    expect(edited?.durationRuns).toHaveLength(2);
    expect(edited?.durationMsExact).toBe(10800000);
  });

  it('finds selected-day carryovers and retains stopped overlaps', () => {
    const category = createDefaultCategory('duration', 0);
    category.id = 'timer';
    const runningStart = new Date(2026, 2, 1, 23, 0, 0);
    const stoppedStart = new Date(2026, 2, 1, 22, 0, 0);
    const stoppedAt = new Date(2026, 2, 2, 1, 0, 0);
    const asOf = new Date(2026, 2, 2, 2, 0, 0);
    const running = makeRecord({ startTime: runningStart.toISOString() });
    const stopped = makeRecord({
      key: '2026-03-01:1:timer',
      ordinal: 1,
      startTime: stoppedStart.toISOString(),
      stopTime: stoppedAt.toISOString(),
    });

    expect(
      findCarryoverTimers(
        { running, stopped },
        [category],
        '2026-03-02',
        asOf.getTime(),
      ).map((record) => record.key),
    ).toEqual([stopped.key, running.key]);
    expect(
      findCarryoverTimers(
        { running, stopped },
        [category],
        '2026-03-03',
        asOf.getTime(),
      ),
    ).toEqual([]);
  });

  it('selects only the oldest running timer for each category', () => {
    const older = makeRecord({ startTime: '2026-03-01T20:00:00.000Z' });
    const newer = makeRecord({
      key: '2026-03-01:1:timer',
      ordinal: 1,
      startTime: '2026-03-01T21:00:00.000Z',
    });

    expect(getOldestRunningTimerByCategory({ older, newer }).get('timer')).toBe(
      older,
    );
  });

  it('splits a spanning interval into hours per local date', () => {
    const start = new Date(2026, 2, 1, 22, 0, 0);
    const stop = new Date(2026, 2, 2, 2, 0, 0);

    expect(
      Object.fromEntries(
        splitIntervalHoursByLocalDate({
          startTime: start.toISOString(),
          stopTime: stop.toISOString(),
          durationMs: stop.getTime() - start.getTime(),
        }),
      ),
    ).toEqual({ '2026-03-01': 2, '2026-03-02': 2 });
  });

  it('emits nothing when a corrected stop remains on the start date', () => {
    const start = new Date(2026, 2, 1, 20, 0, 0);
    const stop = new Date(2026, 2, 1, 23, 0, 0);
    expect(
      splitIntervalHoursByLocalDate({
        startTime: start.toISOString(),
        stopTime: stop.toISOString(),
        durationMs: stop.getTime() - start.getTime(),
      }).size,
    ).toBe(0);
  });
});

describe('duration timer edge cases', () => {
  const iso = (value: Date) => value.toISOString();
  const run = (startTime: string, stopTime: string) => ({
    startTime,
    stopTime,
    durationMs: Date.parse(stopTime) - Date.parse(startTime),
  });

  it('rounds to whole seconds unless milliseconds are shown', () => {
    expect(applyDurationPrecision(1499, false)).toBe(1000);
    expect(applyDurationPrecision(1500, false)).toBe(2000);
    expect(applyDurationPrecision(1499, true)).toBe(1499);
  });

  describe('resolveRolloverDate', () => {
    const base = new Date(2026, 2, 1, 22, 0, 0);
    const time = { hours: 1, minutes: 30, seconds: 0, milliseconds: 0 };

    it('keeps the same day when the time already satisfies the bounds', () => {
      expect(
        resolveRolloverDate(base, { ...time, hours: 23 }, {
          minTimestamp: base.getTime(),
        }),
      ).toEqual(new Date(2026, 2, 1, 23, 30));
      expect(resolveRolloverDate(base, time, {})).toEqual(
        new Date(2026, 2, 1, 1, 30),
      );
    });

    it('rolls an earlier time onto the next day', () => {
      expect(
        resolveRolloverDate(base, time, { minTimestamp: base.getTime() }),
      ).toEqual(new Date(2026, 2, 2, 1, 30));
    });

    it('returns null when neither day fits the bounds', () => {
      expect(
        resolveRolloverDate(base, time, {
          minTimestamp: base.getTime(),
          maxTimestamp: new Date(2026, 2, 2, 0, 0).getTime(),
        }),
      ).toBeNull();
      expect(
        resolveRolloverDate(base, time, {
          maxTimestamp: new Date(2026, 2, 1, 0, 0).getTime(),
        }),
      ).toBeNull();
    });
  });

  it('ignores missing, unparseable, or inverted stamps when listing intervals', () => {
    expect(getCompletedDurationIntervals(makeRecord())).toEqual([]);
    expect(
      getCompletedDurationIntervals(
        makeRecord({ startTime: 'garbage', stopTime: '2026-03-01T01:00:00Z' }),
      ),
    ).toEqual([]);
    expect(
      getCompletedDurationIntervals(
        makeRecord({
          startTime: '2026-03-01T02:00:00.000Z',
          stopTime: '2026-03-01T01:00:00.000Z',
        }),
      ),
    ).toEqual([]);
  });

  it('only adds a live interval for a started timer that has begun by asOf', () => {
    const start = Date.parse('2026-03-01T10:00:00.000Z');
    const running = makeRecord({ startTime: new Date(start).toISOString() });
    expect(getDurationIntervals(running, start - 1)).toEqual([]);
    expect(getDurationIntervals(makeRecord(), start)).toEqual([]);
    expect(getDurationIntervals(running, start + 5000)).toEqual([
      {
        startTime: '2026-03-01T10:00:00.000Z',
        stopTime: '2026-03-01T10:00:05.000Z',
        durationMs: 5000,
      },
    ]);
  });

  it('measures a running timer up to now by default', () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-03-01T10:01:00.000Z'));
    try {
      const running = makeRecord({ startTime: '2026-03-01T10:00:00.000Z' });
      expect(getDurationIntervals(running)[0].durationMs).toBe(60000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to stop without a start, with an invalid stop, or before the start', () => {
    const running = makeRecord({ startTime: '2026-03-01T10:00:00.000Z' });
    expect(
      stopDurationRecord(makeRecord(), new Date('2026-03-01T11:00:00Z'), true),
    ).toBeNull();
    expect(stopDurationRecord(running, new Date('nope'), true)).toBeNull();
    expect(
      stopDurationRecord(running, new Date('2026-03-01T09:00:00Z'), true),
    ).toBeNull();
  });

  it('stores display-precision totals while keeping the exact duration', () => {
    const stopped = stopDurationRecord(
      makeRecord({ startTime: '2026-03-01T10:00:00.000Z', stopDateManual: true }),
      new Date('2026-03-01T10:00:01.600Z'),
      false,
    );
    expect(stopped).toMatchObject({
      durationMsExact: 1600,
      durationMs: 2000,
      value: 2000,
      stopTime: '2026-03-01T10:00:01.600Z',
    });
    expect(stopped?.stopDateManual).toBeUndefined();
  });

  it('refuses to resume a timer that is not stopped or has no valid history', () => {
    const resumeAt = new Date('2026-03-01T12:00:00Z');
    expect(
      resumeDurationRecord(
        makeRecord({ startTime: '2026-03-01T10:00:00Z' }),
        resumeAt,
        true,
      ),
    ).toBeNull();
    expect(
      resumeDurationRecord(
        makeRecord({
          startTime: '2026-03-01T10:00:00Z',
          stopTime: '2026-03-01T11:00:00Z',
        }),
        new Date('nope'),
        true,
      ),
    ).toBeNull();
    expect(
      resumeDurationRecord(
        makeRecord({ stopTime: '2026-03-01T11:00:00Z' }),
        resumeAt,
        true,
      ),
    ).toBeNull();
  });

  it('reports edit bounds from banked runs or the record stamps', () => {
    const first = run('2026-03-01T08:00:00.000Z', '2026-03-01T09:00:00.000Z');
    const last = run('2026-03-01T10:00:00.000Z', '2026-03-01T11:00:00.000Z');
    expect(
      getDurationEditBounds(
        makeRecord({
          startTime: last.startTime,
          stopTime: last.stopTime,
          durationRuns: [first, last],
        }),
      ),
    ).toEqual({
      startTime: first.startTime,
      startMax: first.stopTime,
      stopMin: last.startTime,
    });
    expect(
      getDurationEditBounds(
        makeRecord({ startTime: first.startTime, stopTime: first.stopTime }),
      ),
    ).toEqual({
      startTime: first.startTime,
      startMax: first.stopTime,
      stopMin: first.startTime,
    });
    expect(getDurationEditBounds(makeRecord())).toEqual({
      startTime: undefined,
      startMax: undefined,
      stopMin: undefined,
    });
  });

  describe('editDurationStartTime', () => {
    it('rejects invalid dates', () => {
      expect(
        editDurationStartTime(
          makeRecord({ startTime: '2026-03-01T10:00:00Z' }),
          new Date('nope'),
          true,
        ),
      ).toBeNull();
    });

    it('rejects a start after a stop that never produced a valid interval', () => {
      const broken = makeRecord({
        startTime: '2026-03-01T12:00:00.000Z',
        stopTime: '2026-03-01T11:00:00.000Z',
      });
      expect(
        editDurationStartTime(broken, new Date('2026-03-01T11:30:00Z'), true),
      ).toBeNull();
      expect(
        editDurationStartTime(broken, new Date('2026-03-01T10:30:00Z'), true),
      ).toMatchObject({ startTime: '2026-03-01T10:30:00.000Z' });
    });

    it('moves the record stamp and recomputes the total for a single stopped run', () => {
      const record = makeRecord({
        startTime: '2026-03-01T10:00:00.000Z',
        stopTime: '2026-03-01T11:00:00.000Z',
      });
      expect(
        editDurationStartTime(record, new Date('2026-03-01T09:30:00.000Z'), true),
      ).toMatchObject({
        startTime: '2026-03-01T09:30:00.000Z',
        durationMsExact: 5400000,
        durationRuns: [
          {
            startTime: '2026-03-01T09:30:00.000Z',
            stopTime: '2026-03-01T11:00:00.000Z',
            durationMs: 5400000,
          },
        ],
      });
    });
  });

  describe('editDurationStopTime', () => {
    const stopped = makeRecord({
      startTime: '2026-03-01T10:00:00.000Z',
      stopTime: '2026-03-01T11:00:00.000Z',
    });

    it('re-times a legacy stopped record without banked runs', () => {
      expect(
        editDurationStopTime(stopped, new Date('2026-03-01T12:00:00.000Z'), true),
      ).toMatchObject({
        stopTime: '2026-03-01T12:00:00.000Z',
        durationMsExact: 7200000,
        durationRuns: [
          {
            startTime: '2026-03-01T10:00:00.000Z',
            stopTime: '2026-03-01T12:00:00.000Z',
            durationMs: 7200000,
          },
        ],
      });
    });

    it('rejects stops that are invalid, before the start, or without a start', () => {
      expect(editDurationStopTime(stopped, new Date('nope'), true)).toBeNull();
      expect(
        editDurationStopTime(stopped, new Date('2026-03-01T09:00:00Z'), true),
      ).toBeNull();
      expect(
        editDurationStopTime(
          makeRecord({ stopTime: '2026-03-01T11:00:00Z' }),
          new Date('2026-03-01T12:00:00Z'),
          true,
        ),
      ).toBeNull();
    });

    it('rejects a stop that would make the last banked run negative', () => {
      const record = makeRecord({
        startTime: '2026-03-01T08:00:00.000Z',
        stopTime: '2026-03-01T11:00:00.000Z',
        durationRuns: [
          run('2026-03-01T08:00:00.000Z', '2026-03-01T09:00:00.000Z'),
          run('2026-03-01T10:00:00.000Z', '2026-03-01T11:00:00.000Z'),
        ],
      });
      expect(
        editDurationStopTime(record, new Date('2026-03-01T09:30:00Z'), true),
      ).toBeNull();
    });
  });

  describe('local day helpers', () => {
    it('returns the local midnight-to-midnight bounds', () => {
      expect(getLocalDayBounds('2026-03-01')).toEqual({
        start: new Date(2026, 2, 1).getTime(),
        end: new Date(2026, 2, 2).getTime(),
      });
    });

    it.each(['2026-3-1', 'not a date', '2026-02-30', '2026-13-01', '2026-00-10'])(
      'rejects malformed or impossible key %p',
      (dateKey) => {
        expect(getLocalDayBounds(dateKey)).toBeNull();
      },
    );

    it('detects overlap with a local day using exclusive edges', () => {
      const interval = (start: Date, stop: Date) => run(iso(start), iso(stop));
      expect(
        intervalOverlapsDate(
          interval(new Date(2026, 2, 1, 23), new Date(2026, 2, 2, 1)),
          '2026-03-02',
        ),
      ).toBe(true);
      expect(
        intervalOverlapsDate(
          interval(new Date(2026, 2, 1, 20), new Date(2026, 2, 2, 0)),
          '2026-03-02',
        ),
      ).toBe(false);
      expect(
        intervalOverlapsDate(
          interval(new Date(2026, 2, 3, 0), new Date(2026, 2, 3, 1)),
          '2026-03-02',
        ),
      ).toBe(false);
      expect(
        intervalOverlapsDate(
          interval(new Date(2026, 2, 1, 23), new Date(2026, 2, 2, 1)),
          'bad',
        ),
      ).toBe(false);
      expect(
        intervalOverlapsDate(
          { startTime: 'bad', stopTime: iso(new Date(2026, 2, 2, 1)), durationMs: 0 },
          '2026-03-02',
        ),
      ).toBe(false);
      expect(
        intervalOverlapsDate(
          { startTime: iso(new Date(2026, 2, 2, 1)), stopTime: 'bad', durationMs: 0 },
          '2026-03-02',
        ),
      ).toBe(false);
    });

    it('splits multi-day intervals and ignores invalid ones', () => {
      expect(
        Object.fromEntries(
          splitIntervalHoursByLocalDate(
            run(iso(new Date(2026, 2, 1, 23)), iso(new Date(2026, 2, 3, 1))),
          ),
        ),
      ).toEqual({ '2026-03-01': 1, '2026-03-02': 24, '2026-03-03': 1 });
      const now = iso(new Date(2026, 2, 1, 23));
      expect(splitIntervalHoursByLocalDate(run(now, now)).size).toBe(0);
      expect(
        splitIntervalHoursByLocalDate({ startTime: 'x', stopTime: now, durationMs: 0 })
          .size,
      ).toBe(0);
      expect(
        splitIntervalHoursByLocalDate({ startTime: now, stopTime: 'x', durationMs: 0 })
          .size,
      ).toBe(0);
    });
  });

  describe('findCarryoverTimers', () => {
    const timer = { ...createDefaultCategory('duration', 0), id: 'timer' };
    const other = { ...createDefaultCategory('duration', 1), id: 'other' };
    const asOf = new Date(2026, 2, 2, 3).getTime();
    const start = iso(new Date(2026, 2, 1, 22));

    it('skips disabled, non-duration, unstarted, and same-day timers', () => {
      const number = { ...createDefaultCategory('number', 2), id: 'number' };
      const records = {
        disabled: makeRecord({ key: 'd', categoryId: 'off', startTime: start }),
        number: makeRecord({ key: 'n', categoryId: 'number', startTime: start }),
        unstarted: makeRecord({ key: 'u' }),
        today: makeRecord({ key: 't', startTime: iso(new Date(2026, 2, 2, 1)) }),
      };
      expect(
        findCarryoverTimers(
          records,
          [timer, number, { ...other, id: 'off', enabled: false }],
          '2026-03-02',
          asOf,
        ),
      ).toEqual([]);
    });

    it('orders same-start carryovers by category and then ordinal', () => {
      const records = {
        b1: makeRecord({ key: 'b1', categoryId: 'timer', ordinal: 1, startTime: start }),
        a: makeRecord({ key: 'a', categoryId: 'other', ordinal: 0, startTime: start }),
        b0: makeRecord({ key: 'b0', categoryId: 'timer', ordinal: 0, startTime: start }),
      };
      expect(
        findCarryoverTimers(records, [timer, other], '2026-03-02', asOf).map(
          (record) => record.key,
        ),
      ).toEqual(['a', 'b0', 'b1']);
    });

    it('measures running timers up to now by default', () => {
      jest.useFakeTimers().setSystemTime(asOf);
      try {
        expect(
          findCarryoverTimers(
            { running: makeRecord({ startTime: start }) },
            [timer],
            '2026-03-02',
          ),
        ).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('prefers parseable starts when picking the oldest running timer', () => {
    const broken = makeRecord({ key: 'broken', startTime: 'garbage' });
    const valid = makeRecord({ key: 'valid', startTime: '2026-03-01T20:00:00.000Z' });
    const stopped = makeRecord({
      key: 'stopped',
      startTime: '2026-03-01T01:00:00.000Z',
      stopTime: '2026-03-01T02:00:00.000Z',
    });
    expect(
      getOldestRunningTimerByCategory({ broken, valid, stopped }).get('timer'),
    ).toBe(valid);
    expect(
      getOldestRunningTimerByCategory({ valid, broken }).get('timer'),
    ).toBe(valid);
  });
});
