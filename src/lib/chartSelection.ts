import type { ChartCategory, ChartSelection } from '../types/charts';
import type {
  CategoryDefinition,
  VirtualSeriesDefinition,
} from '../types/category';
import {
  allowsMultiplePerDay,
  getVirtualSeriesAliases,
  primarySeriesId,
  recomputeVirtualSeries,
} from './category';

export const chartVirtualSeriesId = (
  categoryId: string,
  definitionId: string,
) => `${categoryId}:chart:virtual:${definitionId}`;

const resolveChartSeriesId = (
  category: CategoryDefinition,
  definitions: VirtualSeriesDefinition[],
  aliases: Map<string, string>,
  seriesId: string,
): string | null => {
  const prefix = `${category.id}:chart:`;
  // Saved before Main aggregation was removed; the default series replaces it.
  if (seriesId === `${prefix}main`) {
    const primary = primarySeriesId(category);
    return primary ? chartVirtualSeriesId(category.id, primary) : null;
  }
  if (seriesId === `${prefix}raw`)
    return allowsMultiplePerDay(category) ? seriesId : null;
  if (!seriesId.startsWith(`${prefix}virtual:`)) return null;
  const inverse = seriesId.endsWith(':inverse');
  const rest = seriesId.slice(
    `${prefix}virtual:`.length,
    inverse ? -':inverse'.length : undefined,
  );
  const ordinal = /^(.*):ordinal:(\d+)$/.exec(rest);
  const legacyId = ordinal ? ordinal[1] : rest;
  const definitionId = aliases.get(legacyId) ?? legacyId;
  const definition = definitions.find(
    (candidate) => candidate.id === definitionId,
  );
  if (!definition || Boolean(definition.perInstance) !== Boolean(ordinal))
    return null;
  return `${chartVirtualSeriesId(category.id, definitionId)}${
    ordinal ? `:ordinal:${ordinal[2]}` : ''
  }${inverse ? ':inverse' : ''}`;
};

export const reconcileChartSelection = (
  selection: ChartSelection,
  categories: CategoryDefinition[],
): ChartSelection => {
  let changed = false;
  const next: ChartSelection['categories'] = {};
  for (const [id, choice] of Object.entries(selection.categories)) {
    const category = categories.find((candidate) => candidate.id === id);
    if (!category) {
      changed = true;
      continue;
    }
    const definitions = recomputeVirtualSeries(category);
    const aliases = getVirtualSeriesAliases(category);
    const selectedSeriesIds = [
      ...new Set(
        choice.selectedSeriesIds
          .map((seriesId) =>
            resolveChartSeriesId(category, definitions, aliases, seriesId),
          )
          .filter((seriesId): seriesId is string => seriesId !== null),
      ),
    ];
    if (
      selectedSeriesIds.length !== choice.selectedSeriesIds.length ||
      selectedSeriesIds.some(
        (seriesId, index) => seriesId !== choice.selectedSeriesIds[index],
      )
    ) {
      changed = true;
      next[id] = {
        ...choice,
        enabled: choice.enabled && selectedSeriesIds.length > 0,
        selectedSeriesIds,
      };
    } else next[id] = choice;
  }
  return changed ? { categories: next } : selection;
};

export const initializeChartSelection = (
  categories: ChartCategory[],
): ChartSelection => ({
  categories: Object.fromEntries(
    categories
      .filter(
        (category) =>
          category.defaultSeriesId &&
          category.series.some((series) =>
            series.points.some((point) => point.value !== null),
          ),
      )
      .slice(0, 2)
      .map((category) => [
        category.id,
        { enabled: true, selectedSeriesIds: [category.defaultSeriesId] },
      ]),
  ),
});

export const setChartCategoryEnabled = (
  selection: ChartSelection,
  category: ChartCategory,
  enabled: boolean,
): ChartSelection => {
  const previous = selection.categories[category.id];
  const remembered =
    previous?.selectedSeriesIds.filter((id) =>
      category.series.some((series) => series.id === id),
    ) ?? [];
  return {
    categories: {
      ...selection.categories,
      [category.id]: {
        ...previous,
        enabled,
        selectedSeriesIds: enabled
          ? remembered.length
            ? remembered
            : [category.defaultSeriesId]
          : (previous?.selectedSeriesIds ?? []),
      },
    },
  };
};

export const setChartInversesShown = (
  selection: ChartSelection,
  category: ChartCategory,
  shown: boolean,
): ChartSelection => {
  const previous = selection.categories[category.id] ?? {
    enabled: true,
    selectedSeriesIds: [],
  };
  const kept = shown
    ? previous.selectedSeriesIds
    : previous.selectedSeriesIds.filter((id) => !id.endsWith(':inverse'));
  return {
    categories: {
      ...selection.categories,
      [category.id]: {
        ...previous,
        showInverses: shown,
        selectedSeriesIds: kept.length ? kept : [category.defaultSeriesId],
      },
    },
  };
};

export const toggleChartSeries = (
  selection: ChartSelection,
  categoryId: string,
  seriesId: string,
): ChartSelection => {
  const previous = selection.categories[categoryId];
  const current = previous?.selectedSeriesIds ?? [];
  const selectedSeriesIds = current.includes(seriesId)
    ? current.filter((id) => id !== seriesId)
    : [...current, seriesId];
  return {
    categories: {
      ...selection.categories,
      [categoryId]: {
        ...previous,
        enabled: selectedSeriesIds.length > 0,
        selectedSeriesIds,
      },
    },
  };
};
