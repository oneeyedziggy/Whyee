import type {
  CategoryDefinition,
  CategorySelectionRecord,
  SummaryVerb,
  VirtualSeriesDefinition,
} from '../types/category';
import type { CorrelationRequest } from '../types/correlation';
import type { CategoryGroup } from '../types/category';
import { recomputeVirtualSeries } from './category';
import { localRecordTimestampMs, minutesOfDayFromTimeStamp } from './dates';
import { scoreSentiment } from './sentiment';

const noteWords = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.,!?;:"()[\]{}]/g, ''))
    .filter(Boolean);

const noteMetric = (
  text: string | undefined,
  field: VirtualSeriesDefinition['field'],
): number | null => {
  if (!text?.trim()) return null;
  const words = noteWords(text);
  if (field === 'noteLength') return text.trim().length;
  if (field === 'noteWordCount') return words.length;
  if (field === 'noteDistinctWords')
    return new Set(words.map((word) => word.toLowerCase())).size;
  return words.length
    ? words.reduce((total, word) => total + word.length, 0) / words.length
    : null;
};

export const numericValue = (
  record: CategorySelectionRecord,
  field: VirtualSeriesDefinition['field'],
  transform?: VirtualSeriesDefinition['transform'],
  optionValue?: number,
): number | null => {
  if (transform === 'sentimentScore')
    return record.sentimentScore ?? scoreSentiment(record.noteText ?? '');
  if (field === 'value') return record.value;
  if (
    field === 'noteWordCount' ||
    field === 'noteLength' ||
    field === 'noteAverageWordLength' ||
    field === 'noteDistinctWords'
  )
    return noteMetric(record.noteText, field);
  if (field === 'optionSelected')
    return record.selectedValues?.includes(optionValue as number) ? 1 : 0;
  if (field === 'eventMinuteOfDay')
    return minutesOfDayFromTimeStamp(record.localTime);
  if (field === 'eventHourOfDay' || field === 'eventDaypart') {
    const minutes = minutesOfDayFromTimeStamp(record.localTime);
    if (minutes === null) return null;
    const bucket = Math.floor(minutes / (field === 'eventDaypart' ? 360 : 60));
    return bucket === optionValue ? 1 : 0;
  }
  // Needs the source category's records; computed via timeSinceMinutes instead.
  if (field === 'timeSinceCategory') return null;
  if (field === 'durationMs') return record.durationMs ?? null;
  const timestamp = field === 'startTime' ? record.startTime : record.stopTime;
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    date.getHours() * 3600000 +
    date.getMinutes() * 60000 +
    date.getSeconds() * 1000 +
    date.getMilliseconds()
  );
};

