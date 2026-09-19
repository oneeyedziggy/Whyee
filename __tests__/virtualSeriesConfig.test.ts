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
});
