import { applyNotificationResponse } from '../src/lib/notificationEntry';
import { createDefaultCategory } from '../src/lib/category';
import type { CategorySelectionRecord } from '../src/types/category';

const date = new Date(2026, 8, 16, 9, 5, 0);

const entry = (
  categoryId: string,
  ordinal: number,
  value: number,
): CategorySelectionRecord => ({
  key: `2026-09-16:${ordinal}:${categoryId}`,
  categoryId,
  dateKey: '2026-09-16',
  ordinal,
  localTime: '08:00:00',
  value,
  instanceId: `${categoryId}:${ordinal}`,
});

describe('notification entry application', () => {
  it('creates the first choice response as the day entry', () => {
    const category = createDefaultCategory('multiple-choice', 0);
    if (category.kind !== 'multiple-choice') throw new Error('expected choice');
    const result = applyNotificationResponse(
      category,
      [],
      { actionIdentifier: 'choice:1' },
      date,
    );

    expect(result).toMatchObject({
      kind: 'created',
      entry: {
        ordinal: 0,
        dateKey: '2026-09-16',
        value: category.options[1].value,
        selectedValues: [category.options[1].value],
      },
    });
  });

  it('appends a new ordinal for multiple-per-day values', () => {
    const category = createDefaultCategory('counter', 0);
    if (category.kind !== 'counter') throw new Error('expected counter');
    const multiple = { ...category, allowMultiplePerDay: true };
    const result = applyNotificationResponse(
      multiple,
      [entry(category.id, 0, 2)],
      { actionIdentifier: 'step:1' },
      date,
    );

    expect(result).toMatchObject({
      kind: 'appended',
      entry: { ordinal: 1, value: 1 },
    });
  });

  it('proposes an overwrite for a single number entry', () => {
    const category = createDefaultCategory('number', 0);
    if (category.kind !== 'number') throw new Error('expected number');
    const result = applyNotificationResponse(
      category,
      [entry(category.id, 0, 3)],
      { userText: '7' },
      date,
    );

    expect(result).toMatchObject({
      kind: 'overwrite',
      existing: { value: 3 },
      entry: { value: 7, ordinal: 0 },
    });
  });

  it('rejects numbers outside the configured range or step', () => {
    const category = createDefaultCategory('number', 0);
    if (category.kind !== 'number') throw new Error('expected number');
    expect(
      applyNotificationResponse(category, [], { userText: '10.5' }, date),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      applyNotificationResponse(category, [], { userText: '11' }, date),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('stores note sentiment consistently with manual notes', () => {
    const category = createDefaultCategory('notes', 0);
    const result = applyNotificationResponse(
      category,
      [],
      { userText: 'A wonderful day' },
      date,
    );

    expect(result).toMatchObject({
      kind: 'created',
      entry: { noteText: 'A wonderful day' },
    });
    if (result.kind !== 'invalid')
      expect(result.entry.value).toBe(result.entry.sentimentScore);
  });
});
