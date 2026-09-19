import type { NotificationSchedule, NotificationTime } from '../types/category';

export interface NotificationRequestSpec {
  timeId: string;
  hour: number;
  minute: number;
  weekday?: number;
}

const validWeekday = (weekday: number): boolean =>
  Number.isInteger(weekday) && weekday >= 1 && weekday <= 7;

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

export const normalizeNotificationSchedule = (
  schedule: NotificationSchedule | undefined,
): NotificationSchedule | undefined => {
  if (!schedule) return undefined;
  const weekdays = [...new Set(schedule.weekdays.filter(validWeekday))].sort(
    (left, right) => left - right,
  );
  const times = [...schedule.times]
    .filter(validTime)
    .sort(timeSort)
    .filter(
      (time, index, all) =>
        index === 0 ||
        time.hour !== all[index - 1].hour ||
        time.minute !== all[index - 1].minute,
    );
  return { enabled: schedule.enabled === true, weekdays, times };
};

export const expandNotificationSchedule = (
  schedule: NotificationSchedule,
): NotificationRequestSpec[] => {
  const normalized = normalizeNotificationSchedule(schedule);
  if (!normalized?.enabled) return [];
  if (!normalized.weekdays.length || !normalized.times.length) return [];
  if (normalized.weekdays.length === 7) {
    return normalized.times.map((time) => ({
      timeId: time.id,
      hour: time.hour,
      minute: time.minute,
    }));
  }
  return normalized.weekdays.flatMap((weekday) =>
    normalized.times.map((time) => ({
      timeId: time.id,
      hour: time.hour,
      minute: time.minute,
      weekday,
    })),
  );
};

export const notificationScheduleHasMultipleTimes = (
  schedule: NotificationSchedule | undefined,
): boolean => (schedule?.times.length ?? 0) > 1;
