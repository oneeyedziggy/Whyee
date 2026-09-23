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
