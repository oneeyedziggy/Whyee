import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import { getLocalDateKey } from './dates';

export interface DurationInterval {
  startTime: string;
  stopTime: string;
  durationMs: number;
}

const parsedTime = (timestamp?: string): number | null => {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
};

export const applyDurationPrecision = (
  milliseconds: number,
  showMilliseconds: boolean,
): number =>
  showMilliseconds ? milliseconds : Math.round(milliseconds / 1000) * 1000;

// If applying a time-of-day edit to `base`'s date would violate the given bounds (typically
// because it made a stop time earlier than its start), try the same time-of-day on the next
// calendar day instead of rejecting outright — handles edits that cross midnight.
export const resolveRolloverDate = (
  base: Date,
  timeOfDay: {
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
  },
  bounds: { minTimestamp?: number; maxTimestamp?: number },
): Date | null => {
  const withinBounds = (date: Date): boolean => {
    const time = date.getTime();
    if (bounds.minTimestamp !== undefined && time < bounds.minTimestamp)
      return false;
    if (bounds.maxTimestamp !== undefined && time > bounds.maxTimestamp)
      return false;
    return true;
  };
  const candidate = new Date(base);
  candidate.setHours(
    timeOfDay.hours,
    timeOfDay.minutes,
    timeOfDay.seconds,
    timeOfDay.milliseconds,
  );
  if (withinBounds(candidate)) return candidate;
  const nextDay = new Date(candidate);
  nextDay.setDate(nextDay.getDate() + 1);
  return withinBounds(nextDay) ? nextDay : null;
};

export const getCompletedDurationIntervals = (
  record: CategorySelectionRecord,
): DurationInterval[] => {
  if (record.durationRuns?.length) return record.durationRuns;
  const startMs = parsedTime(record.startTime);
  const stopMs = parsedTime(record.stopTime);
  if (startMs === null || stopMs === null || stopMs < startMs) return [];
  return [
    {
      startTime: record.startTime!,
      stopTime: record.stopTime!,
      durationMs: stopMs - startMs,
    },
  ];
};

export const getDurationIntervals = (
  record: CategorySelectionRecord,
  asOf = Date.now(),
): DurationInterval[] => {
  const completed = getCompletedDurationIntervals(record);
  if (record.stopTime) return completed;
  const startMs = parsedTime(record.startTime);
  if (startMs === null || asOf < startMs) return completed;
  return [
    ...completed,
    {
      startTime: record.startTime!,
      stopTime: new Date(asOf).toISOString(),
      durationMs: asOf - startMs,
    },
  ];
};

const withDurationTotal = (
  record: CategorySelectionRecord,
  durationRuns: DurationInterval[],
  showMilliseconds: boolean,
): CategorySelectionRecord => {
  const exact = durationRuns.reduce((sum, run) => sum + run.durationMs, 0);
  const stored = applyDurationPrecision(exact, showMilliseconds);
  return {
    ...record,
    durationRuns,
    durationMsExact: exact,
    durationMs: stored,
    value: stored,
  };
};

export const stopDurationRecord = (
  record: CategorySelectionRecord,
  stoppedAt: Date,
  showMilliseconds: boolean,
): CategorySelectionRecord | null => {
  const startMs = parsedTime(record.startTime);
  const stopMs = stoppedAt.getTime();
  if (startMs === null || !Number.isFinite(stopMs) || stopMs < startMs)
    return null;
  const stopTime = stoppedAt.toISOString();
  return withDurationTotal(
    {
      ...record,
      stopTime,
      stopDateManual: undefined,
    },
    [
      ...getCompletedDurationIntervals({ ...record, stopTime: undefined }),
      {
        startTime: record.startTime!,
        stopTime,
        durationMs: stopMs - startMs,
      },
    ],
    showMilliseconds,
  );
};

// The visible stop is authoritative, including when a saved run still has its old stop.
export const resumeDurationRecord = (
  record: CategorySelectionRecord,
  resumedAt: Date,
  showMilliseconds: boolean,
): CategorySelectionRecord | null => {
  const stopMs = parsedTime(record.stopTime);
  if (stopMs === null || !Number.isFinite(resumedAt.getTime())) return null;
  const completed = editDurationStopTime(
    record,
    new Date(stopMs),
    showMilliseconds,
  );
  if (!completed) return null;
  return {
    ...completed,
    startTime: resumedAt.toISOString(),
    stopTime: undefined,
    stopDateManual: undefined,
  };
};

// Start/stop editors address the interval as a whole: after a stop-and-resume the visible start
// is still the first banked run, and each end of the range is bounded by the run it belongs to.
export const getDurationEditBounds = (
  record: CategorySelectionRecord,
): { startTime?: string; startMax?: string; stopMin?: string } => {
  const runs = record.durationRuns ?? [];
  return {
    startTime: runs[0]?.startTime ?? record.startTime,
    startMax: runs[0]?.stopTime ?? record.stopTime,
    stopMin: runs.length ? runs[runs.length - 1].startTime : record.startTime,
  };
};

