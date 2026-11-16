import {
  entryDurationMs,
  formatClockTime,
  formatDuration,
  formatDurationValue,
} from '../src/lib/durationFormat';

describe('formatDurationValue', () => {
  it('omits the days portion below 24 hours', () => {
    expect(formatDurationValue(3661000, false)).toBe('01:01:01');
    expect(formatDurationValue(86399000, false)).toBe('23:59:59');
  });

  it('shows whole days once the value reaches 24 hours', () => {
    expect(formatDurationValue(86400000, false)).toBe('1d 00:00:00');
    expect(formatDurationValue(180000000, false)).toBe('2d 02:00:00');
  });

  it('includes milliseconds only when configured', () => {
    expect(formatDurationValue(3661123, true)).toBe('01:01:01.123');
    expect(formatDurationValue(3661123, false)).toBe('01:01:01');
    expect(formatDurationValue(90061007, true)).toBe('1d 01:01:01.007');
  });

  it('keeps the sign for negative values such as slopes', () => {
    expect(formatDurationValue(-3661000, false)).toBe('-01:01:01');
  });
});

describe('formatDuration', () => {
  it('keeps accumulating hours past a day instead of splitting days off', () => {
    expect(formatDuration(90061007, false)).toBe('25:01:01');
    expect(formatDuration(90061007, true)).toBe('25:01:01.007');
    expect(formatDuration(0, false)).toBe('00:00:00');
    expect(formatDuration(-1500, true)).toBe('-00:00:01.500');
  });
});

describe('formatClockTime', () => {
  it('renders 24-hour clocks with optional milliseconds', () => {
    expect(formatClockTime(0, 5, 9, 7, false)).toBe('00:05:09');
    expect(formatClockTime(23, 59, 59, 45, true)).toBe('23:59:59.045');
  });

  it('renders 12-hour clocks with AM/PM and maps 0 and 12 to 12', () => {
    expect(formatClockTime(0, 0, 0, 0, false, false)).toBe('12:00:00 AM');
    expect(formatClockTime(11, 30, 0, 0, false, false)).toBe('11:30:00 AM');
    expect(formatClockTime(12, 0, 0, 0, false, false)).toBe('12:00:00 PM');
    expect(formatClockTime(18, 4, 5, 6, true, false)).toBe('06:04:05.006 PM');
  });
});

describe('entryDurationMs', () => {
  const base = {
    key: 'k',
    categoryId: 'c',
    dateKey: '2026-01-01',
    ordinal: 0,
    localTime: '00:00:00',
    value: 0,
  };

  it('prefers the exact duration, then the display duration, then zero', () => {
    expect(entryDurationMs({ ...base, durationMs: 1000, durationMsExact: 1234 })).toBe(1234);
    expect(entryDurationMs({ ...base, durationMs: 1000 })).toBe(1000);
    expect(entryDurationMs(base)).toBe(0);
    expect(entryDurationMs({ ...base, durationMsExact: 0, durationMs: 5 })).toBe(0);
  });
});
