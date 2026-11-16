import { createDefaultCategory } from '../src/lib/category';
import { createCorrelationInputHash } from '../src/lib/hash';
import type {
  CategoryGroup,
  CategorySelectionRecord,
} from '../src/types/category';

const categories = [
  { ...createDefaultCategory('number', 0, 'A'), id: 'a' },
  { ...createDefaultCategory('number', 1, 'B'), id: 'b' },
  { ...createDefaultCategory('number', 2, 'C'), id: 'c' },
];

const record = (key: string, value: number): CategorySelectionRecord => ({
  key,
  categoryId: 'a',
  dateKey: '2026-01-01',
  ordinal: 0,
  localTime: '09:00:00',
  value,
});

const makeRecords = () => ({
  first: record('2026-01-01:0:a', 1),
  second: record('2026-01-02:0:a', 2),
});

const groups: CategoryGroup[] = [
  { id: 'g1', name: 'One', categoryIds: ['a', 'b'], expanded: true },
  { id: 'g2', name: 'Two', categoryIds: ['c'], expanded: true },
];

describe('createCorrelationInputHash', () => {
  it('produces a stable fnv1a digest for identical inputs', () => {
    const hash = createCorrelationInputHash(categories, makeRecords(), [0, 1]);
    expect(hash).toMatch(/^fnv1a-[0-9a-f]+$/);
    expect(createCorrelationInputHash(categories, makeRecords(), [0, 1])).toBe(
      hash,
    );
  });

  it('ignores category, record, group, and group-member ordering', () => {
    const records = makeRecords();
    const reorderedRecords = { second: records.second, first: records.first };
    const base = createCorrelationInputHash(
      categories,
      records,
      [0],
      true,
      groups,
    );
    expect(
      createCorrelationInputHash(
        [...categories].reverse(),
        reorderedRecords,
        [0],
        true,
        [
          { ...groups[1] },
          { ...groups[0], categoryIds: ['b', 'a'] },
        ],
      ),
    ).toBe(base);
  });

  it('changes when anything that affects the results changes', () => {
    const base = createCorrelationInputHash(categories, makeRecords());
    const variants = [
      createCorrelationInputHash(categories.slice(1), makeRecords()),
      createCorrelationInputHash(categories, {
        ...makeRecords(),
        first: record('2026-01-01:0:a', 9),
      }),
      createCorrelationInputHash(categories, makeRecords(), [1]),
      createCorrelationInputHash(categories, makeRecords(), [], false),
      createCorrelationInputHash(categories, makeRecords(), [], true, groups),
      createCorrelationInputHash(categories, makeRecords(), [], true, [], 123),
    ];
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
  });

  it('reuses the record digest for the same records object', () => {
    const records = makeRecords();
    const first = createCorrelationInputHash(categories, records);
    // Records are treated as immutable; a cached digest is reused by identity.
    records.first = record('2026-01-01:0:a', 42);
    expect(createCorrelationInputHash(categories, records)).toBe(first);
    expect(createCorrelationInputHash(categories, { ...records })).not.toBe(
      first,
    );
  });

  it('hashes empty inputs', () => {
    expect(createCorrelationInputHash([], {})).toMatch(/^fnv1a-/);
  });
});
