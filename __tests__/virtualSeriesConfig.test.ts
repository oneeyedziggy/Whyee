import {
  createDefaultCategory,
  getNextCategoryNameSequence,
  recomputeVirtualSeries,
  switchCategoryKind,
} from '../src/lib/category';
import { describeVirtualSeries } from '../src/lib/virtualSeries';
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

  it('keeps exactly one inverse definition', () => {
    const number = createDefaultCategory('number', 0);
    const withInverse = recomputeVirtualSeries({
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

    expect(
      withInverse.filter((series) => series.transform === 'inverse'),
    ).toHaveLength(1);
  });

  it('gives notes categories a sentiment series instead of a raw series', () => {
    const notes = createDefaultCategory('notes', 0);
    expect(notes.sentimentEnabled).toBe(true);

    const withSentiment = recomputeVirtualSeries(notes);

    expect(withSentiment).toHaveLength(1);
    expect(withSentiment[0].transform).toBe('sentimentScore');
    expect(
      recomputeVirtualSeries({ ...notes, sentimentEnabled: false }),
    ).toHaveLength(0);
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

  it('defaults weekly and calendar statistics off', () => {
    const settings = createDefaultStatisticsSettings();

    expect(isStatisticEnabled(settings, 'weekly.section')).toBe(false);
    expect(isStatisticEnabled(settings, 'calendar.section')).toBe(false);
    expect(isStatisticEnabled(settings, 'summary.weekly-effect')).toBe(false);
    expect(isStatisticEnabled(settings, 'summary.weekly-phase')).toBe(false);
    expect(isStatisticEnabled(settings, 'summary.weekly-offset')).toBe(false);
  });

  it('defaults optional duration series off', () => {
    const duration = createDefaultCategory('duration', 0);
    const disabledNames = [
      'duration per entry',
      'count',
      'average start time',
      'average stop time',
    ];

    for (const series of duration.virtualSeries) {
      if (disabledNames.some((name) => series.name.endsWith(name)))
        expect(series.enabled).toBe(false);
    }
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
    // Jest mocks expo-crypto's randomUUID as undefined, so default options share
    // one id; use explicit distinct ids so per-option series ids don't collide.
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
