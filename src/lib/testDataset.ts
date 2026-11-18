import { getLocalDateKey, makeRecordKey } from './dates';
import { createDefaultCategory, recomputeVirtualSeries } from './category';
import { scoreSentiment } from './sentiment';
import type {
  CategoryDefinition,
  CategoryGroup,
  CategoryKind,
  CategorySelectionRecord,
  ChoiceOption,
} from '../types/category';

export interface TestDataset {
  categories: CategoryDefinition[];
  records: Record<string, CategorySelectionRecord>;
  groups?: CategoryGroup[];
}

export const TEST_DATASET_SEED = 'correlation-app-test-dataset-v1';

const ACTIVE_WINDOW_LENGTH = 53;
const FORWARD_OFFSET_LIMIT = 31;
const FULL_WINDOW_LENGTH = ACTIVE_WINDOW_LENGTH + FORWARD_OFFSET_LIMIT;
const WINDOW_START_INDEX = FORWARD_OFFSET_LIMIT;
const originalDriverSeries = [
  1, 3, 4, 2, 0, 1, 4, 3, 1, 0, 2, 4, 1, 0, 3, 4, 2, 1, 4, 0, 2, 3, 4, 1, 0, 2,
  4, 3, 1, 0, 3,
];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
const hashSeed = (seed: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};
const createSeededRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};
const createDriverSeries = (): number[] =>
  Array.from({ length: FULL_WINDOW_LENGTH }, (_, index) => {
    return originalDriverSeries[(index + 5) % originalDriverSeries.length];
  });
const createOptions = (count: number): ChoiceOption[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `test-choice-${count}-${index}`,
    label: `${index + 1}`,
    value: index,
  }));
const createCategory = (
  id: string,
  name: string,
  optionCount: number,
  nameSequence: number,
): CategoryDefinition => ({
  id,
  name,
  nameSequence,
  kind: 'multiple-choice',
  enabled: true,
  notesEnabled: false,
  sentimentEnabled: false,
  correlateWithinGroup: false,
  allowMultiplePerDay: false,
  virtualSeries: [],
  weeklyEffectEnabled: false,
  multiSelect: false,
  optionSeriesMode: 'intensity',
  optionOccurrenceMode: 'capped',
  options: createOptions(optionCount),
});
const createDateWindow = (): string[] =>
  Array.from({ length: ACTIVE_WINDOW_LENGTH }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (ACTIVE_WINDOW_LENGTH - index - 1));
    return getLocalDateKey(date);
  });
const sampleWindow = (series: number[]): number[] =>
  series.slice(WINDOW_START_INDEX, WINDOW_START_INDEX + ACTIVE_WINDOW_LENGTH);
const shiftSeries = (series: number[], shift: number): number[] =>
  Array.from(
    { length: ACTIVE_WINDOW_LENGTH },
    (_, index) => series[WINDOW_START_INDEX + index - shift],
  );
const transformPreservingExtremes = (
  series: number[],
  middleMap: Record<number, number>,
): number[] =>
  series.map((value) =>
    value === 0 || value === 4 ? value : middleMap[value],
  );
const buildPeakOnlySeries = (baseSeries: number[]): number[] => {
  const peakOrdinals = new Set([0, 2, 4]);
  let peakCursor = 0;
  return baseSeries.map((value, index) =>
    value === 4
      ? peakOrdinals.has(peakCursor++)
        ? 4
        : 2
      : [1, 2, 2, 1, 3][index % 5],
  );
};
const buildHalfFrequencySeries = (baseSeries: number[]): number[] => {
  let peakCursor = 0;
  return baseSeries.map((value, index) => {
    if (value === 4) return peakCursor++ % 2 === 0 ? 4 : 1;
    return value === 0 ? 1 : [1, 2, 1, 3][index % 4];
  });
};
const buildPeakSubsetSeries = (
  baseSeries: number[],
  random: () => number,
): number[] => {
  const selected = baseSeries
    .filter((value) => value === 4)
    .map(() => random() >= 0.5);
  if (!selected.some(Boolean)) selected[0] = true;
  if (selected.every(Boolean)) selected[selected.length - 1] = false;
  const alternating = (start: boolean) =>
    selected.every(
      (isSelected, index) => isSelected === (index % 2 === 0 ? start : !start),
    );
  if (alternating(true) || alternating(false))
    selected[Math.floor(selected.length / 2)] =
      !selected[Math.floor(selected.length / 2)];
  let peakCursor = 0;
  return baseSeries.map((value, index) => {
    if (value === 4) return selected[peakCursor++] ? 4 : 2;
    return value === 0 ? [1, 2, 1][index % 3] : [2, 1, 3, 2][index % 4];
  });
};
const quantizeSeries = (series: number[], levels: number): number[] =>
  series.map((value) =>
    clamp(Math.round((value / 4) * (levels - 1)), 0, levels - 1),
  );
