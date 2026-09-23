import {
  editDurationStopTime,
  findCarryoverTimers,
  getDurationIntervals,
  getOldestRunningTimerByCategory,
  splitIntervalHoursByLocalDate,
  stopDurationRecord,
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
