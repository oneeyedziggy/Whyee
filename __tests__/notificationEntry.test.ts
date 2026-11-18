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

  it('stamps the response time for event-time categories', () => {
    const category = createDefaultCategory('event-time', 0);
    if (category.kind !== 'event-time') throw new Error('expected event');
    const created = applyNotificationResponse(category, [], {}, date);
    expect(created).toMatchObject({
      kind: 'created',
      entry: { ordinal: 0, dateKey: '2026-09-16', localTime: '09:05:00', value: 0 },
    });

    // A repeat response on a single-entry day re-stamps the existing entry.
    const overwrite = applyNotificationResponse(
      category,
      [entry(category.id, 0, 0)],
      {},
      date,
    );
    expect(overwrite).toMatchObject({
      kind: 'overwrite',
      entry: { ordinal: 0, localTime: '09:05:00' },
    });

    const appended = applyNotificationResponse(
      { ...category, allowMultiplePerDay: true },
      [entry(category.id, 0, 0)],
      {},
      date,
    );
    expect(appended).toMatchObject({
      kind: 'appended',
      entry: { ordinal: 1, localTime: '09:05:00' },
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

describe('notification entry edge cases', () => {
  const number = () => {
    const category = createDefaultCategory('number', 0);
    if (category.kind !== 'number') throw new Error('expected number');
    return category;
  };

  it('refuses duration categories outright', () => {
    expect(
      applyNotificationResponse(createDefaultCategory('duration', 0), [], {}, date),
    ).toEqual({
      kind: 'invalid',
      reason: 'Duration entries must be entered in the app.',
    });
  });

  it.each([undefined, '', '   ', 'abc', 'Infinity', '-1', '2.5'])(
    'rejects number reply %p',
    (userText) => {
      const category = { ...number(), range: { min: 0, max: 10, step: 1 } };
      expect(
        applyNotificationResponse(category, [], { userText }, date),
      ).toMatchObject({ kind: 'invalid' });
    },
  );

  it('accepts trimmed numbers on fractional steps', () => {
    const category = { ...number(), range: { min: 0, max: 1, step: 0.1 } };
    expect(
      applyNotificationResponse(category, [], { userText: ' 0.3 ' }, date),
    ).toMatchObject({ kind: 'created', entry: { value: 0.3 } });
  });

  it('matches choice options by id or index and rejects unknown or multi-select replies', () => {
    const category = createDefaultCategory('multiple-choice', 0);
    if (category.kind !== 'multiple-choice') throw new Error('expected choice');
    const byId = applyNotificationResponse(
      category,
      [],
      { actionIdentifier: `choice:${category.options[2].id}` },
      date,
    );
    expect(byId).toMatchObject({ entry: { value: category.options[2].value } });
    for (const actionIdentifier of [undefined, 'choice:99', 'choice:nope']) {
      expect(
        applyNotificationResponse(category, [], { actionIdentifier }, date),
      ).toMatchObject({ kind: 'invalid' });
    }
    expect(
      applyNotificationResponse(
        { ...category, multiSelect: true },
        [],
        { actionIdentifier: 'choice:0' },
        date,
      ),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('adds counter steps onto the existing single-per-day total', () => {
    const category = createDefaultCategory('counter', 0);
    if (category.kind !== 'counter') throw new Error('expected counter');
    expect(
      applyNotificationResponse(
        category,
        [entry(category.id, 0, 5)],
        { actionIdentifier: 'step:0' },
        date,
      ),
    ).toMatchObject({ kind: 'overwrite', entry: { value: 4 } });
    expect(
      applyNotificationResponse(category, [], { actionIdentifier: 'step:1' }, date),
    ).toMatchObject({ kind: 'created', entry: { value: 1 } });
  });

  it.each([undefined, 'step:', 'step:9', 'step:1.5', 'step:x'])(
    'rejects counter action %p',
    (actionIdentifier) => {
      const category = createDefaultCategory('counter', 0);
      expect(
        applyNotificationResponse(category, [], { actionIdentifier }, date),
      ).toMatchObject({ kind: 'invalid' });
    },
  );

  it('appends after the highest ordinal regardless of entry order', () => {
    const category = {
      ...createDefaultCategory('counter', 0),
      allowMultiplePerDay: true,
    };
    const result = applyNotificationResponse(
      category,
      [entry(category.id, 3, 1), entry(category.id, 1, 1)],
      { actionIdentifier: 'step:1' },
      date,
    );
    expect(result).toMatchObject({
      kind: 'appended',
      entry: { ordinal: 4, key: `2026-09-16:4:${category.id}` },
    });
  });

  it('stores notes without sentiment when sentiment is disabled and rejects blank notes', () => {
    const category = {
      ...createDefaultCategory('notes', 0),
      sentimentEnabled: false,
    };
    const result = applyNotificationResponse(
      category,
      [],
      { userText: '  great  ' },
      date,
    );
    expect(result).toMatchObject({
      kind: 'created',
      entry: { noteText: 'great', value: 0 },
    });
    expect(result.kind !== 'invalid' && result.entry.sentimentScore).toBeUndefined();
    expect(
      applyNotificationResponse(category, [], { userText: '   ' }, date),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('backfills a missing instance id when overwriting a legacy entry', () => {
    const category = number();
    const legacy = { ...entry(category.id, 0, 1), instanceId: undefined };
    expect(
      applyNotificationResponse(category, [legacy], { userText: '2' }, date),
    ).toMatchObject({
      kind: 'overwrite',
      entry: { instanceId: `${category.id}:0` },
    });
  });

  it('defaults to the current date', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 1, 3, 4, 5, 6));
    try {
      expect(
        applyNotificationResponse(number(), [], { userText: '1' }),
      ).toMatchObject({
        entry: { dateKey: '2026-02-03', localTime: '04:05:06' },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
