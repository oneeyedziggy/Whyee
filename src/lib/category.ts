import { createId } from './id';
import type {
  CategoryDefinition,
  CategoryKind,
  ChoiceOption,
  NumericCategory,
  SummaryVerb,
  VirtualSeriesDefinition,
  VirtualSeriesField,
} from '../types/category';

const valueStats: SummaryVerb[] = [
  'mean',
  'median',
  'sum',
  'product',
  'min',
  'max',
];
const durationStats: SummaryVerb[] = ['sum', 'mean', 'median', 'min', 'max'];
const timeStats: SummaryVerb[] = ['mean', 'median', 'min', 'max'];
const noteStats: SummaryVerb[] = ['mean', 'median', 'sum', 'min', 'max'];
const statGroups: Record<SummaryVerb, string> = {
  mean: 'Mean',
  median: 'Median',
  sum: 'Sum',
  product: 'Product',
  min: 'Minimum',
  max: 'Maximum',
  count: 'Entries',
};
const durationLabels: Partial<Record<SummaryVerb, string>> = {
  sum: 'total duration',
  mean: 'mean duration',
  median: 'median duration',
  min: 'shortest duration',
  max: 'longest duration',
};
const timeLabels: Partial<Record<SummaryVerb, string>> = {
  mean: 'mean',
  median: 'median',
  min: 'earliest',
  max: 'latest',
};
const noteMetrics: Array<[VirtualSeriesField, string, string]> = [
  ['noteWordCount', 'words', 'word count'],
  ['noteLength', 'length', 'length'],
  ['noteAverageWordLength', 'word-length', 'average word length'],
  ['noteDistinctWords', 'distinct-words', 'distinct word count'],
];

// Daypart index = floor(hour / 6); names and labels are indexed by that bucket.
export const eventDaypartNames = [
  'Night',
  'Morning',
  'Afternoon',
  'Evening',
] as const;
const eventDaypartLabels = [
  'at night',
  'in the morning',
  'in the afternoon',
  'in the evening',
];

// Split / lap modes record several entries per day even when the setting itself is off.
export const allowsMultiplePerDay = (category: CategoryDefinition): boolean =>
  category.allowMultiplePerDay ||
  (category.kind === 'duration' && category.duration.splitEnabled) ||
  (category.kind === 'counter' && category.counter.splitEnabled);

// Time-since source category ids for the kinds that support them.
export const timeSinceSourceIds = (category: CategoryDefinition): string[] =>
  category.kind === 'event-time'
    ? category.eventTime.timeSinceCategoryIds
    : category.kind === 'duration'
      ? category.duration.timeSinceCategoryIds
      : [];

const primaryStat = (
  category: CategoryDefinition,
  stats: SummaryVerb[],
): SummaryVerb =>
  category.mainAggregation && stats.includes(category.mainAggregation)
    ? category.mainAggregation
    : category.kind === 'counter' || category.kind === 'duration'
      ? 'sum'
      : 'mean';

// The series enabled for new categories and charted by default.
export const primarySeriesId = (
  category: CategoryDefinition,
): string | undefined => {
  const { id } = category;
  const multiple = allowsMultiplePerDay(category);
  if (
    category.kind === 'multiple-choice' &&
    category.optionSeriesMode === 'items'
  )
    return category.options[0]
      ? `${id}:option:${category.options[0].id}`
      : undefined;
  if (category.kind === 'notes') {
    const base = category.sentimentEnabled ? 'sentiment' : 'note:words';
    return multiple
      ? `${id}:${base}:${primaryStat(category, noteStats)}`
      : `${id}:${base}`;
  }
  if (category.kind === 'duration')
    return multiple
      ? `${id}:duration:${primaryStat(category, durationStats)}`
      : `${id}:duration`;
  if (category.kind === 'event-time')
    return multiple
      ? `${id}:time:${primaryStat(category, timeStats)}`
      : `${id}:time`;
  return multiple
    ? `${id}:value:${primaryStat(category, valueStats)}`
    : `${id}:value`;
};

interface GeneratedSeries {
  definition: VirtualSeriesDefinition;
  aliases: string[];
}

