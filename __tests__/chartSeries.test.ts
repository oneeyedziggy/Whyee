import {
  createDefaultCategory,
  recomputeVirtualSeries,
} from '../src/lib/category';
import { buildChartCategories } from '../src/lib/chartSeries';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../src/types/category';

it('projects disabled alternatives, ordinal gaps and every raw timestamp without mutating definitions', () => {
  const base = createDefaultCategory('number', 0, 'Reading');
  const category: CategoryDefinition = {
    ...base,
    id: 'reading',
    allowMultiplePerDay: true,
    virtualSeries: [],
  };
  category.virtualSeries = recomputeVirtualSeries(category).map(
    (definition) => ({ ...definition, enabled: false }),
  );
  const records: Record<string, CategorySelectionRecord> = {};
  for (const [key, dateKey, ordinal, value, localTime] of [
    ['a', '2026-10-05', 0, 2, '09:00:00'],
    ['b', '2026-10-05', 2, 5, '15:00:00'],
    ['c', '2026-10-06', 0, 3, '09:00:00'],
    ['d', '2026-10-06', 1, 4, '12:00:00'],
  ] as const)
    records[key] = {
      key,
      dateKey,
      ordinal,
      value,
      localTime,
      categoryId: category.id,
      instanceId: key,
    };
  const before = JSON.stringify(category);
  const chart = buildChartCategories([category], records)[0];
  expect(
    chart.series
      .find((series) => series.label === 'sum')
      ?.points.map((point) => point.value),
  ).toEqual([7, 7]);
  expect(
    chart.series
      .find((series) => series.label === 'instance 2')
      ?.points.map((point) => point.value),
  ).toEqual([null, 4]);
  expect(
    chart.series
      .find((series) => series.label === 'instance 3')
      ?.points.map((point) => point.value),
  ).toEqual([5, null]);
  expect(
    chart.series
      .find((series) => series.raw)
      ?.points.map((point) => new Date(point.timestamp).getHours()),
  ).toEqual([9, 15, 9, 12]);
  expect(JSON.stringify(category)).toBe(before);
});

it('charts notes without sentiment by their note metrics and keeps constant values centered', () => {
  const notes = {
    ...createDefaultCategory('notes', 0, 'Journal'),
    id: 'journal',
    sentimentEnabled: false,
  };
  const chart = buildChartCategories([notes], {
    note: {
      key: 'note',
      categoryId: notes.id,
      dateKey: '2026-10-05',
      ordinal: 0,
      value: 0,
      localTime: '12:30:00',
      noteText: 'one two three',
    },
  })[0];
  expect(chart.defaultSeriesId).toBe(
    'journal:chart:virtual:journal:note:words',
  );
  expect(chart.series.map((series) => series.label)).not.toContain('sentiment');
  const words = chart.series.find(
    (series) => series.id === chart.defaultSeriesId,
  );
  expect(words?.label).toBe('word count');
  expect(words?.points.map((point) => point.value)).toEqual([3]);
  expect(words?.points.map((point) => point.normalized)).toEqual([0.5]);
  expect(chart.series.some((series) => series.raw)).toBe(false);
});

it('lists every virtual series with category-enabled ones before disabled ones', () => {
  const base = createDefaultCategory('number', 0, 'Reading');
  const category: CategoryDefinition = {
    ...base,
    id: 'reading',
    allowMultiplePerDay: true,
    virtualSeries: [],
  };
  category.virtualSeries = recomputeVirtualSeries(category).map(
    (definition) => ({
      ...definition,
      enabled: definition.id.endsWith(':value:max'),
    }),
  );
  const chart = buildChartCategories([category], {})[0];
  const labels = chart.series.map((series) => series.label);

  expect(labels[0]).toBe('max');
  expect(labels.slice(1)).toEqual(
    expect.arrayContaining([
      'count',
      'mean',
      'median',
      'sum',
      'product',
      'min',
    ]),
  );
  expect(labels).not.toContain('Raw');
  expect(labels).not.toContain('Main');
  expect(chart.defaultSeriesId).toBe(
    'reading:chart:virtual:reading:value:mean',
  );
});