const buildWaveSeries = (): number[] =>
  Array.from({ length: FULL_WINDOW_LENGTH }, (_, index) =>
    clamp(Math.round(2 + 2 * Math.sin((2 * Math.PI * index) / 7)), 0, 4),
  );
const createRecordTime = (categoryIndex: number): string =>
  `${8 + Math.floor(categoryIndex / 4)}`.padStart(2, '0') +
  `:${(categoryIndex * 7) % 60}`.padStart(2, '0') +
  ':00';

export const createBuiltInTestDataset = (
  seed = TEST_DATASET_SEED,
): TestDataset => {
  const random = createSeededRandom(seed);
  const fullDriverSeries = createDriverSeries();
  const baseSeries = sampleWindow(fullDriverSeries);
  const shiftedPlusOne = shiftSeries(fullDriverSeries, 1);
  const fullWaveSeries = buildWaveSeries();
  const categories: CategoryDefinition[] = (
    [
      ['a', 'A Base', 5],
      ['b', 'B Echo', 5],
      ['c', 'C Peaks', 5],
      ['d', 'D Troughs', 5],
      ['e', 'E Alt Peaks', 5],
      ['f', 'F Peak Sample', 5],
      ['g', 'G Noise', 5],
      ['h', 'H Lag Echo', 5],
      ['i', 'I Base 3', 3],
      ['j', 'J Base 2', 2],
      ['k', 'K Lag 0', 5],
      ...[1, 2, 3, 4, 5, 6, 7, FORWARD_OFFSET_LIMIT].map(
        (offset) =>
          [`lag-${offset}`, `Lag +${offset}`, 5] as [string, string, number],
      ),
      ['single', 'Single', 1],
      ['fixed-high', 'Fixed High', 5],
      ['wave', 'Wave', 5],
      ['wave-plus-one', 'Wave +1', 5],
      ['wave-plus-two', 'Wave +2', 5],
      ['lag-noisy', 'Lag +2 Noisy', 5],
    ] as Array<[string, string, number]>
  ).map(([id, name, optionCount], index) =>
    createCategory(`test-category-${id}`, name, optionCount, index + 1),
  );
  const seriesByCategoryId = new Map<string, number[]>([
    ['test-category-a', baseSeries],
    [
      'test-category-b',
      transformPreservingExtremes(baseSeries, { 1: 2, 2: 1, 3: 3 }),
    ],
    ['test-category-c', buildPeakOnlySeries(baseSeries)],
    [
      'test-category-d',
      baseSeries.map((value, index) =>
        value === 0
          ? 0
          : value === 4
            ? [2, 3, 2, 1, 3][index % 5]
            : [1, 2, 3, 2][index % 4],
      ),
    ],
    ['test-category-e', buildHalfFrequencySeries(baseSeries)],
    ['test-category-f', buildPeakSubsetSeries(baseSeries, random)],
    [
      'test-category-g',
      Array.from({ length: ACTIVE_WINDOW_LENGTH }, () =>
        Math.floor(random() * 5),
      ),
    ],
    [
      'test-category-h',
      transformPreservingExtremes(shiftedPlusOne, { 1: 1, 2: 3, 3: 2 }),
    ],
    ['test-category-i', quantizeSeries(baseSeries, 3)],
    ['test-category-j', quantizeSeries(baseSeries, 2)],
    ['test-category-k', shiftSeries(fullDriverSeries, 0)],
    ...[1, 2, 3, 4, 5, 6, 7, FORWARD_OFFSET_LIMIT].map(
      (offset) =>
        [
          `test-category-lag-${offset}`,
          shiftSeries(fullDriverSeries, offset),
        ] as [string, number[]],
    ),
    ['test-category-single', new Array(ACTIVE_WINDOW_LENGTH).fill(0)],
    ['test-category-fixed-high', new Array(ACTIVE_WINDOW_LENGTH).fill(4)],
    ['test-category-wave', sampleWindow(fullWaveSeries)],
    ['test-category-wave-plus-one', shiftSeries(fullWaveSeries, 1)],
    ['test-category-wave-plus-two', shiftSeries(fullWaveSeries, 2)],
    [
      'test-category-lag-noisy',
      shiftedPlusOne.map((value) =>
        clamp(value + [-1, 0, 0, 1][Math.floor(random() * 4)], 0, 4),
      ),
    ],
  ]);
  const records: Record<string, CategorySelectionRecord> = {};
  categories.forEach((category, categoryIndex) => {
    const series = seriesByCategoryId.get(category.id)!;
    createDateWindow().forEach((dateKey, dayIndex) => {
      const key = makeRecordKey(dateKey, 0, category.id);
      records[key] = {
        key,
        categoryId: category.id,
        dateKey,
        ordinal: 0,
        localTime: createRecordTime(categoryIndex),
        value: series[dayIndex],
      };
    });
  });
  return { categories, records };
};

