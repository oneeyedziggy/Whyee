import {
  expandNotificationSchedule,
  normalizeNotificationSchedule,
} from '../src/lib/notificationSchedule';

describe('notification schedules', () => {
  it('normalizes per-time weekdays, sorts times, and removes duplicate clock+weekday entries', () => {
    expect(
      normalizeNotificationSchedule({
        enabled: true,
        times: [
          { id: 'late', hour: 18, minute: 30, weekdays: [7, 1, 7, 0, 8] },
          { id: 'duplicate', hour: 9, minute: 0, weekdays: [1, 2] },
          { id: 'early', hour: 9, minute: 0, weekdays: [1, 2] },
        ],
      }),
    ).toEqual({
      enabled: true,
      times: [
        { id: 'duplicate', hour: 9, minute: 0, weekdays: [1, 2] },
        { id: 'late', hour: 18, minute: 30, weekdays: [1, 7] },
      ],
    });
  });

  it('migrates a legacy schedule-level weekdays array onto every time', () => {
    expect(
      normalizeNotificationSchedule({
        enabled: true,
        weekdays: [2, 5],
        times: [{ id: 'morning', hour: 8, minute: 15 }],
      }),
    ).toEqual({
      enabled: true,
      times: [{ id: 'morning', hour: 8, minute: 15, weekdays: [2, 5] }],
    });
  });

  it('compacts all weekdays into one daily request per time', () => {
    expect(
      expandNotificationSchedule({
        enabled: true,
        times: [
          {
            id: 'morning',
            hour: 8,
            minute: 15,
            weekdays: [1, 2, 3, 4, 5, 6, 7],
          },
        ],
      }),
    ).toEqual([{ timeId: 'morning', hour: 8, minute: 15 }]);
  });

  it('expands selected weekdays into weekly requests', () => {
    expect(
      expandNotificationSchedule({
        enabled: true,
        times: [{ id: 'morning', hour: 8, minute: 15, weekdays: [2, 5] }],
      }),
    ).toEqual([
      { timeId: 'morning', hour: 8, minute: 15, weekday: 2 },
      { timeId: 'morning', hour: 8, minute: 15, weekday: 5 },
    ]);
  });

  it('lets different times in the same schedule have independent weekday sets', () => {
    expect(
      expandNotificationSchedule({
        enabled: true,
        times: [
          {
            id: 'weekday-morning',
            hour: 8,
            minute: 0,
            weekdays: [2, 3, 4, 5, 6],
          },
          { id: 'weekend-morning', hour: 10, minute: 0, weekdays: [1, 7] },
        ],
      }),
    ).toEqual([
      { timeId: 'weekday-morning', hour: 8, minute: 0, weekday: 2 },
      { timeId: 'weekday-morning', hour: 8, minute: 0, weekday: 3 },
      { timeId: 'weekday-morning', hour: 8, minute: 0, weekday: 4 },
      { timeId: 'weekday-morning', hour: 8, minute: 0, weekday: 5 },
      { timeId: 'weekday-morning', hour: 8, minute: 0, weekday: 6 },
      { timeId: 'weekend-morning', hour: 10, minute: 0, weekday: 1 },
      { timeId: 'weekend-morning', hour: 10, minute: 0, weekday: 7 },
    ]);
  });
});

describe('notification schedule edge cases', () => {
  it('returns undefined for a missing schedule and coerces enabled to a boolean', () => {
    expect(normalizeNotificationSchedule(undefined)).toBeUndefined();
    expect(
      normalizeNotificationSchedule({
        enabled: 'yes' as unknown as boolean,
        times: [],
      }),
    ).toEqual({ enabled: false, times: [] });
  });

  it('drops malformed times and treats missing weekdays as none', () => {
    expect(
      normalizeNotificationSchedule({
        enabled: true,
        times: [
          { id: '', hour: 8, minute: 0, weekdays: [1] },
          { id: 'bad-hour', hour: 24, minute: 0, weekdays: [1] },
          { id: 'neg-hour', hour: -1, minute: 0, weekdays: [1] },
          { id: 'frac', hour: 8.5, minute: 0, weekdays: [1] },
          { id: 'bad-minute', hour: 8, minute: 60, weekdays: [1] },
          { id: 'neg-minute', hour: 8, minute: -1, weekdays: [1] },
          { id: 'frac-minute', hour: 8, minute: 0.5, weekdays: [1] },
          { id: 7 as unknown as string, hour: 8, minute: 0, weekdays: [1] },
          { id: 'no-days', hour: 7, minute: 0 } as never,
          { id: 'b', hour: 9, minute: 0, weekdays: [1.5, 3] },
          { id: 'a', hour: 9, minute: 0, weekdays: [4] },
          { id: 'c', hour: 9, minute: 5, weekdays: [4] },
        ],
      }),
    ).toEqual({
      enabled: true,
      times: [
        { id: 'no-days', hour: 7, minute: 0, weekdays: [] },
        { id: 'a', hour: 9, minute: 0, weekdays: [4] },
        { id: 'b', hour: 9, minute: 0, weekdays: [3] },
        { id: 'c', hour: 9, minute: 5, weekdays: [4] },
      ],
    });
  });

  it('schedules nothing when disabled, missing, or a time has no weekdays', () => {
    const times = [{ id: 'm', hour: 8, minute: 0, weekdays: [2] }];
    expect(expandNotificationSchedule({ enabled: false, times })).toEqual([]);
    expect(expandNotificationSchedule(undefined as never)).toEqual([]);
    expect(
      expandNotificationSchedule({
        enabled: true,
        times: [{ id: 'm', hour: 8, minute: 0, weekdays: [] }, ...times],
      }),
    ).toEqual([{ timeId: 'm', hour: 8, minute: 0, weekday: 2 }]);
  });
});
