import type {
  LegacyNotificationSchedule,
  NotificationSchedule,
  NotificationTime,
} from '../types/category';

export interface NotificationRequestSpec {
  timeId: string;
  hour: number;
  minute: number;
  weekday?: number;
}

const validWeekday = (weekday: number): boolean =>
  Number.isInteger(weekday) && weekday >= 1 && weekday <= 7;

const normalizeWeekdays = (weekdays: number[] | undefined): number[] =>
  [...new Set((weekdays ?? []).filter(validWeekday))].sort(
    (left, right) => left - right,
  );

const validTime = (time: NotificationTime): boolean =>
  typeof time.id === 'string' &&
  time.id.length > 0 &&
  Number.isInteger(time.hour) &&
  time.hour >= 0 &&
  time.hour <= 23 &&
  Number.isInteger(time.minute) &&
  time.minute >= 0 &&
  time.minute <= 59;

const timeSort = (left: NotificationTime, right: NotificationTime): number =>
  left.hour - right.hour ||
  left.minute - right.minute ||
  left.id.localeCompare(right.id);

const timeIdentity = (time: NotificationTime): string =>
  `${time.hour}:${time.minute}:${time.weekdays.join(',')}`;

// Accepts the legacy on-disk shape (single schedule-level `weekdays`, no per-time weekdays) and
// migrates it by copying that array onto every time entry.
export const normalizeNotificationSchedule = (
  schedule: NotificationSchedule | LegacyNotificationSchedule | undefined,
): NotificationSchedule | undefined => {
  if (!schedule) return undefined;
  const legacyWeekdays =
    'weekdays' in schedule ? normalizeWeekdays(schedule.weekdays) : undefined;
  const times = [...schedule.times]
    .map((time) => ({
      ...time,
      weekdays: normalizeWeekdays(
        'weekdays' in time ? time.weekdays : legacyWeekdays,
      ),
    }))
    .filter(validTime)
    .sort(timeSort)
    .filter(
      (time, index, all) =>
        index === 0 || timeIdentity(time) !== timeIdentity(all[index - 1]),
    );
  return { enabled: schedule.enabled === true, times };
};

export const expandNotificationSchedule = (
  schedule: NotificationSchedule | LegacyNotificationSchedule,
): NotificationRequestSpec[] => {
  const normalized = normalizeNotificationSchedule(schedule);
  if (!normalized?.enabled) return [];
  return normalized.times.flatMap((time) => {
    if (!time.weekdays.length) return [];
    if (time.weekdays.length === 7) {
      return [{ timeId: time.id, hour: time.hour, minute: time.minute }];
    }
    return time.weekdays.map((weekday) => ({
      timeId: time.id,
      hour: time.hour,
      minute: time.minute,
      weekday,
    }));
  });
};

export const notificationScheduleHasMultipleTimes = (
  schedule: NotificationSchedule | undefined,
): boolean => (schedule?.times.length ?? 0) > 1;
