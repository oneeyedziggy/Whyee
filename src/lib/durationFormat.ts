import type { CategorySelectionRecord } from '../types/category';

const pad = (value: number, width = 2): string =>
  Math.floor(value).toString().padStart(width, '0');

const clockParts = (
  totalMs: number,
  splitDays: boolean,
): { days: number; hours: number; minutes: number; seconds: number } => ({
  days: splitDays ? Math.floor(totalMs / 86400000) : 0,
  hours: splitDays
    ? Math.floor(totalMs / 3600000) % 24
    : Math.floor(totalMs / 3600000),
  minutes: Math.floor(totalMs / 60000) % 60,
  seconds: Math.floor(totalMs / 1000) % 60,
});

const renderClock = (
  milliseconds: number,
  showMilliseconds: boolean,
  splitDays: boolean,
): string => {
  const total = Math.abs(milliseconds);
  const { days, hours, minutes, seconds } = clockParts(total, splitDays);
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  const withMs = showMilliseconds ? `${clock}.${pad(total % 1000, 3)}` : clock;
  return `${milliseconds < 0 ? '-' : ''}${days ? `${days}d ` : ''}${withMs}`;
};

// Timer read-out: hours keep accumulating past 24 so a long run stays one continuous count.
export const formatDuration = (
  milliseconds: number,
  showMilliseconds: boolean,
): string => renderClock(milliseconds, showMilliseconds, false);

// Statistics read-out: whole days are split off so large aggregates stay readable.
export const formatDurationValue = (
  milliseconds: number,
  showMilliseconds: boolean,
): string => renderClock(milliseconds, showMilliseconds, true);

export const formatClockTime = (
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
  showMilliseconds: boolean,
  is24Hour = true,
): string => {
  const displayHours = is24Hour ? hours : hours % 12 === 0 ? 12 : hours % 12;
  const base = `${pad(displayHours)}:${pad(minutes)}:${pad(seconds)}`;
  const withMs = showMilliseconds ? `${base}.${pad(milliseconds, 3)}` : base;
  return is24Hour ? withMs : `${withMs} ${hours < 12 ? 'AM' : 'PM'}`;
};

// Time-of-day read-out for minute-of-day series values; wraps at midnight, rounds to minutes.
export const formatMinutesOfDay = (
  minutesOfDay: number,
  is24Hour = true,
): string => {
  const total = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const displayHours = is24Hour ? hours : hours % 12 === 0 ? 12 : hours % 12;
  const base = `${pad(displayHours)}:${pad(minutes)}`;
  return is24Hour ? base : `${base} ${hours < 12 ? 'AM' : 'PM'}`;
};

export const entryDurationMs = (entry: CategorySelectionRecord): number =>
  entry.durationMsExact ?? entry.durationMs ?? 0;
