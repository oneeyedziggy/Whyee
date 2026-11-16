import {
  initializeChartSelection,
  reconcileChartSelection,
  setChartCategoryEnabled,
  setChartInversesShown,
  toggleChartSeries,
} from '../src/lib/chartSelection';
import {
  createDefaultCategory,
  recomputeVirtualSeries,
} from '../src/lib/category';
import type { ChartCategory } from '../src/types/charts';

const value = 'reading:chart:virtual:reading:value';
const category: ChartCategory = {
  id: 'reading',
  name: 'Reading',
  defaultSeriesId: value,
  series: [
    {
      id: value,
      label: 'value',
      name: 'Reading: value',
      color: '#000',
      raw: false,
      points: [{ key: 'day', timestamp: 1, value: 2, normalized: 0.5 }],
    },
    {
      id: 'reading:chart:raw',
      label: 'Raw',
      name: 'Reading: Raw',
      color: '#000',
      raw: true,
      points: [],
    },
  ],
};

it('banks header-disabled choices but clears individually deselected choices', () => {
  let selection = initializeChartSelection([category]);
  selection = toggleChartSeries(selection, category.id, 'reading:chart:raw');
  selection = toggleChartSeries(selection, category.id, value);
  selection = setChartCategoryEnabled(selection, category, false);
  expect(selection.categories.reading).toEqual({
    enabled: false,
    selectedSeriesIds: ['reading:chart:raw'],
  });
  selection = setChartCategoryEnabled(
    JSON.parse(JSON.stringify(selection)),
    category,
    true,
  );
  expect(selection.categories.reading).toEqual({
    enabled: true,
    selectedSeriesIds: ['reading:chart:raw'],
  });
  selection = toggleChartSeries(selection, category.id, 'reading:chart:raw');
  expect(selection.categories.reading).toEqual({
    enabled: false,
    selectedSeriesIds: [],
  });
  selection = setChartCategoryEnabled(selection, category, true);
  expect(selection.categories.reading.selectedSeriesIds).toEqual([value]);
});

it('drops hidden inverse choices and falls back to the default series', () => {
  let selection = initializeChartSelection([category]);
  selection = setChartInversesShown(selection, category, true);
  selection = toggleChartSeries(selection, category.id, `${value}:inverse`);
  selection = toggleChartSeries(selection, category.id, value);
  expect(selection.categories.reading).toEqual({
    enabled: true,
    showInverses: true,
    selectedSeriesIds: [`${value}:inverse`],
  });
  selection = setChartInversesShown(selection, category, false);
  expect(selection.categories.reading).toEqual({
    enabled: true,
    showInverses: false,
    selectedSeriesIds: [value],
  });
});

it('prunes deleted definitions but retains globally disabled categories and remembered ordinals', () => {
  const base = {
    ...createDefaultCategory('number', 0, 'Reading'),
    id: 'reading',
    allowMultiplePerDay: true,
    enabled: false,
  };
  const inventory = { ...base, virtualSeries: recomputeVirtualSeries(base) };
  const selection = {
    categories: {
      reading: {
        enabled: false,
        selectedSeriesIds: ['reading:chart:virtual:reading:instance:ordinal:9'],
      },
    },
  };
  expect(reconcileChartSelection(selection, [inventory])).toBe(selection);
  expect(reconcileChartSelection(selection, []).categories).toEqual({});
  const changed = reconcileChartSelection(selection, [
    { ...inventory, allowMultiplePerDay: false },
  ]);
  expect(changed.categories.reading.selectedSeriesIds).toEqual([]);
});

it('maps legacy Main and renamed series choices to their current IDs', () => {
  const base = {
    ...createDefaultCategory('number', 0, 'Reading'),
    id: 'reading',
    allowMultiplePerDay: true,
    mainAggregation: 'max' as const,
    virtualSeries: [],
  };
  const inventory = { ...base, virtualSeries: recomputeVirtualSeries(base) };
  const reconciled = reconcileChartSelection(
    {
      categories: {
        reading: {
          enabled: true,
          selectedSeriesIds: [
            'reading:chart:main',
            'reading:chart:virtual:reading:sum',
            'reading:chart:virtual:reading:sum:inverse',
          ],
        },
      },
    },
    [inventory],
  );
  expect(reconciled.categories.reading.selectedSeriesIds).toEqual([
    'reading:chart:virtual:reading:value:max',
    'reading:chart:virtual:reading:value:sum',
    'reading:chart:virtual:reading:value:sum:inverse',
  ]);
});

describe('selection edge cases', () => {
  const reconcileIds = (
    definition: ReturnType<typeof createDefaultCategory>,
    ids: string[],
  ) =>
    reconcileChartSelection(
      {
        categories: {
          [definition.id]: { enabled: true, selectedSeriesIds: ids },
        },
      },
      [definition],
    ).categories[definition.id];

  it('drops legacy main series when the category has no primary series', () => {
    const choice = {
      ...createDefaultCategory('multiple-choice', 0),
      id: 'mood',
      optionSeriesMode: 'items' as const,
      options: [],
    };
    expect(reconcileIds(choice, ['mood:chart:main'])).toEqual({
      enabled: false,
      selectedSeriesIds: [],
    });
  });

  it('keeps raw series only for categories with multiple entries per day', () => {
    const single = { ...createDefaultCategory('number', 0), id: 'n' };
    expect(reconcileIds(single, ['n:chart:raw']).selectedSeriesIds).toEqual([]);
    const multiple = { ...single, allowMultiplePerDay: true };
    expect(reconcileIds(multiple, ['n:chart:raw']).selectedSeriesIds).toEqual([
      'n:chart:raw',
    ]);
  });

  it('drops ids that are not chart series of the category', () => {
    const single = { ...createDefaultCategory('number', 0), id: 'n' };
    expect(
      reconcileIds(single, ['n:chart:bogus', 'other:chart:raw'])
        .selectedSeriesIds,
    ).toEqual([]);
  });

  it('starts fresh state for categories missing from the selection', () => {
    const empty = { categories: {} };
    expect(
      setChartCategoryEnabled(empty, category, true).categories.reading,
    ).toEqual({ enabled: true, selectedSeriesIds: [value] });
    expect(
      setChartCategoryEnabled(empty, category, false).categories.reading,
    ).toEqual({ enabled: false, selectedSeriesIds: [] });
    expect(
      setChartInversesShown(empty, category, true).categories.reading,
    ).toEqual({
      enabled: true,
      showInverses: true,
      selectedSeriesIds: [value],
    });
    expect(
      toggleChartSeries(empty, 'reading', 'reading:chart:raw').categories
        .reading,
    ).toEqual({ enabled: true, selectedSeriesIds: ['reading:chart:raw'] });
  });
});
