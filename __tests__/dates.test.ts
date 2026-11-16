import {
  calendarDayDiff,
  formatHumanDate,
  getLocalDateKey,
  getLocalTimeStamp,
  makeRecordKey,
  nowOnDateKey,
} from '../src/lib/dates';

describe('date keys and stamps', () => {
  it('zero-pads local date keys and time stamps', () => {
    const date = new Date(2026, 0, 5, 7, 3, 9);
    expect(getLocalDateKey(date)).toBe('2026-01-05');
    expect(getLocalTimeStamp(date)).toBe('07:03:09');
    expect(makeRecordKey('2026-01-05', 2, 'cat')).toBe('2026-01-05:2:cat');
  });

  it('defaults to the current time', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 16, 23, 59, 58));
    try {
      expect(getLocalDateKey()).toBe('2026-11-16');
      expect(getLocalTimeStamp()).toBe('23:59:58');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('formatHumanDate', () => {
  it('includes the weekday, month, day, and year', () => {
    const text = formatHumanDate(new Date(2026, 0, 5));
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/5/);
    expect(text).not.toMatch(/2026-01-05/);
  });
});

describe('calendarDayDiff', () => {
  it('counts calendar days and ignores time of day', () => {
    expect(
      calendarDayDiff(new Date(2026, 0, 5, 23, 59), new Date(2026, 0, 6, 0, 1)),
    ).toBe(1);
    expect(
      calendarDayDiff(new Date(2026, 0, 5, 0, 0), new Date(2026, 0, 5, 23, 59)),
    ).toBe(0);
    expect(calendarDayDiff(new Date(2026, 0, 6), new Date(2026, 0, 4))).toBe(
      -2,
    );
  });

  it('stays whole across DST and year boundaries', () => {
    expect(calendarDayDiff(new Date(2026, 2, 1), new Date(2026, 3, 1))).toBe(
      31,
    );
    expect(calendarDayDiff(new Date(2025, 11, 31), new Date(2026, 0, 1))).toBe(
      1,
    );
  });
});

describe('nowOnDateKey', () => {
  it('keeps the wall-clock time but moves the date', () => {
    const reference = new Date(2026, 4, 20, 14, 30, 15, 250);
    const result = nowOnDateKey('2025-02-03', reference);
    expect(result).toEqual(new Date(2025, 1, 3, 14, 30, 15, 250));
    expect(result).not.toBe(reference);
    expect(reference).toEqual(new Date(2026, 4, 20, 14, 30, 15, 250));
  });

  it('returns the reference unchanged for malformed keys', () => {
    const reference = new Date(2026, 4, 20, 14, 30);
    expect(nowOnDateKey('2025-2-3', reference)).toBe(reference);
    expect(nowOnDateKey('', reference)).toBe(reference);
  });

  it('defaults the reference to now', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 20, 9, 15));
    try {
      expect(nowOnDateKey('2026-01-01')).toEqual(new Date(2026, 0, 1, 9, 15));
    } finally {
      jest.useRealTimers();
    }
  });
});