const generateVirtualSeries = (
  category: CategoryDefinition,
  sourceNames?: Map<string, string>,
): GeneratedSeries[] => {
  const { id, name } = category;
  const multiple = allowsMultiplePerDay(category);
  const generated: GeneratedSeries[] = [];
  const add = (
    suffix: string,
    label: string,
    field: VirtualSeriesField,
    aggregation: SummaryVerb,
    extra: Partial<VirtualSeriesDefinition>,
    aliases: string[] = [],
  ) =>
    generated.push({
      definition: {
        id: `${id}:${suffix}`,
        name: `${name} ${label}`,
        sourceCategoryId: id,
        field,
        aggregation,
        enabled: false,
        ...extra,
      },
      aliases,
    });
  const entries = (
    field: VirtualSeriesField,
    label: string,
    aliases: string[],
  ) => {
    add(
      'instance',
      label,
      field,
      'mean',
      { perInstance: true, group: 'Entries' },
      aliases,
    );
    add('count', 'count', field, 'count', { group: 'Entries' }, [
      `${id}:counter:count`,
      `${id}:durationMs:count`,
    ]);
  };
  // "Minutes since <source>" series, shared by the event-time and duration kinds.
  const addTimeSince = () => {
    for (const sourceId of timeSinceSourceIds(category)) {
      const label = `minutes since ${sourceNames?.get(sourceId) ?? 'source'}`;
      if (!multiple)
        add(`since:${sourceId}`, label, 'timeSinceCategory', 'mean', {
          timeSinceCategoryId: sourceId,
          enabled: true,
          group: 'Time since',
        });
      else
        for (const stat of timeStats)
          add(
            `since:${sourceId}:${stat}`,
            `${stat} ${label}`,
            'timeSinceCategory',
            stat,
            {
              timeSinceCategoryId: sourceId,
              enabled: stat === 'mean',
              group: 'Time since',
            },
          );
    }
  };

  if (
    category.kind === 'multiple-choice' &&
    category.optionSeriesMode === 'items'
  )
    for (const option of category.options)
      generated.push({
        definition: {
          id: `${id}:option:${option.id}`,
          name: `${name}: ${option.label}`,
          sourceCategoryId: id,
          field: 'optionSelected',
          optionValue: option.value,
          aggregation: category.optionOccurrenceMode === 'sum' ? 'sum' : 'max',
          enabled: true,
        },
        aliases: [],
      });
  else if (category.kind === 'duration') {
    if (!multiple) {
      add('duration', 'duration', 'durationMs', 'sum', {}, [
        `${id}:durationMs:sum`,
      ]);
      add('start', 'start time', 'startTime', 'min', {}, [
        `${id}:startTime:min`,
        `${id}:startTime:mean`,
      ]);
      add('stop', 'stop time', 'stopTime', 'max', {}, [
        `${id}:stopTime:max`,
        `${id}:stopTime:mean`,
      ]);
    } else {
      entries('durationMs', 'duration per entry', [`${id}:durationMs:mean`]);
      for (const stat of durationStats) {
        const group = { group: statGroups[stat] };
        add(
          `duration:${stat}`,
          durationLabels[stat]!,
          'durationMs',
          stat,
          group,
          stat === 'mean' ? [] : [`${id}:durationMs:${stat}`],
        );
        if (timeStats.includes(stat)) {
          add(
            `start:${stat}`,
            `${timeLabels[stat]} start time`,
            'startTime',
            stat,
            group,
            stat === 'mean' || stat === 'min'
              ? [`${id}:startTime:${stat}`]
              : [],
          );
          add(
            `stop:${stat}`,
            `${timeLabels[stat]} stop time`,
            'stopTime',
            stat,
            group,
            stat === 'mean' || stat === 'max' ? [`${id}:stopTime:${stat}`] : [],
          );
        }
      }
    }
    addTimeSince();
  } else if (category.kind === 'event-time') {
    if (!multiple) add('time', 'time', 'eventMinuteOfDay', 'mean', {});
    else {
      add('instance', 'time per entry', 'eventMinuteOfDay', 'mean', {
        perInstance: true,
        group: 'Entries',
      });
      add('count', 'count', 'eventMinuteOfDay', 'count', {
        group: 'Entries',
        enabled: true,
      });
      for (const stat of timeStats)
        add(`time:${stat}`, `${timeLabels[stat]} time`, 'eventMinuteOfDay', stat, {
          group: statGroups[stat],
        });
    }
    eventDaypartNames.forEach((daypart, index) =>
      add(`daypart:${index}`, eventDaypartLabels[index], 'eventDaypart', 'max', {
        optionValue: index,
        enabled: true,
        group: 'Dayparts',
      }),
    );
    // One toggle that fans out into 24 hourly 0/1 series (see expandVirtualSeries).
    add('hours', 'hourly breakdown', 'eventHourOfDay', 'max', {});
    addTimeSince();
  } else if (category.kind !== 'notes') {
    if (!multiple)
      add('value', 'value', 'value', 'mean', { name }, [
        id,
        `${id}:counter:sum`,
      ]);
    else {
      entries('value', 'instance', []);
      for (const stat of valueStats)
        add(
          `value:${stat}`,
          stat,
          'value',
          stat,
          { group: statGroups[stat] },
          stat === 'sum' ? [`${id}:sum`, `${id}:counter:sum`] : [],
        );
    }
  }

  if (category.kind === 'notes' || category.notesEnabled) {
    const noteSeries: Array<
      [string, string, VirtualSeriesField, Partial<VirtualSeriesDefinition>]
    > = [
      ...(category.sentimentEnabled
        ? [
            [
              'sentiment',
              'sentiment',
              'noteText',
              { transform: 'sentimentScore' as const },
            ] as [
              string,
              string,
              VirtualSeriesField,
              Partial<VirtualSeriesDefinition>,
            ],
          ]
        : []),
      ...noteMetrics.map(
        ([field, key, label]) =>
          [`note:${key}`, label, field, {}] as [
            string,
            string,
            VirtualSeriesField,
            Partial<VirtualSeriesDefinition>,
          ],
      ),
    ];
    for (const [suffix, label, field, extra] of noteSeries) {
      const sentiment = suffix === 'sentiment';
      if (!multiple)
        add(suffix, label, field, 'mean', { ...extra, enabled: sentiment });
      else
        for (const stat of noteStats)
          add(
            `${suffix}:${stat}`,
            `${stat} ${label}`,
            field,
            stat,
            {
              ...extra,
              group: statGroups[stat],
              enabled: sentiment && stat === 'mean',
            },
            sentiment && stat === 'mean' ? [`${id}:sentiment`] : [],
          );
    }
  }
  return generated;
};