interface DatasetCategorySpec {
  id: string;
  name: string;
  kind: CategoryKind;
  values: number[];
  multiple?: boolean;
  sparse?: boolean;
  edge?: boolean;
}

const createTypedTestDataset = (specs: DatasetCategorySpec[]): TestDataset => {
  const dates = createDateWindow();
  const records: Record<string, CategorySelectionRecord> = {};
  const categories = specs.map((spec, index) => {
    let category: CategoryDefinition = {
      ...createDefaultCategory(spec.kind, index, spec.name),
      id: spec.id,
      virtualSeries: [],
      allowMultiplePerDay: spec.multiple ?? false,
      sentimentEnabled: spec.kind === 'notes' && Boolean(spec.multiple),
    };
    if (category.kind === 'multiple-choice') {
      category = {
        ...category,
        options: createOptions(5),
        multiSelect: Boolean(spec.multiple),
        optionSeriesMode: spec.multiple ? 'items' : 'intensity',
        optionOccurrenceMode: spec.multiple ? 'sum' : 'capped',
      };
    } else if (category.kind === 'number') {
      category = {
        ...category,
        range: spec.edge
          ? { min: -100, max: 100, step: 0.25 }
          : { min: 0, max: 4, step: 1 },
      };
    } else if (category.kind === 'duration') {
      category = {
        ...category,
        duration: {
          ...category.duration,
          splitEnabled: Boolean(spec.multiple),
          cumulative: Boolean(spec.multiple),
          showMilliseconds: Boolean(spec.edge),
          use24HourClock: !spec.multiple,
        },
      };
    } else if (category.kind === 'counter') {
      category = {
        ...category,
        counter: {
          ...category.counter,
          steps: spec.edge ? [-10, -1, 1, 10] : [-1, 1],
          splitEnabled: Boolean(spec.multiple),
          resetEnabled: Boolean(spec.multiple),
          editable: !spec.multiple,
        },
      };
    } else if (category.kind === 'event-time') {
      category = {
        ...category,
        eventTime: { ...category.eventTime, use24HourClock: !spec.multiple },
      };
    } else {
      category = {
        ...category,
        notes: { sentimentEnabled: category.sentimentEnabled },
      };
    }
    category = { ...category, virtualSeries: recomputeVirtualSeries(category) };
    dates.forEach((dateKey, dayIndex) => {
      if (spec.sparse && dayIndex % 3 !== 0) return;
      const count = spec.multiple ? 1 + (dayIndex % 3) : 1;
      for (let ordinal = 0; ordinal < count; ordinal += 1) {
        const key = makeRecordKey(dateKey, ordinal, category.id);
        const value = spec.values[(dayIndex + ordinal) % spec.values.length];
        const entry: CategorySelectionRecord = {
          key,
          categoryId: category.id,
          dateKey,
          ordinal,
          localTime: ordinal ? `1${ordinal}:00:00` : '09:00:00',
          value,
        };
        if (category.kind === 'multiple-choice') {
          entry.selectedValues = category.multiSelect
            ? [...new Set([value, (value + 1) % category.options.length])]
            : [value];
        } else if (category.kind === 'duration') {
          const durationMs = spec.edge
            ? [0, 1, 999, 1001, 90061001][(dayIndex + ordinal) % 5]
            : value * 15 * 60 * 1000;
          const start = new Date(
            `${dateKey}T${spec.edge ? '23:59:59' : entry.localTime}`,
          );
          const stop = new Date(start.getTime() + durationMs);
          entry.startTime = start.toISOString();
          entry.stopTime = stop.toISOString();
          entry.durationMs = durationMs;
          entry.durationMsExact = durationMs;
          entry.value = durationMs;
          entry.instanceId = key;
          entry.durationRuns = [
            {
              startTime: entry.startTime,
              stopTime: entry.stopTime,
              durationMs,
            },
          ];
        } else if (category.kind === 'notes') {
          const noteText = spec.edge
            ? [
                '',
                '   ',
                '!!! ... ?',
                'echo echo echo',
                'Long note. '.repeat(120),
              ][(dayIndex + ordinal) % 5]
            : category.sentimentEnabled
              ? [
                  'terrible sad',
                  'bad',
                  'ordinary day',
                  'good',
                  'wonderful happy love',
                ][value]
              : Array.from({ length: value + 1 }, () => 'journal').join(' ');
          entry.noteText = noteText;
          entry.sentimentScore = scoreSentiment(noteText);
          entry.value = entry.sentimentScore;
        } else if (category.kind === 'event-time') {
          // The event time of day carries the signal: values 0-4 map to 06:00-18:00.
          entry.localTime = `${String(6 + value * 3).padStart(2, '0')}:${String(
            (dayIndex * 7) % 60,
          ).padStart(2, '0')}:00`;
        }
        records[key] = entry;
      }
    });
    return category;
  });
  return { categories, records };
};

