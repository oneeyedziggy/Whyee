import {
  createDefaultStatisticsSettings,
  isStatisticEnabled,
  statisticsRegistry,
  type StatisticsItemId,
} from '../src/lib/statistics';

describe('statistics settings', () => {
  const enabledByDefault = statisticsRegistry.find((item) => item.defaultEnabled)!;
  const disabledByDefault = statisticsRegistry.find(
    (item) => !item.defaultEnabled,
  )!;

  it('has a unique id for every registry item', () => {
    const ids = statisticsRegistry.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds defaults covering every registered item', () => {
    const defaults = createDefaultStatisticsSettings();
    expect(Object.keys(defaults).sort()).toEqual(
      statisticsRegistry.map((item) => item.id).sort(),
    );
    for (const item of statisticsRegistry) {
      expect(defaults[item.id]).toBe(item.defaultEnabled);
    }
  });

  it('prefers explicit settings over registry defaults', () => {
    expect(isStatisticEnabled({}, enabledByDefault.id)).toBe(true);
    expect(
      isStatisticEnabled({ [enabledByDefault.id]: false }, enabledByDefault.id),
    ).toBe(false);
    expect(isStatisticEnabled({}, disabledByDefault.id)).toBe(false);
    expect(
      isStatisticEnabled({ [disabledByDefault.id]: true }, disabledByDefault.id),
    ).toBe(true);
  });

  it('treats unknown ids as disabled', () => {
    expect(isStatisticEnabled({}, 'not.real' as StatisticsItemId)).toBe(false);
  });
});