export const summarize = (
  values: number[],
  verb: SummaryVerb,
): number | null => {
  if (!values.length) return null;
  if (verb === 'count') return values.length;
  if (verb === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (verb === 'product')
    return values.reduce((product, value) => product * value, 1);
  if (verb === 'min') return Math.min(...values);
  if (verb === 'max') return Math.max(...values);
  const sorted = [...values].sort((left, right) => left - right);
  if (verb === 'median') {
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

// Ascending absolute timestamps for a source category's records, for time-since lookups.
// Duration records contribute each recorded period's start; other records their entry time.
export const sortedEventTimestamps = (
  records: CategorySelectionRecord[],
): number[] =>
  records
    .flatMap((record) => recordAnchorsMs(record))
    .sort((left, right) => left - right);

// Latest source timestamp at or before the anchor, as elapsed minutes; null when the anchor
// precedes every source entry (searching back without limit).
const minutesSinceLatestSource = (
  anchorMs: number,
  sortedSourceMs: number[],
): number | null => {
  let low = 0;
  let high = sortedSourceMs.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedSourceMs[mid] <= anchorMs) low = mid + 1;
    else high = mid;
  }
  return low === 0 ? null : (anchorMs - sortedSourceMs[low - 1]) / 60000;
};

// Time-since anchors for a record: one per recorded duration period (each run's start, or the
// record's start time), falling back to the record's own local entry time.
const recordAnchorsMs = (record: CategorySelectionRecord): number[] => {
  const periodStarts = (
    record.durationRuns?.length
      ? record.durationRuns.map((run) => run.startTime)
      : record.startTime
        ? [record.startTime]
        : []
  )
    .map((startTime) => Date.parse(startTime))
    .filter((value) => Number.isFinite(value));
  if (periodStarts.length) return periodStarts;
  const fallback = localRecordTimestampMs(record.dateKey, record.localTime);
  return fallback === null ? [] : [fallback];
};

// Minutes between each of a record's anchors and the most recent source timestamp at or
// before it; anchors that predate every source entry are omitted.
export const timeSinceMinutes = (
  record: CategorySelectionRecord,
  sortedSourceMs: number[],
): number[] =>
  recordAnchorsMs(record).flatMap((anchorMs) => {
    const minutes = minutesSinceLatestSource(anchorMs, sortedSourceMs);
    return minutes === null ? [] : [minutes];
  });

// A compact hourly-breakdown definition (eventHourOfDay with no optionValue) fans out into
// one 0/1 series per hour of day; every other definition passes through unchanged.
export const expandVirtualSeries = (
  definition: VirtualSeriesDefinition,
): VirtualSeriesDefinition[] =>
  definition.field === 'eventHourOfDay' && definition.optionValue === undefined
    ? Array.from({ length: 24 }, (unused, hour) => ({
        ...definition,
        id: `${definition.id}:${hour}`,
        name: `${definition.name.replace(/\s*hourly breakdown$/, '')} at ${String(
          hour,
        ).padStart(2, '0')}:00`,
        optionValue: hour,
      }))
    : [definition];

const calendarSeries = [
  { id: 'calendar:weekday', name: 'Weekday', field: 'weekday' as const },
  {
    id: 'calendar:day-of-month',
    name: 'Day of month',
    field: 'dayOfMonth' as const,
  },
];

const calendarValue = (
  dateKey: string,
  field: 'weekday' | 'dayOfMonth',
): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return field === 'weekday' ? date.getDay() + 1 : date.getDate();
};

export const weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const weekdaySeriesFamily = 'weekday';
export const weekdaySeriesTag = 'weekday';
export const inverseWeekdaySeriesTag = 'weekday-inverse';

const weeklyTags = (category: CategoryDefinition): string[] =>
  category.kind === 'multiple-choice' || category.kind === 'number'
    ? [
        ...(category.weeklyEffectEnabled ? [weekdaySeriesTag] : []),
        ...(category.weeklyEffectInverseEnabled
          ? [inverseWeekdaySeriesTag]
          : []),
      ]
    : [];

const fieldNouns: Record<VirtualSeriesDefinition['field'], string> = {
  value: 'entries',
  startTime: 'start times',
  stopTime: 'stop times',
  durationMs: 'durations',
  noteText: 'note sentiment scores',
  optionSelected: 'choices',
  noteWordCount: 'note word counts',
  noteLength: 'note lengths',
  noteAverageWordLength: 'average note word lengths',
  noteDistinctWords: 'distinct note word counts',
  eventMinuteOfDay: 'event times',
  eventHourOfDay: 'hours',
  eventDaypart: 'dayparts',
  timeSinceCategory: 'elapsed minutes',
};

const singleDescriptions: Record<VirtualSeriesDefinition['field'], string> = {
  value: 'Charts the entered value by date.',
  startTime: 'Charts the start time of day by date.',
  stopTime: 'Charts the stop time of day by date.',
  durationMs: 'Charts the timed duration by date.',
  noteText:
    'Scores each note locally on a negative-to-positive scale. Note text never leaves this device.',
  optionSelected: 'Charts whether this choice was picked by date.',
  noteWordCount: "Charts the note's word count by date.",
  noteLength: "Charts the note's length in characters by date.",
  noteAverageWordLength: "Charts the note's average word length by date.",
  noteDistinctWords: "Charts the note's number of distinct words by date.",
  eventMinuteOfDay: 'Charts the event time of day by date.',
  eventHourOfDay: '1 on days with an event in this hour, 0 otherwise.',
  eventDaypart: '1 on days with an event in this six-hour window, 0 otherwise.',
  timeSinceCategory:
    'Charts the minutes between each event and the most recent prior entry in its source category.',
};

const timeStatWords: Partial<Record<SummaryVerb, string>> = {
  min: 'earliest',
  max: 'latest',
};

export const inverseSeriesDescription =
  'Inverse correlates a mirrored copy of the series around its own average, so high days become low days. Main correlates the series as-is.';