it('exposes only a value series for single-entry categories and daily stats for multiple entries', () => {
  const chartFor = (candidate: CategoryDefinition) =>
    buildChartCategories([candidate], {})[0];
  const labelsFor = (candidate: CategoryDefinition) =>
    chartFor(candidate).series.map((series) => series.label);

  for (const kind of ['number', 'multiple-choice', 'counter'] as const) {
    const single = {
      ...createDefaultCategory(kind, 0, 'Reading'),
      id: 'reading',
    };
    const chart = chartFor(single);
    expect(chart.series.map((series) => series.label)).toEqual(['value']);
    expect(chart.series[0].id).toBe('reading:chart:virtual:reading:value');
    expect(chart.defaultSeriesId).toBe('reading:chart:virtual:reading:value');
  }
  const duration = {
    ...createDefaultCategory('duration', 0, 'Sleep'),
    id: 'sleep',
  };
  expect(labelsFor(duration)).toEqual(['duration', 'start time', 'stop time']);
  expect(chartFor(duration).defaultSeriesId).toBe(
    'sleep:chart:virtual:sleep:duration',
  );

  const multiple = {
    ...createDefaultCategory('number', 0, 'Reading'),
    id: 'reading',
    allowMultiplePerDay: true,
  };
  const labels = labelsFor(multiple);
  expect(labels[0]).toBe('mean');
  expect(labels).toEqual(
    expect.arrayContaining(['count', 'median', 'sum', 'product', 'min', 'max']),
  );
  expect(labels).not.toContain('Main');
  expect(labels.some((label) => label.startsWith('Daily '))).toBe(false);
  expect(chartFor(multiple).defaultSeriesId).toBe(
    'reading:chart:virtual:reading:value:mean',
  );
  const multipleCounter = {
    ...createDefaultCategory('counter', 0, 'Steps'),
    id: 'steps',
    allowMultiplePerDay: true,
  };
  expect(chartFor(multipleCounter).defaultSeriesId).toBe(
    'steps:chart:virtual:steps:value:sum',
  );
  const multipleDuration = { ...duration, allowMultiplePerDay: true };
  const durationChart = chartFor(multipleDuration);
  expect(durationChart.defaultSeriesId).toBe(
    'sleep:chart:virtual:sleep:duration:sum',
  );
  expect(durationChart.series[0].label).toBe('total duration');
});

it('keeps globally missing days as gaps and centers constant daily points', () => {
  const category = { ...createDefaultCategory('number', 0), id: 'reading' };
  const records = Object.fromEntries(
    ['2026-10-05', '2026-10-07'].map((dateKey) => [
      dateKey,
      {
        key: dateKey,
        categoryId: category.id,
        dateKey,
        ordinal: 0,
        value: 2,
        localTime: '09:00:00',
      },
    ]),
  );
  const chart = buildChartCategories([category], records)[0];
  const main = chart.series[0];
  expect(main.id).toBe(chart.defaultSeriesId);
  expect(main.label).toBe('value');
  expect(main.points.map((point) => point.value)).toEqual([2, null, 2]);
  expect(main.points.map((point) => point.normalized)).toEqual([
    0.5,
    null,
    0.5,
  ]);
});

it('uses shared sentiment evaluation for the default series when a score is not cached', () => {
  const category = {
    ...createDefaultCategory('notes', 0),
    id: 'notes',
    sentimentEnabled: true,
  };
  const chart = buildChartCategories([category], {
    note: {
      key: 'note',
      categoryId: category.id,
      dateKey: '2026-10-05',
      ordinal: 0,
      value: 0,
      localTime: '12:30:00',
      noteText: 'happy wonderful excellent',
    },
  })[0];
  const value = chart.series.find((series) => series.label === 'sentiment')
    ?.points[0].value;
  expect(value).toBeGreaterThan(0);
  expect(chart.series[0].id).toBe(chart.defaultSeriesId);
  expect(chart.series[0].points[0].value).toBe(value);
  expect(chart.series.some((series) => series.raw)).toBe(false);
});

it('shows Raw only when multiple entries are allowed and some day has several entries', () => {
  const category = {
    ...createDefaultCategory('number', 0, 'Reading'),
    id: 'reading',
    allowMultiplePerDay: true,
  };
  const record = (key: string, ordinal: number) => ({
    key,
    categoryId: category.id,
    dateKey: '2026-10-05',
    ordinal,
    value: ordinal + 1,
    localTime: `0${ordinal + 9}:00:00`,
  });
  const labelsFor = (records: Record<string, ReturnType<typeof record>>) =>
    buildChartCategories([category], records)[0].series.map(
      (series) => series.label,
    );

  expect(labelsFor({ a: record('a', 0) })).not.toContain('Raw');
  expect(labelsFor({ a: record('a', 0), b: record('b', 1) })).toContain('Raw');
  expect(
    buildChartCategories([{ ...category, allowMultiplePerDay: false }], {
      a: record('a', 0),
      b: record('b', 1),
    })[0].series.map((series) => series.label),
  ).not.toContain('Raw');
});

