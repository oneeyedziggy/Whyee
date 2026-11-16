import { createDefaultCategory } from '../src/lib/category';
import { buildEntry } from '../src/lib/entries';
import type { CategorySelectionRecord } from '../src/types/category';

const category = { ...createDefaultCategory('number', 0, 'Mood'), id: 'mood' };

describe('buildEntry', () => {
  it('creates a fresh entry keyed by date, ordinal, and category', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 2, 8, 5, 9));
    try {
      expect(buildEntry(category, null, 2, '2026-01-02', { value: 7 })).toEqual({
        key: '2026-01-02:2:mood',
        categoryId: 'mood',
        dateKey: '2026-01-02',
        ordinal: 2,
        localTime: '08:05:09',
        value: 7,
        instanceId: 'mood:2',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('defaults the value to zero when the patch omits it', () => {
    expect(buildEntry(category, null, 0, '2026-01-02', {}).value).toBe(0);
  });

  it('keeps existing identity fields and applies the patch last', () => {
    const existing: CategorySelectionRecord = {
      key: 'stored-key',
      categoryId: 'mood',
      dateKey: '2025-12-31',
      ordinal: 4,
      localTime: '23:59:00',
      value: 3,
      instanceId: 'stored-instance',
      noteText: 'kept',
    };

    expect(
      buildEntry(category, existing, 0, '2026-01-02', { value: 5 }),
    ).toEqual({ ...existing, value: 5 });
  });

  it('derives missing identity fields from the existing ordinal', () => {
    const legacy = {
      ordinal: 3,
      value: 1,
    } as CategorySelectionRecord;
    const entry = buildEntry(category, legacy, 0, '2026-01-02', {});
    expect(entry).toMatchObject({
      key: '2026-01-02:3:mood',
      dateKey: '2026-01-02',
      instanceId: 'mood:3',
      value: 1,
    });
  });
});
