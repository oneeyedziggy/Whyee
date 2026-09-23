import { createId } from './id';
import type {
  CategoryDefinition,
  CategoryKind,
  ChoiceCategory,
  ChoiceOption,
  NumericCategory,
  SummaryVerb,
  VirtualSeriesDefinition,
} from '../types/category';

export const makeSentimentSeries = (
  categoryId: string,
  name: string,
): VirtualSeriesDefinition => ({
  id: `${categoryId}:sentiment`,
  name: `${name} sentiment`,
  sourceCategoryId: categoryId,
  field: 'noteText',
  aggregation: 'mean',
  transform: 'sentimentScore',
});

export const makeInverseSeries = (
  category: CategoryDefinition,
): VirtualSeriesDefinition => ({
  id: `${category.id}:inverse`,
  name: `${category.name} inverse`,
  sourceCategoryId: category.id,
  field: 'value',
  aggregation: category.mainAggregation,
  transform: 'inverse',
});

const getOptionVirtualSeries = (
  category: ChoiceCategory,
): VirtualSeriesDefinition[] =>
  category.options.map((option) => ({
    id: `${category.id}:option:${option.id}`,
    name: `${category.name}: ${option.label}`,
    sourceCategoryId: category.id,
    field: 'optionSelected',
    optionValue: option.value,
    aggregation: category.optionOccurrenceMode === 'sum' ? 'sum' : 'max',
  }));

const getBaseVirtualSeries = (
  category: CategoryDefinition,
): VirtualSeriesDefinition[] => {
  if (category.kind === 'notes') return [];
  if (
    category.kind === 'multiple-choice' &&
    category.optionSeriesMode === 'items'
  )
    return getOptionVirtualSeries(category);
  if (category.kind === 'duration' || category.kind === 'counter')
    return getDefaultVirtualSeries(category.id, category.name, category.kind);
  if (category.allowMultiplePerDay)
    return getDefaultVirtualSeries(category.id, category.name, category.kind);
  return [
    {
      id: category.id,
      name: `${category.name} raw`,
      sourceCategoryId: category.id,
      field: 'value',
      aggregation: 'mean',
    },
  ];
};

// Rebuilds the canonical series list for the current config, keeping prior enabled flags.
export const recomputeVirtualSeries = (
  category: CategoryDefinition,
): VirtualSeriesDefinition[] => {
  const previous = new Map(
    category.virtualSeries.map((definition) => [definition.id, definition]),
  );
  const inverse = category.virtualSeries.find(
    (definition) => definition.transform === 'inverse',
  );
  const next = [
    ...getBaseVirtualSeries(category),
    ...(category.notesEnabled && category.sentimentEnabled
      ? [makeSentimentSeries(category.id, category.name)]
      : []),
    ...(inverse ? [makeInverseSeries(category)] : []),
  ];
  return next.map((definition) => ({
    ...definition,
    enabled: previous.get(definition.id)?.enabled ?? definition.enabled,
  }));
};

const createVirtualSeries = (
  categoryId: string,
  name: string,
  field: 'startTime' | 'stopTime' | 'durationMs',
  aggregation: SummaryVerb,
): VirtualSeriesDefinition => ({
  id: `${categoryId}:${field}:${aggregation}`,
  name,
  sourceCategoryId: categoryId,
  field,
  aggregation,
});

export const getDefaultVirtualSeries = (
  categoryId: string,
  name: string,
  kind: CategoryKind,
) => {
  if (kind === 'duration') {
    return [
      createVirtualSeries(
        categoryId,
        `${name} total duration`,
        'durationMs',
        'sum',
      ),
      {
        ...createVirtualSeries(
          categoryId,
          `${name} duration per entry`,
          'durationMs',
          'mean',
        ),
        perInstance: true,
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} longest duration`,
          'durationMs',
          'max',
        ),
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} shortest duration`,
          'durationMs',
          'min',
        ),
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} count`,
          'durationMs',
          'count',
        ),
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} average start time`,
          'startTime',
          'mean',
        ),
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} average stop time`,
          'stopTime',
          'mean',
        ),
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} first start time`,
          'startTime',
          'min',
        ),
        enabled: false,
      },
      {
        ...createVirtualSeries(
          categoryId,
          `${name} last stop time`,
          'stopTime',
          'max',
        ),
        enabled: false,
      },
    ];
  }

  if (kind === 'counter') {
    return [
      {
        id: `${categoryId}:counter:sum`,
        name: `${name} total`,
        sourceCategoryId: categoryId,
        field: 'value' as const,
        aggregation: 'sum' as const,
      },
      {
        id: `${categoryId}:counter:count`,
        name: `${name} count`,
        sourceCategoryId: categoryId,
        field: 'value' as const,
        aggregation: 'count' as const,
      },
    ];
  }

  if (kind === 'multiple-choice' || kind === 'number') {
    return [
      {
        id: `${categoryId}:instance`,
        name: `${name} instance`,
        sourceCategoryId: categoryId,
        field: 'value' as const,
        aggregation: 'mean' as const,
        perInstance: true,
      },
      {
        id: `${categoryId}:sum`,
        name: `${name} sum`,
        sourceCategoryId: categoryId,
        field: 'value' as const,
        aggregation: 'sum' as const,
      },
      {
        id: `${categoryId}:count`,
        name: `${name} count`,
        sourceCategoryId: categoryId,
        field: 'value' as const,
        aggregation: 'count' as const,
      },
    ];
  }

  if (kind === 'notes') {
    return [];
  }

  return [];
};

