import {
  buildDailySeries,
  computeCorrelationCell,
  computeRows,
  computeRowsAsync,
  computeRowsProgressively,
  pearson,
} from '../src/lib/correlationEngine';
import {
  computePreparedCorrelationRange,
  getPreparedCorrelationCellCount,
  mergePreparedCorrelationCells,
  prepareCorrelation,
} from '../src/lib/correlationKernel';
import { createCorrelationTask } from '../src/workers/correlationTask';
import {
  createBuiltInTestDataset,
  TEST_DATASET_SEED,
} from '../src/lib/testDataset';
import {
  createDefaultCategory,
  recomputeVirtualSeries,
} from '../src/lib/category';
import { createVirtualCorrelationInput } from '../src/lib/virtualSeries';
import { documentationSections } from '../src/lib/documentation';
import { scoreSentiment } from '../src/lib/sentiment';
import { createCorrelationInputHash } from '../src/lib/hash';
import { normalizeGroups } from '../src/lib/groups';
import {
  createDefaultStatisticsSettings,
  isStatisticEnabled,
  statisticsRegistry,
} from '../src/lib/statistics';

describe('correlation engine', () => {
  it('calculates Pearson correlation', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
  });

  it('correlates categories using natural-log transformed values', () => {
    const rows = computeRows({
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
        { categoryId: 'a', dateKey: '2026-01-02', value: 4 },
        { categoryId: 'a', dateKey: '2026-01-03', value: 9 },
        { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 5 },
        { categoryId: 'b', dateKey: '2026-01-03', value: 30 },
      ],
      offsets: [0],
    });
    const expected = pearson(
      [1, 4, 9].map((value) => Math.log(value + 1)),
      [2, 5, 30].map((value) => Math.log(value + 1)),
    );

    expect(rows[0].cells[0].value).toBeCloseTo(expected!);
    expect(rows[0].cells[0].value).not.toBeCloseTo(
      pearson([1, 4, 9], [2, 5, 30])!,
    );
  });

  it('keeps the ln transform finite for zero and negative journaled values', () => {
    const rows = computeRows({
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: -5 },
        { categoryId: 'a', dateKey: '2026-01-02', value: 0 },
        { categoryId: 'b', dateKey: '2026-01-01', value: 3 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 4 },
      ],
      offsets: [0],
    });

    expect(Number.isFinite(rows[0].cells[0].value)).toBe(true);
  });

  it('returns lagged rows from daily records', () => {
    const rows = computeRows({
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
        { categoryId: 'a', dateKey: '2026-01-02', value: 2 },
        { categoryId: 'a', dateKey: '2026-01-03', value: 3 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 1 },
        { categoryId: 'b', dateKey: '2026-01-03', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-04', value: 3 },
      ],
      offsets: [0, 1],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe('A x B');
    expect(rows[1].label).toBe('B x A');
    expect(rows[0].cells[0].value).toBeCloseTo(1);
    expect(rows[0].cells[1].value).toBeCloseTo(1);
  });

  it('keeps async correlation results equivalent to sync results', async () => {
    const input = {
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
        { categoryId: 'a', dateKey: '2026-01-02', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 4 },
      ],
      offsets: [0],
    };

    await expect(computeRowsAsync(input)).resolves.toEqual(computeRows(input));
  });

  it('merges correlation chunks deterministically after out-of-order completion', () => {
    const input = {
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
        { categoryId: 'a', dateKey: '2026-01-02', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 4 },
        { categoryId: 'c', dateKey: '2026-01-01', value: 3 },
        { categoryId: 'c', dateKey: '2026-01-02', value: 6 },
      ],
      offsets: [1, 0],
    };
    const prepared = prepareCorrelation(input);
    const total = getPreparedCorrelationCellCount(prepared);
    const midpoint = Math.floor(total / 2);
    const cells = [
      ...computePreparedCorrelationRange(prepared, midpoint, total),
      ...computePreparedCorrelationRange(prepared, 0, midpoint),
    ];

    expect(mergePreparedCorrelationCells(prepared, cells)).toEqual(
      computeRows(input),
    );
  });

  it('keeps prepared cells equivalent to the original daily-series calculation', () => {
    const input = {
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: -2 },
        { categoryId: 'a', dateKey: '2026-01-01', value: 4 },
        { categoryId: 'a', dateKey: '2026-01-03', value: 8 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 6 },
        { categoryId: 'b', dateKey: '2026-01-04', value: -1 },
      ],
      offsets: [0, 1],
    };
    const prepared = prepareCorrelation(input);
    const preparedCells = computePreparedCorrelationRange(
      prepared,
      0,
      getPreparedCorrelationCellCount(prepared),
    );
    const originalSeries = buildDailySeries(input);

    for (const cell of preparedCells) {
      const original = computeCorrelationCell(
        cell.leftCategoryId,
        cell.rightCategoryId,
        cell.offset,
        originalSeries,
      );
      if (original.value === null) expect(cell.value).toBeNull();
      else expect(cell.value).toBeCloseTo(original.value, 12);
    }
  });

  it('publishes fallback progress in bounded batches', async () => {
    const categories = Array.from({ length: 9 }, (_, index) => ({
      id: `category-${index}`,
      name: `Category ${index}`,
    }));
    const batches: number[] = [];
    const task = createCorrelationTask(
      { categories, records: [], offsets: [0] },
      (batch) => batches.push(batch.cells.length),
    );

    await expect(task.promise).resolves.toHaveLength(72);
    expect(batches).toEqual([64, 8]);
  });

  it('stops publishing fallback batches after mid-run cancellation', async () => {
    const categories = Array.from({ length: 9 }, (_, index) => ({
      id: `category-${index}`,
      name: `Category ${index}`,
    }));
    const batches: number[] = [];
    let task: ReturnType<typeof createCorrelationTask>;
    task = createCorrelationTask(
      { categories, records: [], offsets: [0, 1] },
      (batch) => {
        batches.push(batch.cells.length);
        task.cancel();
      },
    );

    await expect(task.promise).rejects.toMatchObject({
      name: 'CorrelationCancelledError',
    });
    expect(batches).toEqual([64]);
  });

  it('publishes directional cells in ascending offset order', async () => {
    const input = {
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [
        { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
        { categoryId: 'a', dateKey: '2026-01-02', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
        { categoryId: 'b', dateKey: '2026-01-02', value: 4 },
      ],
      offsets: [2, 0, 1],
    };
    const cells: Array<{ offset: number; leftCategoryId: string }> = [];

    const rows = await computeRowsProgressively(input, (cell) => {
      cells.push({ offset: cell.offset, leftCategoryId: cell.leftCategoryId });
    });

    expect(cells.map((cell) => cell.offset)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(cells.map((cell) => cell.leftCategoryId)).toEqual([
      'a',
      'b',
      'a',
      'b',
      'a',
      'b',
    ]);
    expect(rows[0].cells.map((cell) => cell.offset)).toEqual([0, 1, 2]);
  });

  it('rejects immediately when async correlation is already cancelled', async () => {
    const cancellation = { cancelled: true };

    await expect(
      computeRowsAsync(
        {
          categories: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
          records: [],
          offsets: [0],
        },
        cancellation,
      ),
    ).rejects.toMatchObject({ name: 'CorrelationCancelledError' });
  });

  it('cancels the scheduled correlation task before it starts', async () => {
    jest.useFakeTimers();
    const task = createCorrelationTask({
      categories: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      records: [],
      offsets: [0],
    });

    task.cancel();

    await expect(task.promise).rejects.toMatchObject({
      name: 'CorrelationCancelledError',
    });
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('includes the complete deterministic test dataset', () => {
    const first = createBuiltInTestDataset(TEST_DATASET_SEED);
    const second = createBuiltInTestDataset(TEST_DATASET_SEED);

    expect(first.categories).toHaveLength(25);
    expect(Object.keys(first.records)).toHaveLength(25 * 53);
    const baseValues = first.categories[0].id;
    expect(
      Object.values(first.records)
        .filter((record) => record.categoryId === baseValues)
        .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
        .map((record) => record.value)
        .slice(0, 21),
    ).toEqual([1, 4, 3, 1, 0, 2, 4, 1, 0, 3, 4, 2, 1, 4, 0, 2, 3, 4, 1, 0, 2]);
    expect(first).toEqual(second);
  });

  it('projects duration and counter records into virtual series', () => {
    const duration = createDefaultCategory('duration', 0, 'Focus');
    const counter = createDefaultCategory('counter', 1, 'Steps');
    const input = createVirtualCorrelationInput(
      [duration, counter],
      {
        duration: {
          key: 'duration:0',
          categoryId: duration.id,
          dateKey: '2026-01-01',
          ordinal: 0,
          localTime: '09:00:00',
          value: 5000,
          instanceId: 'duration:0',
          startTime: '2026-01-01T09:00:00.000Z',
          stopTime: '2026-01-01T09:00:05.000Z',
          durationMs: 5000,
        },
        counter: {
          key: 'counter:0',
          categoryId: counter.id,
          dateKey: '2026-01-01',
          ordinal: 0,
          localTime: '09:00:00',
          value: 3,
        },
      },
      [0],
    );

    expect(input.categories.map((category) => category.name)).toEqual(
      expect.arrayContaining([
        'Focus total duration',
        'Steps total',
        'Steps count',
      ]),
    );
    expect(input.records.some((record) => record.value === 5000)).toBe(true);
  });

  it('keeps documentation bundled and searchable by concept text', () => {
    expect(documentationSections.length).toBeGreaterThanOrEqual(9);
    expect(
      documentationSections.some((section) =>
        `${section.title} ${section.body}`.toLowerCase().includes('sentiment'),
      ),
    ).toBe(true);
    expect(
      documentationSections
        .filter((section) =>
          `${section.title} ${section.body} ${section.keywords.join(' ')}`
            .toLowerCase()
            .includes('correlation'),
        )
        .map((section) => section.id),
    ).toContain('correlation');
  });

  it('defines enabled defaults for every registered statistics item', () => {
    const settings = createDefaultStatisticsSettings();

    expect(statisticsRegistry.length).toBeGreaterThan(3);
    expect(statisticsRegistry.some((item) => !item.defaultEnabled)).toBe(true);
    expect(isStatisticEnabled(settings, 'chart.section')).toBe(true);
    expect(
      isStatisticEnabled({ 'chart.section': false }, 'chart.section'),
    ).toBe(false);
    expect(isStatisticEnabled({}, 'correlation.section')).toBe(true);
  });

  it('scores note sentiment locally and deterministically', () => {
    expect(scoreSentiment('This is excellent and joyful')).toBeGreaterThan(0);
    expect(scoreSentiment('This is terrible and sad')).toBeLessThan(0);
    expect(scoreSentiment('A neutral sentence')).toBe(
      scoreSentiment('A neutral sentence'),
    );
  });

  it('generates local read-only weekday and day-of-month series', () => {
    const input = createVirtualCorrelationInput(
      [],
      {
        source: {
          key: 'source',
          categoryId: 'source',
          dateKey: '2026-08-30',
          ordinal: 0,
          localTime: '09:00:00',
          value: 1,
        },
      },
      [0],
    );

    expect(input.categories.map((category) => category.id)).toEqual([
      'calendar:weekday',
      'calendar:day-of-month',
    ]);
    expect(input.records.map((record) => record.value)).toEqual([1, 30]);
  });

  it('orders correlation inputs by category editor order', () => {
    const first = {
      ...createDefaultCategory('number', 0, 'First'),
      id: 'first-category',
    };
    const second = {
      ...createDefaultCategory('number', 1, 'Second'),
      id: 'second-category',
    };
    const input = createVirtualCorrelationInput(
      [second, first],
      {},
      [0],
      false,
      [
        {
          id: 'group-first',
          name: 'First group',
          categoryIds: [first.id],
          expanded: true,
        },
        {
          id: 'group-second',
          name: 'Second group',
          categoryIds: [second.id],
          expanded: true,
        },
      ],
    );

    expect(input.categories.map((category) => category.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('excludes cross-group pairs for scoped categories', () => {
    const scoped = {
      ...createDefaultCategory('number', 0, 'Scoped'),
      id: 'scoped-category',
      correlateWithinGroup: true,
    };
    const sameGroup = {
      ...createDefaultCategory('number', 1, 'Same group'),
      id: 'same-group-category',
    };
    const otherGroup = {
      ...createDefaultCategory('number', 2, 'Other group'),
      id: 'other-group-category',
    };
    const input = createVirtualCorrelationInput(
      [scoped, sameGroup, otherGroup],
      {},
      [0],
      false,
      [
        {
          id: 'group-a',
          name: 'A',
          categoryIds: [scoped.id, sameGroup.id],
          expanded: true,
        },
        {
          id: 'group-b',
          name: 'B',
          categoryIds: [otherGroup.id],
          expanded: true,
        },
      ],
    );
    const rows = computeRows({ ...input, records: [] });

    expect(rows.map((row) => row.label)).toEqual([
      'Scoped x Same group',
      'Same group x Scoped',
      'Same group x Other group',
      'Other group x Same group',
    ]);
  });

  it('projects product, inverse, and duration clock-time virtual series', () => {
    const number = {
      ...createDefaultCategory('number', 0, 'Number'),
      id: 'number-source',
    };
    const inverse = {
      ...createDefaultCategory('number', 1, 'Inverse'),
      id: 'inverse-source',
    };
    const duration = {
      ...createDefaultCategory('duration', 2, 'Focus'),
      id: 'duration-source',
    };
    duration.virtualSeries = duration.virtualSeries.map((series) =>
      series.field === 'startTime' ? { ...series, enabled: true } : series,
    );
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [
            {
              id: 'number:product',
              name: 'Number product',
              sourceCategoryId: number.id,
              field: 'value',
              aggregation: 'product',
            },
          ],
        },
        {
          ...inverse,
          virtualSeries: [
            {
              id: 'inverse:series',
              name: 'Inverse series',
              sourceCategoryId: inverse.id,
              field: 'value',
              aggregation: 'mean',
              transform: 'inverse',
            },
          ],
        },
        duration,
      ],
      {
        first: {
          key: 'first',
          categoryId: number.id,
          dateKey: '2026-01-01',
          ordinal: 0,
          localTime: '09:00:00',
          value: 2,
        },
        second: {
          key: 'second',
          categoryId: number.id,
          dateKey: '2026-01-01',
          ordinal: 1,
          localTime: '10:00:00',
          value: 3,
        },
        third: {
          key: 'third',
          categoryId: number.id,
          dateKey: '2026-01-02',
          ordinal: 0,
          localTime: '09:00:00',
          value: 4,
        },
        inverseFirst: {
          key: 'inverse:first',
          categoryId: inverse.id,
          dateKey: '2026-01-01',
          ordinal: 0,
          localTime: '09:00:00',
          value: 2,
        },
        inverseSecond: {
          key: 'inverse:second',
          categoryId: inverse.id,
          dateKey: '2026-01-02',
          ordinal: 0,
          localTime: '09:00:00',
          value: 4,
        },
        timed: {
          key: 'timed',
          categoryId: duration.id,
          dateKey: '2026-01-01',
          ordinal: 0,
          localTime: '09:00:00',
          value: 1,
          startTime: '2026-01-01T09:01:02.003',
          stopTime: '2026-01-01T10:02:03.004',
          durationMs: 3661001,
        },
      },
      [0],
    );

    expect(
      input.records
        .filter((record) => record.categoryId === 'number:product')
        .map((record) => record.value),
    ).toEqual([6, 4]);
    expect(
      input.records
        .filter((record) => record.categoryId === 'inverse:series')
        .map((record) => record.value),
    ).toEqual([4, 2]);
    expect(
      input.records.find((record) => record.categoryId.includes(':startTime:'))
        ?.value,
    ).toBe(32462003);
  });

  it('gates calendar projection and invalidates cache inputs by offset range', () => {
    const category = createDefaultCategory('number', 0, 'Number');
    const records = {
      record: {
        key: 'record',
        categoryId: category.id,
        dateKey: '2026-01-01',
        ordinal: 0,
        localTime: '09:00:00',
        value: 3,
      },
    };
    const withCalendar = createVirtualCorrelationInput(
      [category],
      records,
      [0],
      true,
    );
    const withoutCalendar = createVirtualCorrelationInput(
      [category],
      records,
      [0],
      false,
    );

    expect(
      withCalendar.categories.some(
        (series) => series.id === 'calendar:weekday',
      ),
    ).toBe(true);
    expect(
      withoutCalendar.categories.some(
        (series) => series.id === 'calendar:weekday',
      ),
    ).toBe(false);
    expect(createCorrelationInputHash([category], records, [0])).not.toBe(
      createCorrelationInputHash([category], records, [0, 1]),
    );
  });

  it('produces per-option binary series for separate-items choice categories', () => {
    const base = createDefaultCategory('multiple-choice', 0, 'Symptoms');
    if (base.kind !== 'multiple-choice') throw new Error('expected choice');
    // Jest mocks expo-crypto's randomUUID as undefined, so default options share
    // one id; use explicit distinct ids so per-option series ids don't collide.
    const options = [
      { id: 'headache', label: 'Headache', value: 0 },
      { id: 'nausea', label: 'Nausea', value: 1 },
    ];
    const category = {
      ...base,
      id: 'symptoms',
      options,
      multiSelect: true,
      allowMultiplePerDay: true,
      optionSeriesMode: 'items' as const,
    };
    const withSeries = {
      ...category,
      virtualSeries: recomputeVirtualSeries(category),
    };
    const [headache, nausea] = withSeries.options;
    const records = {
      morning: {
        key: 'morning',
        categoryId: 'symptoms',
        dateKey: '2026-01-01',
        ordinal: 0,
        localTime: '09:00:00',
        value: headache.value,
        selectedValues: [headache.value],
      },
      evening: {
        key: 'evening',
        categoryId: 'symptoms',
        dateKey: '2026-01-01',
        ordinal: 1,
        localTime: '20:00:00',
        value: headache.value,
        selectedValues: [headache.value],
      },
    };

    const input = createVirtualCorrelationInput(
      [withSeries],
      records,
      [0],
      false,
    );

    const headacheId = `symptoms:option:${headache.id}`;
    const nauseaId = `symptoms:option:${nausea.id}`;
    expect(
      input.records.find((record) => record.categoryId === headacheId)?.value,
    ).toBe(1);
    expect(
      input.records.find((record) => record.categoryId === nauseaId)?.value,
    ).toBe(0);
  });

  it('migrates legacy flat categories into a default group and repairs group membership', () => {
    const first = {
      ...createDefaultCategory('number', 0, 'First'),
      id: 'first',
    };
    const second = {
      ...createDefaultCategory('number', 1, 'Second'),
      id: 'second',
    };

    expect(normalizeGroups(undefined, [first, second])).toEqual([
      expect.objectContaining({
        id: 'default-group',
        categoryIds: ['first', 'second'],
      }),
    ]);
    expect(
      normalizeGroups(
        [
          {
            id: 'custom',
            name: 'Custom',
            categoryIds: ['first', 'missing'],
            expanded: false,
          },
        ],
        [first, second],
      )[0].categoryIds,
    ).toEqual(['first', 'second']);
  });
});
