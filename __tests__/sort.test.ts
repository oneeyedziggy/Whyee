import { compareValues, nextSortDirection } from '../src/lib/sort';

describe('nextSortDirection', () => {
  it('cycles ascending -> descending -> default -> ascending', () => {
    expect(nextSortDirection('default')).toBe('asc');
    expect(nextSortDirection('asc')).toBe('desc');
    expect(nextSortDirection('desc')).toBe('default');
  });
});

describe('compareValues', () => {
  it('orders numbers numerically, not lexically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
    expect(compareValues(3, 3)).toBe(0);
  });

  it('orders strings with locale comparison', () => {
    expect(compareValues('apple', 'banana')).toBeLessThan(0);
    expect(compareValues('banana', 'apple')).toBeGreaterThan(0);
    expect(compareValues('same', 'same')).toBe(0);
  });

  it('always sorts nulls after real values', () => {
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues(null, 1)).toBe(1);
    expect(compareValues(1, null)).toBe(-1);
    expect(compareValues(null, 'a')).toBe(1);
    expect(compareValues('a', null)).toBe(-1);
  });

  it('falls back to numeric comparison for mixed string/number values', () => {
    expect(compareValues('5', 3)).toBe(2);
    expect(compareValues(3, '5')).toBe(-2);
  });

  it('sorts a mixed list with nulls last', () => {
    expect([3, null, 1, 2].sort(compareValues)).toEqual([1, 2, 3, null]);
  });

  it('reverses real values but keeps nulls last when descending', () => {
    expect(
      [3, null, 1, 2].sort((left, right) => compareValues(left, right, 'desc')),
    ).toEqual([3, 2, 1, null]);
    expect(compareValues(null, 1, 'desc')).toBe(1);
    expect(compareValues('a', 'b', 'desc')).toBeGreaterThan(0);
  });
});
