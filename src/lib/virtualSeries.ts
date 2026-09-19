import type {
  CategoryDefinition,
  CategorySelectionRecord,
  SummaryVerb,
  VirtualSeriesDefinition,
} from '../types/category';
import type { CorrelationRequest } from '../types/correlation';
import type { CategoryGroup } from '../types/category';
import { scoreSentiment } from './sentiment';

const numericValue = (
  record: CategorySelectionRecord,
  field: VirtualSeriesDefinition['field'],
  transform?: VirtualSeriesDefinition['transform'],
): number | null => {
  if (transform === 'sentimentScore')
    return record.sentimentScore ?? scoreSentiment(record.noteText ?? '');
  if (field === 'value') return record.value;
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

const fieldDescriptions: Record<VirtualSeriesDefinition['field'], string> = {
  value: 'the entered value',
  startTime: 'the start time, as milliseconds since local midnight',
  stopTime: 'the stop time, as milliseconds since local midnight',
  durationMs: 'the elapsed duration in milliseconds',
  noteText: 'the note text',
};

const verbDescriptions: Record<SummaryVerb, string> = {
  count: 'counted',
  sum: 'added together',
  product: 'multiplied together',
  mean: 'averaged',
  median: 'reduced to the middle value',
  min: 'reduced to the smallest value',
  max: 'reduced to the largest value',
};

export const describeVirtualSeries = (
  definition: VirtualSeriesDefinition,
): string => {
  if (definition.transform === 'sentimentScore')
    return 'Scores each note locally on a negative-to-positive scale and averages the scores for the day. Note text never leaves this device.';
  if (definition.transform === 'inverse')
    return 'Mirrors the main series around its own average, so high days become low days. Useful for reading a correlation in the opposite direction.';
  const scope = definition.perInstance
    ? 'Treats every entry of the day as its own data point'
    : `Takes ${fieldDescriptions[definition.field]} from every entry of the day, ${verbDescriptions[definition.aggregation]} into one number per day`;
  return definition.perInstance
    ? `${scope}, using ${fieldDescriptions[definition.field]} ${verbDescriptions[definition.aggregation]} within each entry.`
    : `${scope}.`;
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
  for (const group of groups)
    for (const categoryId of group.categoryIds)
      groupByCategoryId.set(categoryId, group.id);
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
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
    const definitions: VirtualSeriesDefinition[] =
      category.kind === 'notes'
        ? []
        : category.virtualSeries.length
          ? category.virtualSeries
          : category.allowMultiplePerDay
            ? [
                {
                  id: `${category.id}:instance`,
                  name: `${category.name} instance`,
                  sourceCategoryId: category.id,
                  field: 'value' as const,
                  aggregation: 'mean' as const,
                  perInstance: true,
                },
                {
                  id: `${category.id}:sum`,
                  name: `${category.name} sum`,
                  sourceCategoryId: category.id,
                  field: 'value' as const,
                  aggregation: category.mainAggregation,
                },
                {
                  id: `${category.id}:count`,
                  name: `${category.name} count`,
                  sourceCategoryId: category.id,
                  field: 'value' as const,
                  aggregation: 'count' as const,
                },
              ]
            : [
                {
                  id: category.id,
                  name: category.name,
                  sourceCategoryId: category.id,
                  field: 'value' as const,
                  aggregation: 'mean' as const,
                },
              ];
    const noteDefinitions: VirtualSeriesDefinition[] =
      category.notesEnabled &&
      category.sentimentEnabled &&
      !definitions.some(
        (definition) => definition.transform === 'sentimentScore',
      )
        ? [
            {
              id: `${category.id}:sentiment`,
              name: `${category.name} sentiment`,
              sourceCategoryId: category.id,
              field: 'noteText' as const,
              aggregation: 'mean' as const,
              transform: 'sentimentScore' as const,
            },
          ]
        : [];
    const categoryRecords = recordsByCategoryId.get(category.id) ?? [];

    for (const definition of [...definitions, ...noteDefinitions]) {
      if (definition.enabled === false) continue;
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
        inputCategories.push({
          id: outputId,
          name: outputName,
          groupId,
          scopeGroupId: category.correlateWithinGroup ? groupId : undefined,
        });
        const valuesByDate = new Map<string, number[]>();
        for (const record of instanceRecords) {
          const value = numericValue(
            record,
            definition.field,
            definition.transform,
          );
          if (value === null) continue;
          const dateValues = valuesByDate.get(record.dateKey) ?? [];
          dateValues.push(value);
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
        for (const entry of summarizedValues) {
          const value =
            definition.transform === 'inverse' && seriesMean !== null
              ? 2 * seriesMean - entry.value
              : entry.value;
          inputRecords.push({
            categoryId: outputId,
            dateKey: entry.dateKey,
            value,
          });
        }
      }
    }
  }

  if (includeCalendar)
    for (const definition of calendarSeries) {
      inputCategories.push({
        id: definition.id,
        name: definition.name,
        global: true,
      });
      const dates = new Set(allRecords.map((record) => record.dateKey));
      for (const dateKey of dates) {
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