// Maps pre-rework series IDs to their current equivalents so saved choices carry over.
export const getVirtualSeriesAliases = (
  category: CategoryDefinition,
): Map<string, string> =>
  new Map(
    generateVirtualSeries(category).flatMap(({ definition, aliases }) =>
      aliases.map((alias) => [alias, definition.id] as const),
    ),
  );

// Rebuilds the canonical series list for the current config, keeping prior enabled flags.
// `allCategories` resolves time-since source names; without it, prior names are preserved.
export const recomputeVirtualSeries = (
  category: CategoryDefinition,
  allCategories?: CategoryDefinition[],
): VirtualSeriesDefinition[] => {
  const sourceNames = allCategories
    ? new Map(allCategories.map((entry) => [entry.id, entry.name]))
    : undefined;
  const previous = new Map(
    category.virtualSeries.map((definition) => [definition.id, definition]),
  );
  // Legacy standalone inverse series become the inverse toggle on the primary series.
  const legacyInverse = category.virtualSeries.some(
    (definition) =>
      definition.transform === 'inverse' && definition.enabled !== false,
  );
  const primary = primarySeriesId(category);
  return generateVirtualSeries(category, sourceNames).map(
    ({ definition, aliases }) => {
      const prior = [definition.id, ...aliases]
        .map((candidate) => previous.get(candidate))
        .find((candidate) => candidate !== undefined);
      const inverseEnabled =
        prior?.inverseEnabled ?? (legacyInverse && definition.id === primary);
      const { inverseEnabled: ignored, ...rest } = definition;
      return {
        ...rest,
        ...(definition.field === 'timeSinceCategory' && !sourceNames && prior
          ? { name: prior.name }
          : {}),
        enabled: prior
          ? prior.enabled !== false
          : definition.enabled === true || definition.id === primary,
        ...(inverseEnabled ? { inverseEnabled: true } : {}),
      };
    },
  );
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

const nonPrintableChoiceCharacters =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

export const hasPrintableChoiceLabel = (label: string): boolean =>
  label.replace(nonPrintableChoiceCharacters, '').trim().length > 0;

export const createDefaultCategory = (
  kind: CategoryKind,
  index: number,
  name?: string,
  nameSequence = index + 1,
): CategoryDefinition => {
  const category = createCategoryShape(kind, index, name, nameSequence);
  return { ...category, virtualSeries: recomputeVirtualSeries(category) };
};

const createCategoryShape = (
  kind: CategoryKind,
  index: number,
  name: string | undefined,
  nameSequence: number,
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
            : kind === 'event-time'
              ? 'Event'
              : 'Notes';
  const baseName = name ?? `${defaultName} ${index + 1}`;

  if (kind === 'multiple-choice') {
    return {
      id: createId('category'),
      name: baseName,
      nameSequence,
      kind,
      allowMultiplePerDay: false,
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: true,
      correlateWithinGroup: false,
      virtualSeries: [],
      multiSelect: false,
      showOptionValues: false,
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
        timeSinceCategoryIds: [],
      },
      virtualSeries: [],
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
      virtualSeries: [],
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
      notes: { sentimentEnabled: true },
      virtualSeries: [],
    };
  }

  if (kind === 'event-time') {
    return {
      id: createId('category'),
      name: baseName,
      nameSequence,
      kind,
      allowMultiplePerDay: false,
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: true,
      correlateWithinGroup: false,
      eventTime: { use24HourClock: true, timeSinceCategoryIds: [] },
      virtualSeries: [],
    };
  }

  return {
    id: createId('category'),
    name: baseName,
    nameSequence,
    kind,
    allowMultiplePerDay: false,
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
  const { mainAggregation: legacy, ...withoutLegacy } = next;
  const current = withoutLegacy as CategoryDefinition;
  return { ...current, virtualSeries: recomputeVirtualSeries(current) };
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
      duration: {
        splitEnabled: false,
        showMilliseconds: false,
        resetEnabled: true,
        cumulative: false,
        animate: true,
        use24HourClock: true,
        timeSinceCategoryIds: [],
      },
      virtualSeries: category.virtualSeries,
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
      notes: { sentimentEnabled: true },
      virtualSeries: [],
    };
  }

  if (kind === 'event-time') {
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
      eventTime: { use24HourClock: true, timeSinceCategoryIds: [] },
      virtualSeries: category.virtualSeries,
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
    range:
      category.kind === 'number'
        ? category.range
        : { min: 0, max: 10, step: 1 },
  };
};
