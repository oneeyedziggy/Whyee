import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import type {
  ChartCategory,
  ChartPoint,
  ChartSelection,
  ChartSeries,
} from '../types/charts';
import {
  allowsMultiplePerDay,
  primarySeriesId,
  recomputeVirtualSeries,
} from './category';
import { createVirtualCorrelationInput, numericValue } from './virtualSeries';
import { getLocalDateKey } from './dates';
import { chartVirtualSeriesId } from './chartSelection';
import { seriesColors } from '../theme/tokens';

const timestampAt = (dateKey: string, time = '00:00:00') =>
  new Date(`${dateKey}T${time}`).getTime();

const normalize = (points: Omit<ChartPoint, 'normalized'>[]): ChartPoint[] => {
  const values = points.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return points.map((point) => ({
    ...point,
    normalized:
      point.value === null
        ? null
        : maximum === minimum
          ? 0.5
          : (point.value - minimum) / (maximum - minimum),
  }));
};

export const buildChartCategories = (
  categories: CategoryDefinition[],
  records: Record<string, CategorySelectionRecord>,
  selection?: ChartSelection,
): ChartCategory[] => {
  const allRecords = Object.values(records);
  const observedDates = [...new Set(allRecords.map((record) => record.dateKey))]
    .filter((date) => Number.isFinite(timestampAt(date)))
    .sort();
  const dates: string[] = [];
  if (observedDates.length) {
    const cursor = new Date(timestampAt(observedDates[0]));
    const last = timestampAt(observedDates[observedDates.length - 1]);
    while (cursor.getTime() <= last) {
      dates.push(getLocalDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const result: ChartCategory[] = [];
  for (const category of categories) {
    const categoryRecords = allRecords.filter(
      (record) => record.categoryId === category.id,
    );
    const configured = recomputeVirtualSeries(category);
    const showInverses =
      selection?.categories[category.id]?.showInverses === true;
    // Every optional series is chartable; those enabled in category settings come first.
    const definitions = [
      ...configured.filter((definition) => definition.enabled !== false),
      ...configured.filter((definition) => definition.enabled === false),
    ].map((definition) => ({
      ...definition,
      enabled: true,
      inverseEnabled: showInverses,
    }));
    const chartRecords = Object.fromEntries(
      categoryRecords.map((record) => [
        record.key,
        {
          ...record,
          instanceId: `${category.id}:${record.ordinal}`,
        },
      ]),
    );
    const projected = createVirtualCorrelationInput(
      [{ ...category, virtualSeries: definitions }],
      chartRecords,
      [],
      false,
    );
    const projectedValues = new Map<string, Map<string, number>>();
    for (const record of projected.records) {
      const values =
        projectedValues.get(record.categoryId) ?? new Map<string, number>();
      if (Number.isFinite(record.value))
        values.set(record.dateKey, record.value);
      projectedValues.set(record.categoryId, values);
    }
    const entriesPerDay = new Map<string, number>();
    const rawPoints: Omit<ChartPoint, 'normalized'>[] = [];
    for (const record of categoryRecords) {
      const value =
        category.kind === 'notes'
          ? category.sentimentEnabled
            ? numericValue(record, 'noteText', 'sentimentScore')
            : null
          : record.value;
      if (value === null || !Number.isFinite(value)) continue;
      entriesPerDay.set(
        record.dateKey,
        (entriesPerDay.get(record.dateKey) ?? 0) + 1,
      );
      const timestamp = timestampAt(record.dateKey, record.localTime);
      if (Number.isFinite(timestamp))
        rawPoints.push({ key: record.key, timestamp, value });
    }
    const series: ChartSeries[] = [];
    const addSeries = (
      id: string,
      label: string,
      points: Omit<ChartPoint, 'normalized'>[],
      raw: boolean,
      durationValue: boolean,
    ) => {
      let hash = 0;
      for (const character of id)
        hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
      series.push({
        id,
        label,
        name: `${category.name}: ${label}`,
        raw,
        durationValue,
        showMilliseconds:
          category.kind === 'duration' && category.duration.showMilliseconds,
        color: seriesColors[hash % seriesColors.length],
        points: normalize(points),
      });
    };
    const dailyPoints = (values: Map<string, number>) =>
      dates.map((date) => ({
        key: date,
        timestamp: timestampAt(date),
        value: values.get(date) ?? null,
      }));
    for (const definition of definitions) {
      const baseId = chartVirtualSeriesId(category.id, definition.id);
      // Generated names always start with the category name.
      const label =
        definition.name.slice(category.name.length).replace(/^[:\s]+/, '') ||
        'value';
      const durationValue =
        category.kind === 'duration' &&
        definition.field === 'durationMs' &&
        definition.aggregation !== 'count';
      const addWithInverse = (
        id: string,
        seriesLabel: string,
        outputId: string,
      ) => {
        addSeries(
          id,
          seriesLabel,
          dailyPoints(projectedValues.get(outputId) ?? new Map()),
          false,
          durationValue,
        );
        if (showInverses)
          addSeries(
            `${id}:inverse`,
            `${seriesLabel} inverse`,
            dailyPoints(
              projectedValues.get(`${outputId}:inverse`) ?? new Map(),
            ),
            false,
            durationValue,
          );
      };
      if (definition.perInstance) {
        const ordinals = new Set(
          categoryRecords.map((record) => record.ordinal),
        );
        for (const id of selection?.categories[category.id]
          ?.selectedSeriesIds ?? []) {
          const match = new RegExp(
            `^${escapeRegExp(baseId)}:ordinal:(\\d+)(?::inverse)?$`,
          ).exec(id);
          if (match) ordinals.add(Number(match[1]));
        }
        for (const ordinal of [...ordinals].sort((left, right) => left - right))
          addWithInverse(
            `${baseId}:ordinal:${ordinal}`,
            `${label} ${ordinal + 1}`,
            `${definition.id}:${category.id}:${ordinal}`,
          );
      } else addWithInverse(baseId, label, definition.id);
    }
    // With at most one entry per day, individual entries just repeat the daily series.
    if (
      allowsMultiplePerDay(category) &&
      [...entriesPerDay.values()].some((count) => count > 1)
    )
      addSeries(
        `${category.id}:chart:raw`,
        'Raw',
        rawPoints.sort((left, right) => left.timestamp - right.timestamp),
        true,
        category.kind === 'duration',
      );
    const primary = primarySeriesId(category);
    const primaryChartId = primary
      ? chartVirtualSeriesId(category.id, primary)
      : '';
    result.push({
      id: category.id,
      name: category.name,
      series,
      defaultSeriesId: series.some((item) => item.id === primaryChartId)
        ? primaryChartId
        : (series[0]?.id ?? ''),
    });
  }
  return result;
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