it('marks duration-valued series with their milliseconds display preference', () => {
  const category = createDefaultCategory('duration', 0, 'Sleep');
  if (category.kind !== 'duration') throw new Error('expected duration');
  category.duration.showMilliseconds = true;
  category.allowMultiplePerDay = true;
  const chart = buildChartCategories([category], {
    sleep: {
      key: '2026-10-06:0:sleep',
      categoryId: category.id,
      dateKey: '2026-10-06',
      ordinal: 0,
      localTime: '19:00:00',
      value: 90061001,
      durationMs: 90061001,
      durationMsExact: 90061001,
    },
    nap: {
      key: '2026-10-06:1:sleep',
      categoryId: category.id,
      dateKey: '2026-10-06',
      ordinal: 1,
      localTime: '21:00:00',
      value: 1000,
      durationMs: 1000,
      durationMsExact: 1000,
    },
  })[0];

  expect(
    chart.series.find((series) => series.id === chart.defaultSeriesId),
  ).toMatchObject({
    label: 'total duration',
    durationValue: true,
    showMilliseconds: true,
  });
  expect(
    chart.series.find((series) => series.label === 'mean duration'),
  ).toMatchObject({ durationValue: true });
  expect(chart.series.find((series) => series.label === 'count')).toMatchObject(
    { durationValue: false },
  );
  expect(chart.series.find((series) => series.label === 'Raw')).toMatchObject({
    durationValue: true,
    showMilliseconds: true,
  });
});

describe('chart series edge cases', () => {
  const record = (
    categoryId: string,
    key: string,
    dateKey: string,
    value: number,
    ordinal = 0,
  ): CategorySelectionRecord => ({
    key,
    categoryId,
    dateKey,
    ordinal,
    value,
    localTime: '09:00:00',
  });

  it('leaves non-finite values out of daily and raw series', () => {
    const category = {
      ...createDefaultCategory('number', 0, 'N'),
      id: 'n',
      allowMultiplePerDay: true,
    };
    const chart = buildChartCategories([category], {
      a: record('n', 'a', '2026-01-01', Number.NaN),
      b: record('n', 'b', '2026-01-02', 4),
      c: record('n', 'c', '2026-01-02', 6, 1),
    })[0];
    expect(
      chart.series
        .find((series) => series.label === 'mean')
        ?.points.map((point) => point.value),
    ).toEqual([null, 5]);
    expect(
      chart.series
        .find((series) => series.raw)
        ?.points.map((point) => point.key),
    ).toEqual(['b', 'c']);
  });

  it('adds mirrored inverse series only when inverses are shown', () => {
    const category = { ...createDefaultCategory('number', 0, 'N'), id: 'n' };
    const records = {
      a: record('n', 'a', '2026-01-01', 2),
      b: record('n', 'b', '2026-01-02', 6),
    };
    const hidden = buildChartCategories([category], records)[0];
    expect(hidden.series.some((series) => series.id.endsWith(':inverse'))).toBe(
      false,
    );
    const shown = buildChartCategories([category], records, {
      categories: {
        n: { enabled: true, selectedSeriesIds: [], showInverses: true },
      },
    })[0];
    const inverse = shown.series.find(
      (series) => series.id === 'n:chart:virtual:n:value:inverse',
    );
    expect(inverse?.label).toBe('value inverse');
    expect(inverse?.points.map((point) => point.value)).toEqual([6, 2]);
    const empty = buildChartCategories(
      [category],
      {},
      {
        categories: {
          n: { enabled: true, selectedSeriesIds: [], showInverses: true },
        },
      },
    )[0];
    expect(
      empty.series.find((series) => series.id.endsWith(':inverse'))?.points,
    ).toEqual([]);
  });

  it('keeps selected entry positions without data and escapes the category id', () => {
    const category = {
      ...createDefaultCategory('number', 0, 'N'),
      id: 'a.b',
      allowMultiplePerDay: true,
    };
    const base = 'a.b:chart:virtual:a.b:instance';
    const chart = buildChartCategories(
      [category],
      { a: record('a.b', 'a', '2026-01-01', 1) },
      {
        categories: {
          'a.b': {
            enabled: true,
            selectedSeriesIds: [
              `${base}:ordinal:3:inverse`,
              'aXb:chart:virtual:a.b:instance:ordinal:7',
              `${base}:ordinal:x`,
            ],
          },
        },
      },
    )[0];
    expect(
      chart.series
        .filter((series) => series.id.startsWith(`${base}:`))
        .map((series) => [series.id, series.label]),
    ).toEqual([
      [`${base}:ordinal:0`, 'instance 1'],
      [`${base}:ordinal:3`, 'instance 4'],
    ]);
    expect(
      chart.series
        .find((series) => series.id === `${base}:ordinal:3`)
        ?.points.map((point) => point.value),
    ).toEqual([null]);
  });

  it('falls back to the first series, or none, without a primary series', () => {
    const choice = {
      ...createDefaultCategory('multiple-choice', 0, 'C'),
      id: 'c',
      optionSeriesMode: 'items' as const,
      options: [],
    };
    expect(buildChartCategories([choice], {})[0]).toMatchObject({
      series: [],
      defaultSeriesId: '',
    });
    const withNotes = buildChartCategories(
      [{ ...choice, notesEnabled: true }],
      {},
    )[0];
    expect(withNotes.series.length).toBeGreaterThan(0);
    expect(withNotes.defaultSeriesId).toBe(withNotes.series[0].id);
  });
});
