import { getLocalDateKey, makeRecordKey } from './dates';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
  ChoiceOption,
} from '../types/category';

interface TestDataset {
  categories: CategoryDefinition[];
  records: Record<string, CategorySelectionRecord>;
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
  return hash >>> 0 || 1;
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
  mainAggregation: 'mean',
  virtualSeries: [],
  weeklyEffectEnabled: false,
  multiSelect: false,
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
    value === 0 || value === 4 ? value : (middleMap[value] ?? value),
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
    const series = seriesByCategoryId.get(category.id);
    if (!series) return;
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