export const describeVirtualSeries = (
  definition: VirtualSeriesDefinition,
): string => {
  if (definition.transform === 'inverse')
    return 'Mirrors the main series around its own average, so high days become low days. Useful for reading a correlation in the opposite direction.';
  if (definition.field === 'optionSelected')
    return definition.aggregation === 'sum'
      ? 'Counts how many times this choice was picked that day.'
      : '1 on days this choice was picked at least once, 0 otherwise.';
  if (definition.field === 'eventDaypart')
    return singleDescriptions.eventDaypart;
  if (definition.field === 'eventHourOfDay')
    return definition.optionValue === undefined
      ? 'Adds 24 series, one per hour of day: each is 1 on days with an event in that hour, 0 otherwise.'
      : singleDescriptions.eventHourOfDay;
  if (definition.field === 'timeSinceCategory')
    return 'Measures the minutes between each event and the most recent prior entry in the source category, searching back without a day limit. Days before the first source entry are omitted.';
  if (definition.perInstance)
    return 'Tracks each entry position (1st, 2nd, …) as its own series.';
  if (definition.group === undefined)
    return singleDescriptions[definition.field];
  if (definition.aggregation === 'count')
    return 'Charts the number of entries per day.';
  const isTime =
    definition.field === 'startTime' ||
    definition.field === 'stopTime' ||
    definition.field === 'eventMinuteOfDay';
  const stat =
    (isTime && timeStatWords[definition.aggregation]) || definition.aggregation;
  const sentimentNote =
    definition.transform === 'sentimentScore'
      ? ' Notes are scored locally and never leave this device.'
      : '';
  return `Charts the ${stat} of each day's ${fieldNouns[definition.field]} by date.${sentimentNote}`;
};

