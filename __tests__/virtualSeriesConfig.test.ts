import {
  createDefaultCategory,
  getNextCategoryNameSequence,
  recomputeVirtualSeries,
  switchCategoryKind,
} from '../src/lib/category';
import {
  createVirtualCorrelationInput,
  describeVirtualSeries,
} from '../src/lib/virtualSeries';
import {
  createDefaultStatisticsSettings,
  isStatisticEnabled,
} from '../src/lib/statistics';

describe('virtual series recomputation', () => {
  it('prunes series belonging to the previous kind', () => {
    const duration = createDefaultCategory('duration', 0);
    expect(
      duration.virtualSeries.some((series) => series.field === 'startTime'),
    ).toBe(true);

    const counter = switchCategoryKind(duration, 'counter');

    expect(
      counter.virtualSeries.some((series) => series.field === 'startTime'),
    ).toBe(false);
    expect(counter.virtualSeries.length).toBeGreaterThan(0);
  });

  it('rebuilds the series list when multiple entries per day is toggled', () => {
    const number = createDefaultCategory('number', 0);
    const single = recomputeVirtualSeries(number);
    expect(single).toHaveLength(1);

    const multiple = recomputeVirtualSeries({
      ...number,
      allowMultiplePerDay: true,
      virtualSeries: single,
    });

    expect(multiple.length).toBeGreaterThan(1);
    expect(multiple.some((series) => series.perInstance)).toBe(true);
  });

  it('migrates a legacy inverse series into the primary row inverse toggle', () => {
    const number = createDefaultCategory('number', 0);
    const migrated = recomputeVirtualSeries({
      ...number,
      virtualSeries: [
        ...recomputeVirtualSeries(number),
        {
          id: `${number.id}:inverse`,
          name: 'stale inverse',
          sourceCategoryId: number.id,
          field: 'value',
          aggregation: 'mean',
          transform: 'inverse',
          enabled: true,
        },
      ],
    });

    expect(migrated.some((series) => series.transform === 'inverse')).toBe(
      false,
    );
    expect(migrated).toEqual([
      expect.objectContaining({
        id: `${number.id}:value`,
        enabled: true,
        inverseEnabled: true,
      }),
    ]);
  });

  it('adds default-off note metrics and keeps notes sentiment primary', () => {
    const notes = createDefaultCategory('notes', 0);
    expect(notes.sentimentEnabled).toBe(true);

    const withSentiment = recomputeVirtualSeries(notes);

    expect(withSentiment.map((series) => series.field)).toEqual([
      'noteText',
      'noteWordCount',
      'noteLength',
      'noteAverageWordLength',
      'noteDistinctWords',
    ]);
    expect(withSentiment.map((series) => series.enabled)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    const withoutSentiment = recomputeVirtualSeries({
      ...notes,
      sentimentEnabled: false,
      virtualSeries: [],
    });
    expect(withoutSentiment).toHaveLength(4);
    expect(withoutSentiment[0]).toMatchObject({
      field: 'noteWordCount',
      enabled: true,
    });
  });

  it('projects note metrics from text', () => {
    const notes = { ...createDefaultCategory('notes', 0), id: 'notes' };
    notes.virtualSeries = recomputeVirtualSeries(notes).map((series) => ({
      ...series,
      enabled: series.field !== 'noteText',
    }));
    const input = createVirtualCorrelationInput(
      [notes],
      {
        note: {
          key: 'note',
          categoryId: 'notes',
          dateKey: '2026-01-01',
          ordinal: 0,
          localTime: '09:00:00',
          value: 0,
          noteText: 'Good day, good sleep!',
        },
      },
      [0],
      false,
    );
    const valueFor = (suffix: string) =>
      input.records.find((record) => record.categoryId === `notes:${suffix}`)
        ?.value;

    expect(valueFor('note:words')).toBe(4);
    expect(valueFor('note:length')).toBe(21);
    expect(valueFor('note:word-length')).toBe(4);
    expect(valueFor('note:distinct-words')).toBe(3);
  });

  it('hides redundant single-entry series and enables one daily summary by default', () => {
    const number = createDefaultCategory('number', 0);
    const counter = createDefaultCategory('counter', 1);
    expect(recomputeVirtualSeries(number).map((series) => series.id)).toEqual([
      `${number.id}:value`,
    ]);
    const multiple = recomputeVirtualSeries({
      ...number,
      allowMultiplePerDay: true,
    });
    expect(
      multiple.filter((series) => series.enabled).map((series) => series.id),
    ).toEqual([`${number.id}:value:mean`]);
    expect(
      recomputeVirtualSeries({ ...counter, allowMultiplePerDay: true })
        .filter((series) => series.enabled)
        .map((series) => series.id),
    ).toEqual([`${counter.id}:value:sum`]);
    expect(multiple.map((series) => series.aggregation)).toEqual(
      expect.arrayContaining([
        'count',
        'mean',
        'median',
        'sum',
        'product',
        'min',
        'max',
      ]),
    );
  });

  it('enables the stat matching a legacy main aggregation and preserves old flags', () => {
    const number = {
      ...createDefaultCategory('number', 0),
      id: 'reading',
      allowMultiplePerDay: true,
      mainAggregation: 'max' as const,
      virtualSeries: [
        {
          id: 'reading:sum',
          name: 'Reading sum',
          sourceCategoryId: 'reading',
          field: 'value' as const,
          aggregation: 'sum' as const,
        },
        {
          id: 'reading:count',
          name: 'Reading count',
          sourceCategoryId: 'reading',
          field: 'value' as const,
          aggregation: 'count' as const,
          enabled: false,
        },
      ],
    };
    const migrated = recomputeVirtualSeries(number);
    const enabled = migrated
      .filter((series) => series.enabled)
      .map((series) => series.id);

    expect(enabled).toEqual(['reading:value:sum', 'reading:value:max']);
    expect(
      recomputeVirtualSeries({ ...number, virtualSeries: migrated }),
    ).toEqual(migrated);
  });

  it('describes daily summaries and entry positions concisely', () => {
    const number = createDefaultCategory('number', 0);
    const series = recomputeVirtualSeries({
      ...number,
      allowMultiplePerDay: true,
    });
    const describe = (aggregation: string, perInstance = false) =>
      describeVirtualSeries(
        series.find(
          (candidate) =>
            candidate.aggregation === aggregation &&
            Boolean(candidate.perInstance) === perInstance,
        )!,
      );

    expect(describe('sum')).toBe(
      "Charts the sum of each day's entries by date.",
    );
    expect(describe('count')).toBe('Charts the number of entries per day.');
    expect(describe('mean', true)).toBe(
      'Tracks each entry position (1st, 2nd, …) as its own series.',
    );
  });

  it('describes every generated series', () => {
    const counter = createDefaultCategory('counter', 0);
    for (const series of recomputeVirtualSeries(counter)) {
      expect(describeVirtualSeries(series).length).toBeGreaterThan(10);
    }
  });

  it("restores a category kind's settings after switching away and back", () => {
    const duration = createDefaultCategory('duration', 0);
    if (duration.kind !== 'duration') throw new Error('expected duration');
    const customized = {
      ...duration,
      duration: {
        ...duration.duration,
        cumulative: true,
        showMilliseconds: true,
      },
    };

    const counter = switchCategoryKind(customized, 'counter');
    const restored = switchCategoryKind(counter, 'duration');

    expect(restored.kind).toBe('duration');
    if (restored.kind !== 'duration') throw new Error('expected duration');
    expect(restored.duration.cumulative).toBe(true);
    expect(restored.duration.showMilliseconds).toBe(true);
  });

  it('does not reuse a reserved name sequence after a deletion', () => {
    const first = createDefaultCategory('counter', 0, 'Renamed', 1);
    const second = createDefaultCategory('counter', 1, 'Also renamed', 2);

    expect(getNextCategoryNameSequence([first, second], 'counter')).toBe(3);
    expect(getNextCategoryNameSequence([first], 'counter')).toBe(2);
    expect(getNextCategoryNameSequence([second], 'counter')).toBe(3);
  });

  it('defaults calendar statistics off', () => {
    const settings = createDefaultStatisticsSettings();

    expect(isStatisticEnabled(settings, 'calendar.section')).toBe(false);
  });

  it('reduces single-entry durations to one duration, start time and stop time', () => {
    const duration = createDefaultCategory('duration', 0, 'Sleep');
    expect(duration.virtualSeries.map((series) => series.name)).toEqual([
      'Sleep duration',
      'Sleep start time',
      'Sleep stop time',
    ]);
    const multiple = recomputeVirtualSeries({
      ...duration,
      allowMultiplePerDay: true,
    });
    expect(multiple.map((series) => series.name)).toEqual(
      expect.arrayContaining([
        'Sleep total duration',
        'Sleep earliest start time',
        'Sleep latest stop time',
        'Sleep median stop time',
      ]),
    );
    expect(
      multiple.filter((series) => series.enabled).map((series) => series.name),
    ).toEqual(['Sleep total duration']);
    expect(
      multiple.some(
        (series) =>
          series.aggregation === 'product' ||
          (series.field !== 'durationMs' && series.aggregation === 'sum'),
      ),
    ).toBe(false);
  });

  it('generates one binary series per option in separate-items mode', () => {
    const choice = createDefaultCategory('multiple-choice', 0);
    if (choice.kind !== 'multiple-choice') throw new Error('expected choice');

    const items = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'items',
    });

    expect(items).toHaveLength(choice.options.length);
    for (const [index, option] of choice.options.entries()) {
      expect(items[index].id).toBe(`${choice.id}:option:${option.id}`);
      expect(items[index].field).toBe('optionSelected');
      expect(items[index].optionValue).toBe(option.value);
      expect(items[index].aggregation).toBe('max');
    }
  });

  it('uses sum aggregation when the occurrence mode is sum', () => {
    const choice = createDefaultCategory('multiple-choice', 0);
    if (choice.kind !== 'multiple-choice') throw new Error('expected choice');

    const items = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'items',
      optionOccurrenceMode: 'sum',
    });

    expect(items.every((series) => series.aggregation === 'sum')).toBe(true);
  });

  it('collapses back to a single raw series when switching out of items mode', () => {
    const choice = createDefaultCategory('multiple-choice', 0);
    if (choice.kind !== 'multiple-choice') throw new Error('expected choice');

    const items = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'items',
    });
    const back = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'intensity',
      virtualSeries: items,
    });

    expect(back).toHaveLength(1);
    expect(back[0].field).toBe('value');
  });

  it('preserves per-option enabled state across option reorders', () => {
    const choice = createDefaultCategory('multiple-choice', 0);
    if (choice.kind !== 'multiple-choice') throw new Error('expected choice');
    // Use explicit option ids so the expected per-option series ids are stable.
    const options = [
      { id: 'option-a', label: 'A', value: 0 },
      { id: 'option-b', label: 'B', value: 1 },
      { id: 'option-c', label: 'C', value: 2 },
    ];

    const items = recomputeVirtualSeries({
      ...choice,
      options,
      multiSelect: true,
      optionSeriesMode: 'items',
    });
    const disabled = items.map((series, index) =>
      index === 0 ? { ...series, enabled: false } : series,
    );
    const reorderedOptions = [...options].reverse().map((option, index) => ({
      ...option,
      value: index,
    }));

    const afterReorder = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'items',
      options: reorderedOptions,
      virtualSeries: disabled,
    });

    const firstOptionSeries = afterReorder.find(
      (series) => series.id === `${choice.id}:option:${options[0].id}`,
    );
    expect(firstOptionSeries?.enabled).toBe(false);
  });

  it('describes option series based on occurrence mode', () => {
    const choice = createDefaultCategory('multiple-choice', 0);
    if (choice.kind !== 'multiple-choice') throw new Error('expected choice');

    const capped = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'items',
    });
    const summed = recomputeVirtualSeries({
      ...choice,
      multiSelect: true,
      optionSeriesMode: 'items',
      optionOccurrenceMode: 'sum',
    });

    expect(describeVirtualSeries(capped[0])).toContain('at least once');
    expect(describeVirtualSeries(summed[0])).toContain('Counts how many times');
  });
});
