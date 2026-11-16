import {
  autocorrelation,
  daysAgo,
  mean,
  median,
  mode,
  slope,
} from '../src/lib/summaryStats';

describe('daysAgo', () => {
  it('counts whole local calendar days regardless of the time of day', () => {
    expect(daysAgo('2026-03-10', new Date(2026, 2, 15, 0, 1))).toBe(5);
    expect(daysAgo('2026-03-10', new Date(2026, 2, 15, 23, 59))).toBe(5);
    expect(daysAgo('2026-03-15', new Date(2026, 2, 15, 12))).toBe(0);
  });

  it('spans month, year, and DST boundaries without fractional drift', () => {
    expect(daysAgo('2025-12-31', new Date(2026, 0, 1))).toBe(1);
    expect(daysAgo('2026-03-01', new Date(2026, 3, 1))).toBe(31);
  });

  it('returns negative values for future dates', () => {
    expect(daysAgo('2026-03-20', new Date(2026, 2, 15))).toBe(-5);
  });
});

describe('central tendency', () => {
  it('returns null for empty input', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(mode([])).toBeNull();
  });

  it('computes the mean', () => {
    expect(mean([2])).toBe(2);
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(mean([-1, 1])).toBe(0);
  });

  it('takes the middle value for odd counts and averages the middle pair for even counts', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('does not reorder the caller array when computing the median', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it('picks the most frequent value and breaks ties with the smallest value', () => {
    expect(mode([1, 2, 2, 3])).toBe(2);
    expect(mode([5, 3, 5, 3, 1])).toBe(3);
    expect(mode([7])).toBe(7);
  });
});

describe('slope', () => {
  it('needs at least two points', () => {
    expect(slope([])).toBeNull();
    expect(slope([4])).toBeNull();
  });

  it('fits the least-squares trend over evenly spaced indices', () => {
    expect(slope([1, 3])).toBe(2);
    expect(slope([10, 8, 6, 4])).toBe(-2);
    expect(slope([5, 5, 5])).toBe(0);
  });
});

describe('autocorrelation', () => {
  it('rejects non-positive lags and series no longer than the lag', () => {
    expect(autocorrelation([1, 2, 3], 0)).toBeNull();
    expect(autocorrelation([1, 2, 3], -1)).toBeNull();
    expect(autocorrelation([1, 2, 3], 3)).toBeNull();
    expect(autocorrelation([], 1)).toBeNull();
  });

  it('returns null when either side has zero variance', () => {
    expect(autocorrelation([4, 4, 4, 4], 1)).toBeNull();
    expect(autocorrelation([1, 4, 4, 4], 1)).toBeNull();
  });

  it('detects perfectly repeating and alternating patterns', () => {
    expect(autocorrelation([1, 2, 3, 4, 5], 1)).toBeCloseTo(1);
    expect(autocorrelation([1, -1, 1, -1, 1], 1)).toBeCloseTo(-1);
    expect(autocorrelation([1, 5, 2, 1, 5, 2, 1], 3)).toBeCloseTo(1);
  });
});