export const createVirtualCorrelationInput = (
  categories: CategoryDefinition[],
  records: Record<string, CategorySelectionRecord>,
  offsets: number[],
  includeCalendar = true,
  groups: CategoryGroup[] = [],
): CorrelationRequest => {
  const inputCategories: CorrelationRequest['categories'] = [];
  const inputRecords: CorrelationRequest['records'] = [];
  const allRecords = Object.values(records);
  const recordsByCategoryId = new Map<string, CategorySelectionRecord[]>();
  for (const record of allRecords) {
    const categoryRecords = recordsByCategoryId.get(record.categoryId) ?? [];
    categoryRecords.push(record);
    recordsByCategoryId.set(record.categoryId, categoryRecords);
  }
  const groupByCategoryId = new Map<string, string>();
  const requestedWeeklyTags = new Set<string>();
  for (const group of groups)
    for (const categoryId of group.categoryIds)
      groupByCategoryId.set(categoryId, group.id);
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  // Ascending source timestamps per category, built once per referenced source.
  const sourceTimestampsCache = new Map<string, number[]>();
  const sourceTimestampsFor = (sourceId: string): number[] => {
    const cached = sourceTimestampsCache.get(sourceId);
    if (cached) return cached;
    const stamps = sortedEventTimestamps(
      recordsByCategoryId.get(sourceId) ?? [],
    );
    sourceTimestampsCache.set(sourceId, stamps);
    return stamps;
  };
  const orderedCategories = groups.length
    ? [
        ...groups.flatMap((group) =>
          group.categoryIds
            .map((categoryId) => categoriesById.get(categoryId))
            .filter((category): category is CategoryDefinition =>
              Boolean(category),
            ),
        ),
        ...categories.filter((category) => !groupByCategoryId.has(category.id)),
      ]
    : categories;

  for (const category of orderedCategories) {
    const groupId = groupByCategoryId.get(category.id);
    const tags = weeklyTags(category);
    for (const tag of tags) requestedWeeklyTags.add(tag);
    const definitions: VirtualSeriesDefinition[] = category.virtualSeries.length
      ? category.virtualSeries
      : recomputeVirtualSeries(category, categories);
    const categoryRecords = recordsByCategoryId.get(category.id) ?? [];

    for (const definition of definitions.flatMap((configured) =>
      expandVirtualSeries(configured),
    )) {
      const includeBase = definition.enabled !== false;
      const includeInverse = definition.inverseEnabled === true;
      if (!includeBase && !includeInverse) continue;
      // Instances are the nth entry of a day, so records without an id group by ordinal.
      const instanceKey = (record: CategorySelectionRecord) =>
        record.instanceId ?? `${record.categoryId}:${record.ordinal}`;
      const recordGroups = new Map<string, CategorySelectionRecord[]>();
      if (definition.perInstance) {
        for (const record of categoryRecords) {
          const key = instanceKey(record);
          const instanceRecords = recordGroups.get(key) ?? [];
          instanceRecords.push(record);
          recordGroups.set(key, instanceRecords);
        }
      } else {
        recordGroups.set('all', categoryRecords);
      }
      for (const [instanceId, instanceRecords] of recordGroups) {
        const outputId = definition.perInstance
          ? `${definition.id}:${instanceId}`
          : definition.id;
        const outputName = definition.perInstance
          ? `${definition.name} ${instanceRecords[0]?.ordinal !== undefined ? instanceRecords[0].ordinal + 1 : ''}`.trim()
          : definition.name;
        const scopeGroupId = category.correlateWithinGroup
          ? groupId
          : undefined;
        const valuesByDate = new Map<string, number[]>();
        for (const record of instanceRecords) {
          // Time-since yields one value per recorded period; other fields at most one.
          const recordValues =
            definition.field === 'timeSinceCategory'
              ? timeSinceMinutes(
                  record,
                  sourceTimestampsFor(definition.timeSinceCategoryId ?? ''),
                )
              : [
                  numericValue(
                    record,
                    definition.field,
                    definition.transform,
                    definition.optionValue,
                  ),
                ].filter((value): value is number => value !== null);
          if (!recordValues.length) continue;
          const dateValues = valuesByDate.get(record.dateKey) ?? [];
          dateValues.push(...recordValues);
          valuesByDate.set(record.dateKey, dateValues);
        }
        const summarizedValues = [...valuesByDate.entries()]
          .map(([dateKey, values]) => ({
            dateKey,
            value: summarize(values, definition.aggregation),
          }))
          .filter(
            (entry): entry is { dateKey: string; value: number } =>
              entry.value !== null,
          );
        const seriesMean = summarize(
          summarizedValues.map((entry) => entry.value),
          'mean',
        );
        // Only called for summarized values, so the mean always exists.
        const mirror = (value: number) => 2 * seriesMean! - value;
        const legacyInverse = definition.transform === 'inverse';
        const outputs: Array<[string, string, boolean]> = [
          ...(includeBase
            ? [
                [outputId, outputName, legacyInverse] as [
                  string,
                  string,
                  boolean,
                ],
              ]
            : []),
          ...(includeInverse
            ? [
                [
                  `${outputId}:inverse`,
                  `${outputName} inverse`,
                  !legacyInverse,
                ] as [string, string, boolean],
              ]
            : []),
        ];
        for (const [id, name, mirrored] of outputs) {
          inputCategories.push({
            id,
            name,
            groupId,
            scopeGroupId,
            ...(tags.length ? { tags } : {}),
          });
          for (const entry of summarizedValues)
            inputRecords.push({
              categoryId: id,
              dateKey: entry.dateKey,
              value: mirrored ? mirror(entry.value) : entry.value,
            });
        }
      }
    }
  }

  const recordDates = new Set(allRecords.map((record) => record.dateKey));

  // One 0/1 indicator per weekday over every recorded date; the inverse flips it.
  for (const [tag, inverse] of [
    [weekdaySeriesTag, false],
    [inverseWeekdaySeriesTag, true],
  ] as const) {
    if (!requestedWeeklyTags.has(tag)) continue;
    weekdayNames.forEach((weekdayName, index) => {
      const id = `weekday:${index + 1}${inverse ? ':inverse' : ''}`;
      inputCategories.push({
        id,
        name: inverse ? `Not ${weekdayName}` : weekdayName,
        global: true,
        family: weekdaySeriesFamily,
        pairsOnlyWith: tag,
        sameDayOnly: true,
      });
      for (const dateKey of recordDates) {
        const matches = calendarValue(dateKey, 'weekday') === index + 1;
        inputRecords.push({
          categoryId: id,
          dateKey,
          value: matches !== inverse ? 1 : 0,
        });
      }
    });
  }

  if (includeCalendar)
    for (const definition of calendarSeries) {
      inputCategories.push({
        id: definition.id,
        name: definition.name,
        global: true,
      });
      for (const dateKey of recordDates) {
        inputRecords.push({
          categoryId: definition.id,
          dateKey,
          value: calendarValue(dateKey, definition.field),
        });
      }
    }

  return {
    categories: inputCategories,
    records: inputRecords,
    offsets,
  };
};