export const createChoiceOption = (index: number): ChoiceOption => ({
  id: createId('choice'),
  label: `Option ${index + 1}`,
  value: index,
});

export const getNextCategoryNameSequence = (
  categories: CategoryDefinition[],
  kind: CategoryKind,
): number =>
  Math.max(
    0,
    ...categories
      .filter((category) => category.kind === kind)
      .map((category) => category.nameSequence ?? 0),
  ) + 1;

export const normalizeChoiceOptions = (
  options: ChoiceOption[],
): ChoiceOption[] =>
  options.map((option, index) => ({ ...option, value: index }));

export const createDefaultCategory = (
  kind: CategoryKind,
  index: number,
  name?: string,
  nameSequence = index + 1,
): CategoryDefinition => {
  const defaultName =
    kind === 'multiple-choice'
      ? 'Choice'
      : kind === 'number'
        ? 'Number'
        : kind === 'duration'
          ? 'Duration'
          : kind === 'counter'
            ? 'Counter'
            : 'Notes';
  const baseName = name ?? `${defaultName} ${index + 1}`;

  if (kind === 'multiple-choice') {
    return {
      id: createId('category'),
      name: baseName,
      nameSequence,
      kind,
      allowMultiplePerDay: false,
      mainAggregation: 'mean',
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: true,
      correlateWithinGroup: false,
      virtualSeries: [],
      multiSelect: false,
      weeklyEffectEnabled: false,
      optionSeriesMode: 'intensity',
      optionOccurrenceMode: 'capped',
      options: normalizeChoiceOptions([
        createChoiceOption(0),
        createChoiceOption(1),
        createChoiceOption(2),
      ]),
    };
  }

  if (kind === 'duration') {
    const id = createId('category');
    return {
      id,
      name: baseName,
      nameSequence,
      kind,
      allowMultiplePerDay: false,
      mainAggregation: 'sum',
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: true,
      correlateWithinGroup: false,
      duration: {
        splitEnabled: false,
        showMilliseconds: false,
        resetEnabled: true,
        cumulative: false,
        animate: true,
        use24HourClock: true,
      },
      virtualSeries: getDefaultVirtualSeries(id, baseName, kind),
    };
  }

  if (kind === 'counter') {
    const id = createId('category');
    return {
      id,
      name: baseName,
      nameSequence,
      kind,
      allowMultiplePerDay: false,
      mainAggregation: 'sum',
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: true,
      correlateWithinGroup: false,
      counter: {
        steps: [-1, 1],
        resetEnabled: false,
        editable: true,
        splitEnabled: false,
      },
      virtualSeries: getDefaultVirtualSeries(id, baseName, kind),
    };
  }

  if (kind === 'notes') {
    const id = createId('category');
    return {
      id,
      name: baseName,
      nameSequence,
      kind,
      enabled: true,
      notesEnabled: true,
      sentimentEnabled: true,
      correlateWithinGroup: false,
      allowMultiplePerDay: false,
      mainAggregation: 'mean',
      notes: { sentimentEnabled: true },
      virtualSeries: [],
    };
  }

  return {
    id: createId('category'),
    name: baseName,
    nameSequence,
    kind,
    allowMultiplePerDay: false,
    mainAggregation: 'mean',
    enabled: true,
    notesEnabled: false,
    sentimentEnabled: true,
    correlateWithinGroup: false,
    virtualSeries: [],
    weeklyEffectEnabled: false,
    range: { min: 0, max: 10, step: 1 },
  } satisfies NumericCategory;
};

