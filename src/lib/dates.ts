const pad = (value: number): string => value.toString().padStart(2, '0');

export const getLocalDateKey = (date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getLocalTimeStamp = (date = new Date()): string =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

export const makeRecordKey = (
  dateKey: string,
  ordinal: number,
  categoryId: string,
): string => `${dateKey}:${ordinal}:${categoryId}`;

// Locale-aware, human-readable date display (device region/locale via `undefined`), preferring
// weekday + month abbreviation over bare numeric dates for anything shown to the user.
export const formatHumanDate = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

export interface TimeOfDay {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

const TIME_PATTERN =
  /^\s*(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?(?:[.,](\d{1,3}))?\s*(?:([ap])\.?\s*m?\.?)?\s*$/i;

// Tolerant of partial/unpadded input ("9", "9:5", "9:05:0 p") but strict about ranges, so callers
// can flag a bad value instead of silently coercing it while the user is still typing.
export const parseTimeOfDay = (
  value: string,
  options: { is24Hour?: boolean; fallbackMeridiem?: 'AM' | 'PM' } = {},
): TimeOfDay | null => {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const milliseconds = Number((match[4] ?? '0').padEnd(3, '0'));
  if (minutes > 59 || seconds > 59) return null;
  const typedMeridiem = match[5]
    ? match[5].toUpperCase() === 'P'
      ? 'PM'
      : 'AM'
    : undefined;
  const meridiem =
    typedMeridiem ?? (options.is24Hour ? undefined : options.fallbackMeridiem);
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
  } else if (hours > 23) return null;
  return { hours, minutes, seconds, milliseconds };
};

// Whole minutes since local midnight for a record's HH:MM[:SS] localTime; null when unparseable.
export const minutesOfDayFromTimeStamp = (
  value: string | undefined,
): number | null => {
  if (!value) return null;
  const time = parseTimeOfDay(value, { is24Hour: true });
  if (!time) return null;
  return time.hours * 60 + time.minutes;
};

// Absolute local epoch milliseconds for a record's dateKey + localTime pair; null when either
// part is unparseable.
export const localRecordTimestampMs = (
  dateKey: string,
  localTime: string | undefined,
): number | null => {
  const dayStart = Date.parse(`${dateKey}T00:00:00`);
  if (!Number.isFinite(dayStart)) return null;
  const time = localTime ? parseTimeOfDay(localTime, { is24Hour: true }) : null;
  if (!time) return null;
  return (
    dayStart +
    time.hours * 3600000 +
    time.minutes * 60000 +
    time.seconds * 1000 +
    time.milliseconds
  );
};

// Whole-calendar-day difference between two local dates (ignoring time-of-day), e.g. for
// "stop time crossed into the next day" offset labels.
export const calendarDayDiff = (from: Date, to: Date): number => {
  const fromKey = getLocalDateKey(from);
  const toKey = getLocalDateKey(to);
  return Math.round(
    (Date.parse(`${toKey}T00:00:00`) - Date.parse(`${fromKey}T00:00:00`)) /
      86400000,
  );
};

// Re-stamps the current wall-clock time-of-day onto a given local date key, so starting a timer
// while viewing a past/future date records the start against THAT date rather than today's date.
export const nowOnDateKey = (dateKey: string, reference = new Date()): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return reference;
  const result = new Date(reference);
  result.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return result;
};
