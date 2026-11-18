import {
  createBuiltInTestDataset,
  createTestWorkspaceDataset,
  TEST_DATASET_SEED,
} from '../src/lib/testDataset';
import { makeRecordKey } from '../src/lib/dates';
import type { CategoryKind } from '../src/types/category';

describe('development test workspace datasets', () => {
  it('preserves all saved choice categories, groups, and history without replacing them', () => {
    const original = createTestWorkspaceDataset('testChoice')!;
    original.groups = [{
      id: 'custom',
      name: 'Saved group',
      expanded: false,
      categoryIds: original.categories.map((category) => category.id),
    }];
    const key = Object.keys(original.records)[0];
    original.records[key] = { ...original.records[key], value: 3, noteText: 'Saved history' };
    original.categories = original.categories.slice(0, 3);

    expect(createTestWorkspaceDataset(' testCHOICE ', original)).toEqual(original);
    expect(createTestWorkspaceDataset('ordinary')).toBeUndefined();
  });

  it.each<[string, CategoryKind]>([
    ['testNumber', 'number'],
    ['testDuration', 'duration'],
    ['testCounter', 'counter'],
    ['testNotes', 'notes'],
    ['testEvent', 'event-time'],
  ])('%s has complete typed history, repeated entries, gaps, and constant/lagged cases', (name, kind) => {
    const dataset = createTestWorkspaceDataset(name)!;
    expect(dataset).toEqual(createTestWorkspaceDataset(name));
    expect(dataset.categories.length).toBeGreaterThan(25);
    expect(dataset.categories.every((category) => category.kind === kind)).toBe(true);
    const records = Object.values(dataset.records);
    for (const category of dataset.categories) {
      const entries = records.filter((entry) => entry.categoryId === category.id);
      expect(entries.length).toBeGreaterThan(0);
      expect(category.virtualSeries.some((series) => series.enabled)).toBe(true);
      for (const entry of entries) {
        expect(entry.key).toBe(makeRecordKey(entry.dateKey, entry.ordinal, category.id));
        expect(Number.isFinite(entry.value)).toBe(true);
        if (kind === 'duration') {
          expect(Date.parse(entry.stopTime!) - Date.parse(entry.startTime!)).toBe(entry.durationMs);
          expect(entry.value).toBe(entry.durationMs);
        }
        if (kind === 'notes') expect(typeof entry.noteText).toBe('string');
      }
    }
    const daysFor = (suffix: string) => new Set(
      records.filter((record) => record.categoryId.endsWith(suffix)).map((record) => record.dateKey),
    ).size;
    expect(daysFor('-category-a')).toBe(53);
    expect(daysFor('-sparse')).toBeLessThan(53);
    expect(records.some((entry) => entry.ordinal > 0)).toBe(true);
    const constantValues = records
      .filter((entry) => entry.categoryId.endsWith('-fixed-high'))
      .map((entry) => kind === 'notes' ? entry.noteText : entry.value);
    expect(new Set(constantValues).size).toBe(1);
    const base = records.filter((entry) => entry.categoryId.endsWith('-category-a'));
    const lag = records.filter((entry) => entry.categoryId.endsWith('-lag-1'));
    expect(lag.slice(1).map((entry) => kind === 'notes' ? entry.noteText : entry.value))
      .toEqual(base.slice(0, -1).map((entry) => kind === 'notes' ? entry.noteText : entry.value));
  });

  it('covers signed fractional numbers, large counters, precise overnight durations, and empty/long notes', () => {
    const values = (name: string) => Object.values(createTestWorkspaceDataset(name)!.records);
    expect(values('testNumber').map((entry) => entry.value)).toEqual(expect.arrayContaining([-100, -0.25, 0, 0.25, 100]));
    expect(values('testCounter').map((entry) => entry.value)).toEqual(expect.arrayContaining([-1000, 0, 1000000]));
    const durations = values('testDuration');
    expect(durations.map((entry) => entry.durationMs)).toEqual(expect.arrayContaining([0, 1, 999, 1001, 90061001]));
    expect(durations.some((entry) => entry.startTime!.slice(0, 10) !== entry.stopTime!.slice(0, 10))).toBe(true);
    const notes = values('testNotes');
    expect(notes.map((entry) => entry.noteText)).toEqual(expect.arrayContaining(['', '   ', '!!! ... ?']));
    expect(notes.some((entry) => entry.noteText!.length > 1000)).toBe(true);
    expect(notes.some((entry) => entry.sentimentScore! < 0)).toBe(true);
    expect(notes.some((entry) => entry.sentimentScore! > 0)).toBe(true);
  });

  it('encodes event dataset values as the recorded time of day', () => {
    const dataset = createTestWorkspaceDataset('testEvent')!;
    for (const entry of Object.values(dataset.records)) {
      expect(entry.localTime).toMatch(/^\d{2}:\d{2}:00$/);
      expect(Number(entry.localTime.slice(0, 2))).toBe(6 + entry.value * 3);
    }
    const multiple = dataset.categories.find(
      (category) => category.id === 'test-event-time-multiple',
    )!;
    expect(
      multiple.kind === 'event-time' && multiple.eventTime.use24HourClock,
    ).toBe(false);
  });

  it('showcases two distinct modes of every category type with history', () => {
    const dataset = createTestWorkspaceDataset('testData')!;
    expect(dataset.categories).toHaveLength(10);
    for (const kind of ['multiple-choice', 'number', 'duration', 'counter', 'notes']) {
      const categories = dataset.categories.filter((category) => category.kind === kind);
      expect(categories.map((category) => category.allowMultiplePerDay)).toEqual([false, true]);
      for (const category of categories) {
        const history = Object.values(dataset.records).filter((entry) => entry.categoryId === category.id);
        expect(new Set(history.map((entry) => entry.dateKey)).size).toBe(53);
      }
    }
    expect(dataset).toEqual(createTestWorkspaceDataset('testData'));
  });
});

describe('built-in choice dataset peak sampling', () => {
  const peakPattern = (seed: string) => {
    const { records } = createBuiltInTestDataset(seed);
    const byDay = (categoryId: string) =>
      Object.values(records)
        .filter((record) => record.categoryId === categoryId)
        .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
        .map((record) => record.value);
    const base = byDay('test-category-a');
    const sample = byDay('test-category-f');
    return base.flatMap((value, index) =>
      value === 4 ? [sample[index] === 4] : [],
    );
  };

  // Seeds chosen so the raw draws keep no peaks, every peak, or an alternating pattern.
  it.each(['s1493', 's3260', 's3507', 's19084', TEST_DATASET_SEED])(
    'keeps a proper, non-alternating subset of base peaks for seed %p',
    (seed) => {
      const kept = peakPattern(seed);
      expect(kept.length).toBeGreaterThan(2);
      expect(kept.some(Boolean)).toBe(true);
      expect(kept.every(Boolean)).toBe(false);
      const alternating = kept.every(
        (value, index) => value === (index % 2 === 0 ? kept[0] : !kept[0]),
      );
      expect(alternating).toBe(false);
    },
  );

  it('is deterministic per seed', () => {
    expect(createBuiltInTestDataset('same').records).toEqual(
      createBuiltInTestDataset('same').records,
    );
  });
});
