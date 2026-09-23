import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { CategoryInputCard } from '../src/components/CategoryInputCard';
import { createDefaultCategory } from '../src/lib/category';
import type { CategorySelectionRecord } from '../src/types/category';

jest.mock('lucide-react-native', () => ({
  Calendar: () => null,
  CalendarClock: () => null,
  Clock: () => null,
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

const dateKey = '2026-03-01';

const makeEntry = (
  categoryId: string,
  overrides: Partial<CategorySelectionRecord> = {},
): CategorySelectionRecord => ({
  key: `${dateKey}:0:${categoryId}`,
  categoryId,
  dateKey,
  ordinal: 0,
  localTime: '09:00:00',
  value: 0,
  instanceId: `${categoryId}:0`,
  ...overrides,
});

const renderCard = async (
  category: ReturnType<typeof createDefaultCategory>,
  entries: CategorySelectionRecord[],
  onChange: jest.Mock,
) =>
  render(
    React.createElement(CategoryInputCard, {
      category,
      entries,
      dateKey,
      onChange,
      onAddEntry: jest.fn(),
    }),
  );

describe('CategoryInputCard write-back', () => {
  it('applies the whole configured counter step to the stored value', async () => {
    const category = createDefaultCategory('counter', 0);
    if (category.kind !== 'counter') throw new Error('expected counter');
    category.counter.steps = [-5, 5];
    const onChange = jest.fn();
    const screen = await renderCard(
      category,
      [makeEntry(category.id, { value: 10 })],
      onChange,
    );

    fireEvent.press(screen.getByText('+5'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 15 }),
    );
  });

  it('resets a counter to zero', async () => {
    const category = createDefaultCategory('counter', 0);
    if (category.kind !== 'counter') throw new Error('expected counter');
    category.counter.steps = [1];
    const onChange = jest.fn();
    const screen = await renderCard(
      category,
      [makeEntry(category.id, { value: 42 })],
      onChange,
    );

    fireEvent.changeText(screen.getByDisplayValue('42'), '0');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 0 }),
    );
  });

  it('keeps typed note text and the selected date on a brand new entry', async () => {
    const category = createDefaultCategory('notes', 0);
    const onChange = jest.fn();
    const screen = await renderCard(category, [], onChange);

    fireEvent.changeText(screen.getByPlaceholderText('Write a note'), 'hello');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        noteText: 'hello',
        dateKey,
        key: `${dateKey}:0:${category.id}`,
      }),
    );
  });

  it('starts a duration timer stamped to the viewed date, not necessarily today', async () => {
    const category = createDefaultCategory('duration', 0);
    if (category.kind !== 'duration') throw new Error('expected duration');
    const onChange = jest.fn();
    const screen = await renderCard(category, [], onChange);

    fireEvent.press(screen.getByText('Start'));

    const [patch] = onChange.mock.calls[0];
    const [year, month, day] = dateKey.split('-').map(Number);
    const startedAt = new Date(patch.startTime);
    expect(startedAt.getFullYear()).toBe(year);
    expect(startedAt.getMonth()).toBe(month - 1);
    expect(startedAt.getDate()).toBe(day);
    expect(patch.stopTime).toBeUndefined();
  });

  it('resumes a previously-stopped timer from the real current moment, not the viewed date again', async () => {
    const category = createDefaultCategory('duration', 0);
    if (category.kind !== 'duration') throw new Error('expected duration');
    const onChange = jest.fn();
    const screen = await renderCard(
      category,
      [
        makeEntry(category.id, {
          value: 60000,
          durationMs: 60000,
          startTime: `${dateKey}T09:00:00.000Z`,
          stopTime: `${dateKey}T09:01:00.000Z`,
          durationRuns: [
            {
              startTime: `${dateKey}T09:00:00.000Z`,
              stopTime: `${dateKey}T09:01:00.000Z`,
              durationMs: 60000,
            },
          ],
        }),
      ],
      onChange,
    );

    fireEvent.press(screen.getByText('Start'));

    const [patch] = onChange.mock.calls[0];
    const realNow = new Date();
    const resumedAt = new Date(patch.startTime);
    expect(resumedAt.getFullYear()).toBe(realNow.getFullYear());
    expect(resumedAt.getMonth()).toBe(realNow.getMonth());
    expect(resumedAt.getDate()).toBe(realNow.getDate());
    expect(patch.stopTime).toBeUndefined();
  });

  it('clears duration state on reset', async () => {
    const category = createDefaultCategory('duration', 0);
    if (category.kind !== 'duration') throw new Error('expected duration');
    const onChange = jest.fn();
    const screen = await renderCard(
      category,
      [
        makeEntry(category.id, {
          value: 60000,
          durationMs: 60000,
          startTime: `${dateKey}T09:00:00.000Z`,
          stopTime: `${dateKey}T09:01:00.000Z`,
        }),
      ],
      onChange,
    );

    fireEvent.press(screen.getByText('Reset'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 0,
        durationMs: 0,
        startTime: undefined,
        stopTime: undefined,
      }),
    );
  });
});