export const switchCategoryKind = (
  category: CategoryDefinition,
  kind: CategoryKind,
): CategoryDefinition => {
  const { savedTypeSettings: ignored, ...currentSettings } = category;
  const savedTypeSettings = {
    ...(category.savedTypeSettings ?? {}),
    [category.kind]: currentSettings,
  };
  const switched = switchKindShape(category, kind);
  const restored = category.savedTypeSettings?.[kind];
  const next = (
    restored
      ? {
          ...switched,
          ...restored,
          id: category.id,
          name: category.name,
          nameSequence: category.nameSequence,
          kind,
          savedTypeSettings,
        }
      : { ...switched, savedTypeSettings }
  ) as CategoryDefinition;
  return { ...next, virtualSeries: recomputeVirtualSeries(next) };
};

const switchKindShape = (
  category: CategoryDefinition,
  kind: CategoryKind,
): CategoryDefinition => {
  if (kind === 'multiple-choice') {
    return {
      ...category,
      kind,
      multiSelect:
        category.kind === 'multiple-choice' ? category.multiSelect : false,
      weeklyEffectEnabled:
        category.kind === 'multiple-choice' || category.kind === 'number'
          ? category.weeklyEffectEnabled
          : false,
      optionSeriesMode:
        category.kind === 'multiple-choice'
          ? category.optionSeriesMode
          : 'intensity',
      optionOccurrenceMode:
        category.kind === 'multiple-choice'
          ? category.optionOccurrenceMode
          : 'capped',
      allowMultiplePerDay: category.allowMultiplePerDay,
      mainAggregation: category.mainAggregation,
      virtualSeries: category.allowMultiplePerDay
        ? getDefaultVirtualSeries(category.id, category.name, kind)
        : category.virtualSeries,
      options:
        category.kind === 'multiple-choice'
          ? normalizeChoiceOptions(category.options)
          : normalizeChoiceOptions([
              createChoiceOption(0),
              createChoiceOption(1),
              createChoiceOption(2),
            ]),
    };
  }

  if (kind === 'duration') {
    const id = category.id;
    return {
      id,
      name: category.name,
      nameSequence: category.nameSequence,
      kind,
      enabled: category.enabled,
      notesEnabled: category.notesEnabled,
      sentimentEnabled: category.sentimentEnabled,
      correlateWithinGroup: category.correlateWithinGroup,
      allowMultiplePerDay: false,
      mainAggregation: 'sum',
      duration: {
        splitEnabled: false,
        showMilliseconds: false,
        resetEnabled: true,
        cumulative: false,
        animate: true,
        use24HourClock: true,
      },
      virtualSeries: getDefaultVirtualSeries(id, category.name, kind),
    };
  }

  if (kind === 'counter') {
    return {
      id: category.id,
      name: category.name,
      nameSequence: category.nameSequence,
      kind,
      enabled: category.enabled,
      notesEnabled: category.notesEnabled,
      sentimentEnabled: category.sentimentEnabled,
      correlateWithinGroup: category.correlateWithinGroup,
      allowMultiplePerDay: category.allowMultiplePerDay,
      mainAggregation: 'sum',
      counter: {
        steps: [-1, 1],
        resetEnabled: false,
        editable: true,
        splitEnabled: false,
      },
      virtualSeries: [],
    };
  }

  if (kind === 'notes') {
    return {
      id: category.id,
      name: category.name,
      nameSequence: category.nameSequence,
      kind,
      enabled: category.enabled,
      notesEnabled: true,
      sentimentEnabled: true,
      correlateWithinGroup: category.correlateWithinGroup,
      allowMultiplePerDay: category.allowMultiplePerDay,
      mainAggregation: 'mean',
      notes: { sentimentEnabled: true },
      virtualSeries: [],
    };
  }

  return {
    ...category,
    kind,
    enabled: category.enabled,
    notesEnabled: category.notesEnabled,
    sentimentEnabled: category.sentimentEnabled,
    weeklyEffectEnabled:
      category.kind === 'multiple-choice' || category.kind === 'number'
        ? category.weeklyEffectEnabled
        : false,
    allowMultiplePerDay: category.allowMultiplePerDay,
    mainAggregation: category.mainAggregation,
    virtualSeries: category.allowMultiplePerDay
      ? getDefaultVirtualSeries(category.id, category.name, kind)
      : category.virtualSeries,
    range:
      category.kind === 'number'
        ? category.range
        : { min: 0, max: 10, step: 1 },
  };
};

export const moveItem = <T>(
  items: T[],
  index: number,
  direction: -1 | 1,
): T[] => {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  [nextItems[index], nextItems[nextIndex]] = [
    nextItems[nextIndex],
    nextItems[index],
  ];
  return nextItems;
};
