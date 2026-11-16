import { createDefaultCategory } from '../src/lib/category';
import {
  createVirtualCorrelationInput,
  describeVirtualSeries,
  numericValue,
} from '../src/lib/virtualSeries';
import type {
  CategorySelectionRecord,
  VirtualSeriesDefinition,
} from '../src/types/category';

const record = (
  overrides: Partial<CategorySelectionRecord> = {},
): CategorySelectionRecord => ({
  key: 'k',
  categoryId: 'c',
  dateKey: '2026-01-01',
  ordinal: 0,
  localTime: '09:00:00',
  value: 1,
  ...overrides,
});

const definition = (
  overrides: Partial<VirtualSeriesDefinition>,
): VirtualSeriesDefinition => ({
  id: 'c:series',
  name: 'C series',
  sourceCategoryId: 'c',
  field: 'value',
  aggregation: 'mean',
  ...overrides,
});

describe('numericValue', () => {
  it.each(['noteLength', 'noteWordCount', 'noteAverageWordLength'] as const)(
    'returns null for %p of missing or blank notes',
    (field) => {
      expect(numericValue(record(), field)).toBeNull();
      expect(numericValue(record({ noteText: '  \n ' }), field)).toBeNull();
    },
  );

  it('has no average word length for punctuation-only notes', () => {
    const punctuation = record({ noteText: '!!! ... ?' });
    expect(numericValue(punctuation, 'noteAverageWordLength')).toBeNull();
    expect(numericValue(punctuation, 'noteWordCount')).toBe(0);
    expect(numericValue(record({ noteText: 'ab abcd' }), 'noteAverageWordLength')).toBe(3);
  });

  it('scores missing note text as neutral sentiment', () => {
    expect(numericValue(record(), 'noteText', 'sentimentScore')).toBe(0);
    expect(
      numericValue(record({ sentimentScore: 0.5 }), 'noteText', 'sentimentScore'),
    ).toBe(0.5);
  });

  it('returns null for missing durations and missing or invalid timestamps', () => {
    expect(numericValue(record(), 'durationMs')).toBeNull();
    expect(numericValue(record({ durationMs: 0 }), 'durationMs')).toBe(0);
    expect(numericValue(record(), 'startTime')).toBeNull();
    expect(numericValue(record({ stopTime: 'not a date' }), 'stopTime')).toBeNull();
    const start = new Date(2026, 0, 1, 1, 2, 3, 4).toISOString();
    expect(numericValue(record({ startTime: start }), 'startTime')).toBe(3723004);
  });
});

describe('describeVirtualSeries', () => {
  it('explains legacy inverse series', () => {
    expect(describeVirtualSeries(definition({ transform: 'inverse' }))).toMatch(
      /^Mirrors the main series/,
    );
  });

  it('names time statistics without earliest/latest wording when not min or max', () => {
    expect(
      describeVirtualSeries(
        definition({ field: 'startTime', aggregation: 'mean', group: 'Center' }),
      ),
    ).toBe("Charts the mean of each day's start times by date.");
    expect(
      describeVirtualSeries(
        definition({ field: 'stopTime', aggregation: 'max', group: 'Spread' }),
      ),
    ).toBe("Charts the latest of each day's stop times by date.");
  });

  it('adds a privacy note to grouped sentiment series', () => {
    expect(
      describeVirtualSeries(
        definition({
          field: 'noteText',
          transform: 'sentimentScore',
          aggregation: 'median',
          group: 'Center',
        }),
      ),
    ).toBe(
      "Charts the median of each day's note sentiment scores by date. Notes are scored locally and never leave this device.",
    );
  });
});

describe('createVirtualCorrelationInput', () => {
  const number = { ...createDefaultCategory('number', 0, 'C'), id: 'c' };
  const records = {
    a: record({ key: 'a', value: 2 }),
    b: record({ key: 'b', dateKey: '2026-01-02', value: 6 }),
  };
  const valuesFor = (
    input: ReturnType<typeof createVirtualCorrelationInput>,
    id: string,
  ) =>
    input.records
      .filter((entry) => entry.categoryId === id)
      .map((entry) => entry.value);

  it('derives series from the category kind when none are stored', () => {
    const input = createVirtualCorrelationInput(
      [{ ...number, virtualSeries: [] }],
      records,
      [],
      false,
    );
    expect(input.categories.map((category) => category.id)).toEqual(['c:value']);
    expect(valuesFor(input, 'c:value')).toEqual([2, 6]);
  });

  it('emits only the mirrored inverse when the base series is disabled', () => {
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [
            definition({ id: 'c:value', enabled: false, inverseEnabled: true }),
          ],
        },
      ],
      records,
      [],
      false,
    );
    expect(input.categories).toEqual([
      expect.objectContaining({ id: 'c:value:inverse', name: 'C series inverse' }),
    ]);
    expect(valuesFor(input, 'c:value:inverse')).toEqual([6, 2]);
  });

  it('groups per-instance series by ordinal when records have no instance id', () => {
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [definition({ id: 'c:instance', perInstance: true })],
        },
      ],
      {
        a: record({ key: 'a', value: 1 }),
        b: record({ key: 'b', ordinal: 1, value: 2 }),
        c: record({ key: 'c', dateKey: '2026-01-02', value: 3 }),
      },
      [],
      false,
    );
    expect(
      input.categories.map((category) => [category.id, category.name]),
    ).toEqual([
      ['c:instance:c:0', 'C series 1'],
      ['c:instance:c:1', 'C series 2'],
    ]);
    expect(valuesFor(input, 'c:instance:c:0')).toEqual([1, 3]);
  });

  it('omits the position number for legacy records without an ordinal', () => {
    const legacy = record({ key: 'a', instanceId: 'legacy' });
    delete (legacy as Partial<CategorySelectionRecord>).ordinal;
    const input = createVirtualCorrelationInput(
      [
        {
          ...number,
          virtualSeries: [definition({ id: 'c:instance', perInstance: true })],
        },
      ],
      { a: legacy },
      [],
      false,
    );
    expect(input.categories).toEqual([
      expect.objectContaining({ id: 'c:instance:legacy', name: 'C series' }),
    ]);
  });
});
