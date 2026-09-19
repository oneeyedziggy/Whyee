import {
  expandNotificationSchedule,
  normalizeNotificationSchedule,
} from '../src/lib/notificationSchedule';

describe('notification schedules', () => {
  it('normalizes weekdays, sorts times, and removes duplicate clock times', () => {
    expect(
      normalizeNotificationSchedule({
        enabled: true,
        weekdays: [7, 1, 7, 0, 8],
        times: [
          { id: 'late', hour: 18, minute: 30 },
          { id: 'duplicate', hour: 9, minute: 0 },
          { id: 'early', hour: 9, minute: 0 },
        ],
      }),
    ).toEqual({
      enabled: true,
      weekdays: [1, 7],
      times: [
        { id: 'duplicate', hour: 9, minute: 0 },
        { id: 'late', hour: 18, minute: 30 },
      ],
    });
  });

  it('compacts all weekdays into one daily request per time', () => {
    expect(
      expandNotificationSchedule({
        enabled: true,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        times: [{ id: 'morning', hour: 8, minute: 15 }],
      }),
    ).toEqual([{ timeId: 'morning', hour: 8, minute: 15 }]);
  });

  it('expands selected weekdays into weekly requests', () => {
    expect(
      expandNotificationSchedule({
        enabled: true,
        weekdays: [2, 5],
        times: [{ id: 'morning', hour: 8, minute: 15 }],
      }),
    ).toEqual([
      { timeId: 'morning', hour: 8, minute: 15, weekday: 2 },
      { timeId: 'morning', hour: 8, minute: 15, weekday: 5 },
    ]);
  });
});