const createTypeEdgeDataset = (
  kind: Exclude<CategoryKind, 'multiple-choice'>,
): TestDataset => {
  const choices = createBuiltInTestDataset();
  const dates = createDateWindow();
  const specs: DatasetCategorySpec[] = choices.categories.map((category) => ({
    id: `${kind}-${category.id}`,
    name: category.name,
    kind,
    values: dates.map(
      (date) => choices.records[makeRecordKey(date, 0, category.id)].value,
    ),
  }));
  const baseValues = specs[0].values;
  specs.push(
    {
      id: `test-${kind}-multiple`,
      name: 'Multiple entries',
      kind,
      values: baseValues,
      multiple: true,
    },
    {
      id: `test-${kind}-sparse`,
      name: 'Missing days',
      kind,
      values: baseValues,
      sparse: true,
    },
    {
      id: `test-${kind}-edges`,
      name: kind === 'duration' ? 'Precision and overnight' : 'Boundary values',
      kind,
      values:
        kind === 'number'
          ? [-100, -0.25, 0, 0.25, 100]
          : kind === 'counter'
            ? [-1000, -1, 0, 1, 1000000]
            : baseValues,
      edge: true,
    },
  );
  return createTypedTestDataset(specs);
};

const createShowcaseDataset = (): TestDataset => {
  const values = sampleWindow(createDriverSeries());
  const modes: Array<[CategoryKind, string, string]> = [
    ['multiple-choice', 'Choice intensity', 'Choice items'],
    ['number', 'Number slider', 'Number repeated readings'],
    ['duration', 'Duration timer', 'Duration cumulative laps'],
    ['counter', 'Counter editable', 'Counter split steps'],
    ['notes', 'Notes word metrics', 'Notes sentiment journal'],
  ];
  return createTypedTestDataset(
    modes.flatMap(([kind, single, multiple]) => [
      { id: `showcase-${kind}-single`, name: single, kind, values },
      {
        id: `showcase-${kind}-multiple`,
        name: multiple,
        kind,
        values,
        multiple: true,
      },
    ]),
  );
};

// Required only inside App's __DEV__ branch so Metro excludes the fixtures in releases.
export const createTestWorkspaceDataset = (
  name: string,
  existingChoice?: TestDataset,
): TestDataset | undefined => {
  switch (name.trim().toLowerCase()) {
    case 'testchoice':
      return existingChoice ?? createBuiltInTestDataset();
    case 'testnumber':
      return createTypeEdgeDataset('number');
    case 'testduration':
      return createTypeEdgeDataset('duration');
    case 'testcounter':
      return createTypeEdgeDataset('counter');
    case 'testnotes':
      return createTypeEdgeDataset('notes');
    case 'testevent':
      return createTypeEdgeDataset('event-time');
    case 'testdata':
      return createShowcaseDataset();
    default:
      return undefined;
  }
};