// Edits the interval's OVERALL start, which is the first banked run once a timer has been
// stopped and resumed; the record stamp only moves when it still points at that same run.
export const editDurationStartTime = (
  record: CategorySelectionRecord,
  startedAt: Date,
  showMilliseconds: boolean,
): CategorySelectionRecord | null => {
  const startMs = startedAt.getTime();
  if (!Number.isFinite(startMs)) return null;
  const startTime = startedAt.toISOString();
  const completed = getCompletedDurationIntervals(record);
  if (!completed.length) {
    const stopMs = parsedTime(record.stopTime);
    if (stopMs !== null && stopMs < startMs) return null;
    return { ...record, startTime };
  }
  const firstStopMs = Date.parse(completed[0].stopTime);
  if (firstStopMs < startMs) return null;
  const durationRuns = completed.map((run, index) =>
    index === 0
      ? { ...run, startTime, durationMs: firstStopMs - startMs }
      : run,
  );
  return withDurationTotal(
    record.startTime === completed[0].startTime
      ? { ...record, startTime }
      : record,
    durationRuns,
    showMilliseconds,
  );
};

export const editDurationStopTime = (
  record: CategorySelectionRecord,
  stoppedAt: Date,
  showMilliseconds: boolean,
): CategorySelectionRecord | null => {
  if (!record.stopTime)
    return stopDurationRecord(record, stoppedAt, showMilliseconds);
  const startMs = parsedTime(record.startTime);
  const stopMs = stoppedAt.getTime();
  if (startMs === null || !Number.isFinite(stopMs) || stopMs < startMs)
    return null;
  const stopTime = stoppedAt.toISOString();
  const completed = getCompletedDurationIntervals(record);
  const durationRuns = record.durationRuns?.length
    ? completed.map((run, index) =>
        index === completed.length - 1
          ? {
              ...run,
              stopTime,
              durationMs: stopMs - Date.parse(run.startTime),
            }
          : run,
      )
    : [
        {
          startTime: record.startTime!,
          stopTime,
          durationMs: stopMs - startMs,
        },
      ];
  if (durationRuns.some((run) => run.durationMs < 0)) return null;
  return withDurationTotal(
    { ...record, stopTime },
    durationRuns,
    showMilliseconds,
  );
};

export const getLocalDayBounds = (
  dateKey: string,
): { start: number; end: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const startDate = new Date(year, month - 1, day);
  if (
    startDate.getFullYear() !== year ||
    startDate.getMonth() !== month - 1 ||
    startDate.getDate() !== day
  )
    return null;
  return {
    start: startDate.getTime(),
    end: new Date(year, month - 1, day + 1).getTime(),
  };
};

export const intervalOverlapsDate = (
  interval: DurationInterval,
  dateKey: string,
): boolean => {
  const bounds = getLocalDayBounds(dateKey);
  const start = parsedTime(interval.startTime);
  const stop = parsedTime(interval.stopTime);
  return Boolean(
    bounds &&
    start !== null &&
    stop !== null &&
    start < bounds.end &&
    stop > bounds.start,
  );
};

export const findCarryoverTimers = (
  records: Record<string, CategorySelectionRecord>,
  categories: CategoryDefinition[],
  selectedDateKey: string,
  asOf = Date.now(),
): CategorySelectionRecord[] => {
  const durationCategoryIds = new Set(
    categories
      .filter((category) => category.enabled && category.kind === 'duration')
      .map((category) => category.id),
  );
  return Object.values(records)
    .filter((record) => {
      if (!durationCategoryIds.has(record.categoryId)) return false;
      const startMs = parsedTime(record.startTime);
      if (
        startMs === null ||
        getLocalDateKey(new Date(startMs)) >= selectedDateKey
      )
        return false;
      return getDurationIntervals(record, asOf).some((interval) =>
        intervalOverlapsDate(interval, selectedDateKey),
      );
    })
    .sort(
      (left, right) =>
        // The filter above only keeps records with a parseable start.
        parsedTime(left.startTime)! - parsedTime(right.startTime)! ||
        left.categoryId.localeCompare(right.categoryId) ||
        left.ordinal - right.ordinal,
    );
};

export const getOldestRunningTimerByCategory = (
  records: Record<string, CategorySelectionRecord>,
): Map<string, CategorySelectionRecord> => {
  const oldest = new Map<string, CategorySelectionRecord>();
  for (const record of Object.values(records)) {
    if (!record.startTime || record.stopTime) continue;
    const current = oldest.get(record.categoryId);
    if (
      !current ||
      (parsedTime(record.startTime) ?? Infinity) <
        (parsedTime(current.startTime) ?? Infinity)
    )
      oldest.set(record.categoryId, record);
  }
  return oldest;
};

export const splitIntervalHoursByLocalDate = (
  interval: DurationInterval,
): Map<string, number> => {
  const values = new Map<string, number>();
  const start = parsedTime(interval.startTime);
  const stop = parsedTime(interval.stopTime);
  if (start === null || stop === null || stop <= start) return values;
  const startDateKey = getLocalDateKey(new Date(start));
  // Keys built by getLocalDateKey are always valid, so the bounds lookups cannot fail.
  const startBounds = getLocalDayBounds(startDateKey)!;
  if (stop <= startBounds.end) return values;
  let cursor = start;
  while (cursor < stop) {
    const dateKey = getLocalDateKey(new Date(cursor));
    const bounds = getLocalDayBounds(dateKey)!;
    const segmentEnd = Math.min(stop, bounds.end);
    values.set(
      dateKey,
      (values.get(dateKey) ?? 0) + (segmentEnd - cursor) / 3600000,
    );
    cursor = segmentEnd;
  }
  return values;
};
