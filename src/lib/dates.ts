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

export const formatHumanDateTime = (date: Date, is24Hour = true): string =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: !is24Hour,
  }).format(date);

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
