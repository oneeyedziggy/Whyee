import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CategoryInputCard } from '../src/components/CategoryInputCard';
import { NoteField } from '../src/components/NoteField';
import { styles } from '../src/components/categoryInputStyles';
import { createDefaultCategory } from '../src/lib/category';
import { registerConfirmHost, type ConfirmRequest } from '../src/lib/confirm';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../src/types/category';

// The native slider has no JS implementation under Jest; expose its props on a plain view.
jest.mock('@react-native-community/slider', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: object) =>
      createElement(View, { ...props, accessibilityLabel: 'Number slider' }),
  };
});

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

describe('event-time input', () => {
  it('logs the current wall-clock time for a new entry', async () => {
    const category = createDefaultCategory('event-time', 0);
    const onChange = jest.fn();
    const screen = await renderCard(category, [], onChange);

    await fireEvent.press(screen.getByLabelText(`Log ${category.name} now`));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dateKey,
        value: 0,
        localTime: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
      }),
    );
  });

  it('edits the stored time and re-stamps it with Now', async () => {
    const category = createDefaultCategory('event-time', 0);
    const onChange = jest.fn();
    const screen = await renderCard(
      category,
      [makeEntry(category.id)],
      onChange,
    );

    await fireEvent.changeText(screen.getByDisplayValue('09:00:00'), '10:15');
    await fireEvent(screen.getByDisplayValue('10:15'), 'submitEditing');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ localTime: '10:15:00', dateKey }),
    );

    await fireEvent.press(
      screen.getByLabelText(`Set ${category.name} time to now`),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        localTime: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
      }),
    );
  });

  it('falls back to an editable field when the stored time is unreadable', async () => {
    const category = createDefaultCategory('event-time', 0);
    if (category.kind !== 'event-time') throw new Error('expected event');
    const twelveHour = {
      ...category,
      eventTime: { ...category.eventTime, use24HourClock: false },
    };
    const screen = await renderCard(
      twelveHour,
      [makeEntry(category.id, { localTime: 'bogus' })],
      jest.fn(),
    );
    expect(screen.getByPlaceholderText('HH:MM:SS AM/PM')).toBeTruthy();
  });
});

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

    await fireEvent.press(screen.getByText('+5'));

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

    await fireEvent.changeText(screen.getByDisplayValue('42'), '0');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 0 }),
    );
  });

  it('keeps typed note text and the selected date on a brand new entry', async () => {
    const category = createDefaultCategory('notes', 0);
    const onChange = jest.fn();
    const screen = await renderCard(category, [], onChange);

    await fireEvent.changeText(screen.getByPlaceholderText('Write a note'), 'hello');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        noteText: 'hello',
        dateKey,
        key: `${dateKey}:0:${category.id}`,
      }),
    );
  });

  it('shows choice names by default and appends values inline when enabled', async () => {
    const category = createDefaultCategory('multiple-choice', 0, 'Mood');
    if (category.kind !== 'multiple-choice') throw new Error('expected choice');
    const screen = await renderCard(category, [], jest.fn());

    expect(category.showOptionValues).toBe(false);
    expect(screen.getByText('Option 1')).toBeTruthy();
    expect(screen.queryByText('Option 1 (Value: 0)')).toBeNull();

    await screen.rerender(
      React.createElement(CategoryInputCard, {
        category: { ...category, showOptionValues: true },
        entries: [],
        dateKey,
        onChange: jest.fn(),
        onAddEntry: jest.fn(),
      }),
    );
    expect(screen.getByText('Option 1 (Value: 0)')).toBeTruthy();
  });

  it('starts a duration timer stamped to the viewed date, not necessarily today', async () => {
    const category = createDefaultCategory('duration', 0);
    if (category.kind !== 'duration') throw new Error('expected duration');
    const onChange = jest.fn();
    const screen = await renderCard(category, [], onChange);

    await fireEvent.press(screen.getByText('Start'));

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

    await fireEvent.press(screen.getByText('Resume w/ gap'));

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

    await fireEvent.press(screen.getByText('Reset'));

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

describe('CategoryInputCard entries and choices', () => {
  let confirmRequests: ConfirmRequest[] = [];
  let unregister = () => {};
  beforeEach(() => {
    confirmRequests = [];
    unregister = registerConfirmHost((request) => confirmRequests.push(request));
  });
  afterEach(() => unregister());

  const card = (
    category: CategoryDefinition,
    entries: CategorySelectionRecord[],
    overrides: Partial<React.ComponentProps<typeof CategoryInputCard>> = {},
  ) => {
    const props = {
      category,
      entries,
      dateKey,
      onChange: jest.fn(),
      onAddEntry: jest.fn(),
      onDeleteEntry: jest.fn(),
      ...overrides,
    };
    return render(React.createElement(CategoryInputCard, props)).then(
      (screen) => ({ screen, props }),
    );
  };

  const choiceCategory = (multiSelect: boolean) => {
    const category = createDefaultCategory('multiple-choice', 0, 'Mood');
    if (category.kind !== 'multiple-choice') throw new Error('expected choice');
    return { ...category, multiSelect };
  };

  it('replaces the single selection when multi-select is off', async () => {
    const category = choiceCategory(false);
    const { screen, props } = await card(category, [
      makeEntry(category.id, { value: 1, selectedValues: [1] }),
    ]);
    await fireEvent.press(screen.getByText('Option 3'));
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2, selectedValues: [2] }),
    );
  });

  it('adds and removes values when multi-select is on', async () => {
    const category = choiceCategory(true);
    const { screen, props } = await card(category, [
      makeEntry(category.id, { value: 1 }),
    ]);
    await fireEvent.press(screen.getByText('Option 3'));
    expect(props.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 3, selectedValues: [1, 2] }),
    );
    await fireEvent.press(screen.getByText('Option 2'));
    expect(props.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 0, selectedValues: [] }),
    );
  });

  it('stacks choices only when measured widths overflow the row', async () => {
    const category = choiceCategory(false);
    const { screen } = await card(category, []);
    const option = (label: string) => screen.getByText(label).parent!;
    const layout = (width: number) => ({ nativeEvent: { layout: { width } } });
    const containerStyle = () =>
      StyleSheet.flatten(option('Option 1').parent!.props.style);

    await fireEvent(option('Option 1').parent!, 'layout', layout(300));
    await fireEvent(option('Option 1'), 'layout', layout(90));
    await fireEvent(option('Option 2'), 'layout', layout(90));
    // Not every option is measured yet, so the row stays horizontal.
    expect(containerStyle().flexDirection).toBe('row');
    await fireEvent(option('Option 2'), 'layout', layout(90));
    await fireEvent(option('Option 3'), 'layout', layout(90));
    // 270 + 2 gaps of 8 = 286 fits in 300.
    expect(containerStyle().flexDirection).toBe('row');

    await fireEvent(option('Option 3'), 'layout', layout(110));
    expect(containerStyle().flexDirection).toBe('column');
    expect(StyleSheet.flatten(option('Option 1').props.style)).toMatchObject(
      StyleSheet.flatten(styles.optionStacked)!,
    );
    // Stacked rows are full width, so their layouts no longer feed the measurement.
    await fireEvent(option('Option 3'), 'layout', layout(10));
    expect(containerStyle().flexDirection).toBe('column');
  });

  it('defaults number entries to the range minimum and writes slider changes', async () => {
    const category = createDefaultCategory('number', 0, 'Energy');
    if (category.kind !== 'number') throw new Error('expected number');
    const ranged = { ...category, range: { min: 2, max: 9, step: 1 } };
    const { screen, props } = await card(ranged, []);
    const slider = screen.getByLabelText('Number slider');
    expect(slider.props.value).toBe(2);
    expect(screen.getAllByText('2')).toHaveLength(2);
    await fireEvent(slider, 'valueChange', 7);
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 7 }));

    await screen.rerender(
      React.createElement(CategoryInputCard, {
        ...props,
        category: ranged,
        entries: [makeEntry(ranged.id, { value: 5 })],
      }),
    );
    expect(screen.getByLabelText('Number slider').props.value).toBe(5);
  });

  it('adds a note field to non-note categories and scores note sentiment', async () => {
    jest.useFakeTimers();
    try {
      const category = {
        ...createDefaultCategory('number', 0, 'Energy'),
        notesEnabled: true,
        sentimentEnabled: true,
      } as CategoryDefinition;
      const { screen, props } = await card(category, []);
      await fireEvent.changeText(screen.getByPlaceholderText('Add a note'), 'great day');
      await act(async () => jest.advanceTimersByTime(900));
      const scored = (props.onChange as jest.Mock).mock.calls.at(-1)![0];
      expect(scored.noteText).toBe('great day');
      expect(scored.sentimentScore).toBeGreaterThan(0);
      // Only note categories use the sentiment score as their value.
      expect(scored.value).not.toBe(scored.sentimentScore);

      const notes = { ...createDefaultCategory('notes', 0, 'Journal'), sentimentEnabled: true };
      const second = await card(notes, []);
      await fireEvent.changeText(second.screen.getAllByPlaceholderText('Write a note')[0], 'awful');
      await act(async () => jest.advanceTimersByTime(900));
      const noteScore = (second.props.onChange as jest.Mock).mock.calls.at(-1)![0];
      expect(noteScore.sentimentScore).toBeLessThan(0);
      expect(noteScore.value).toBe(noteScore.sentimentScore);
    } finally {
      jest.useRealTimers();
    }
  });

  it('adds entries and removes one only after confirmation', async () => {
    const category = {
      ...createDefaultCategory('number', 0, 'Energy'),
      allowMultiplePerDay: true,
    } as CategoryDefinition;
    const entries = [
      makeEntry(category.id),
      makeEntry(category.id, { key: `${dateKey}:1:${category.id}`, ordinal: 1 }),
    ];
    const { screen, props } = await card(category, entries);
    await fireEvent.press(screen.getByLabelText('Add Energy entry'));
    expect(props.onAddEntry).toHaveBeenCalledTimes(1);
    expect(props.onAddEntry).toHaveBeenCalledWith();

    await fireEvent.press(screen.getAllByText('Remove entry')[1]);
    expect(confirmRequests).toHaveLength(1);
    expect(confirmRequests[0]).toMatchObject({
      title: 'Delete entry?',
      confirmLabel: 'Delete',
    });
    expect(props.onDeleteEntry).not.toHaveBeenCalled();
    confirmRequests[0].onConfirm();
    expect(props.onDeleteEntry).toHaveBeenCalledWith(entries[1]);
  });

  it('counts the unsaved placeholder as the first entry when adding with none saved', async () => {
    const category = {
      ...createDefaultCategory('number', 0, 'Energy'),
      allowMultiplePerDay: true,
    } as CategoryDefinition;
    const { screen, props } = await card(category, []);
    await fireEvent.press(screen.getByLabelText('Add Energy entry'));
    expect(props.onAddEntry).toHaveBeenCalledTimes(2);
  });

  it('tolerates a missing delete handler', async () => {
    const category = createDefaultCategory('number', 0, 'Energy');
    const { screen } = await card(category, [makeEntry(category.id)], {
      onDeleteEntry: undefined,
    });
    await fireEvent.press(screen.getByText('Remove entry'));
    expect(() => confirmRequests[0].onConfirm()).not.toThrow();
  });

  it('hides the add button while a split timer owns new entries', async () => {
    const duration = createDefaultCategory('duration', 0, 'Run');
    if (duration.kind !== 'duration') throw new Error('expected duration');
    const { screen } = await card(
      {
        ...duration,
        allowMultiplePerDay: true,
        duration: { ...duration.duration, splitEnabled: true },
      },
      [],
    );
    expect(screen.queryByLabelText('Add Run entry')).toBeNull();
  });

  it('folds earlier split laps into the current lap instead of separate entries', async () => {
    const duration = createDefaultCategory('duration', 0, 'Run');
    if (duration.kind !== 'duration') throw new Error('expected duration');
    const split = { ...duration, duration: { ...duration.duration, splitEnabled: true } };
    const { screen } = await card(split, [
      makeEntry(split.id),
      makeEntry(split.id, { key: `${dateKey}:1:${split.id}`, ordinal: 1 }),
    ]);
    expect(screen.getAllByText('Remove entry')).toHaveLength(1);
  });

  it('blocks other duration entries while a different timer is active', async () => {
    const duration = createDefaultCategory('duration', 0, 'Run');
    const { screen } = await card(duration, [makeEntry(duration.id)], {
      activeDurationRecordKey: 'another-record',
    });
    expect(screen.getByText('Start').parent?.props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('CounterInput', () => {
  let confirmRequests: ConfirmRequest[] = [];
  let unregister = () => {};
  beforeEach(() => {
    confirmRequests = [];
    unregister = registerConfirmHost((request) => confirmRequests.push(request));
  });
  afterEach(() => unregister());

  const counter = (overrides: Partial<{ steps: number[]; editable: boolean; resetEnabled: boolean; splitEnabled: boolean }> = {}) => {
    const category = createDefaultCategory('counter', 0, 'Cups');
    if (category.kind !== 'counter') throw new Error('expected counter');
    return { ...category, counter: { ...category.counter, ...overrides } };
  };

  const renderCounter = (
    category: ReturnType<typeof counter>,
    entries: CategorySelectionRecord[],
  ) => {
    const onChange = jest.fn();
    const onAddEntry = jest.fn();
    return render(
      React.createElement(CategoryInputCard, {
        category,
        entries,
        dateKey,
        onChange,
        onAddEntry,
      }),
    ).then((screen) => ({ screen, onChange, onAddEntry }));
  };

  it('starts a missing entry from zero and labels negative steps plainly', async () => {
    const { screen, onChange } = await renderCounter(
      counter({ steps: [-2, 3], editable: false }),
      [],
    );
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByLabelText('Cups value')).toBeNull();
    await fireEvent.press(screen.getByText('-2'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: -2 }));
  });

  it('ignores blank or non-numeric typing and restores the value on blur', async () => {
    const category = counter({ editable: true });
    const { screen, onChange } = await renderCounter(category, [
      makeEntry(category.id, { value: 4 }),
    ]);
    const input = screen.getByLabelText('Cups value');
    await fireEvent.changeText(input, '  ');
    await fireEvent.changeText(input, 'abc');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Cups value').props.value).toBe('abc');
    await fireEvent(input, 'blur');
    expect(screen.getByLabelText('Cups value').props.value).toBe('4');
  });

  it('resets to zero only after confirmation', async () => {
    const category = counter({ resetEnabled: true });
    const { screen, onChange } = await renderCounter(category, [
      makeEntry(category.id, { value: 4 }),
    ]);
    await fireEvent.press(screen.getByText('Reset'));
    expect(confirmRequests[0]).toMatchObject({ title: 'Reset counter?', confirmLabel: 'Reset' });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => confirmRequests[0].onConfirm());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 0 }));
  });

  it('shows the running total on the last split with its own count beside it', async () => {
    const category = {
      ...counter({ splitEnabled: true, resetEnabled: true, editable: false }),
      allowMultiplePerDay: true,
    };
    const { screen, onAddEntry } = await renderCounter(category, [
      makeEntry(category.id, { value: 2 }),
      makeEntry(category.id, { key: `${dateKey}:1:${category.id}`, ordinal: 1, value: 5 }),
    ]);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('(5)')).toBeTruthy();
    // Only the last split gets Reset and Split.
    expect(screen.getAllByText('Reset')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Split'));
    expect(onAddEntry).toHaveBeenCalledWith();
  });

  it('shows the running total in the editable field of the last split', async () => {
    const category = {
      ...counter({ splitEnabled: true, editable: true }),
      allowMultiplePerDay: true,
    };
    const { screen } = await renderCounter(category, [
      makeEntry(category.id, { value: 2 }),
      makeEntry(category.id, { key: `${dateKey}:1:${category.id}`, ordinal: 1, value: 5 }),
    ]);
    expect(screen.getAllByLabelText('Cups value').map((input) => input.props.value)).toEqual([
      '2',
      '7',
    ]);
  });
});

describe('NoteField', () => {
  const field = (props: Partial<React.ComponentProps<typeof NoteField>> = {}) => ({
    value: '',
    sentimentEnabled: true,
    placeholder: 'Note',
    onChangeText: jest.fn(),
    onScore: jest.fn(),
    ...props,
  });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces sentiment scoring and scores blank notes as neutral', async () => {
    const props = field();
    const screen = await render(React.createElement(NoteField, props));
    expect(screen.getByText('—')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Note'), 'good');
    await act(async () => jest.advanceTimersByTime(500));
    await fireEvent.changeText(screen.getByPlaceholderText('Note'), '   ');
    expect(screen.getByLabelText('Calculating sentiment')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(899));
    expect(props.onScore).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(props.onScore).toHaveBeenCalledTimes(1);
    expect(props.onScore).toHaveBeenCalledWith(0, '   ');
    expect(props.onChangeText).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Calculating sentiment')).toBeNull();
  });

  it('shows a neutral score when a note has no stored score', async () => {
    const screen = await render(React.createElement(NoteField, field({ value: 'hi' })));
    expect(screen.getByText('0.00')).toBeTruthy();
    await screen.rerender(
      React.createElement(NoteField, field({ value: 'hi', score: 1.234 })),
    );
    expect(screen.getByText('1.23')).toBeTruthy();
  });

  it('skips scoring when sentiment is disabled', async () => {
    const props = field({ sentimentEnabled: false });
    const screen = await render(React.createElement(NoteField, props));
    expect(screen.queryByText('Sentiment')).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('Note'), 'good');
    await act(async () => jest.advanceTimersByTime(900));
    expect(props.onChangeText).toHaveBeenCalledWith('good');
    expect(props.onScore).not.toHaveBeenCalled();
  });

  it('adopts outside value changes but not echoes of its own typing', async () => {
    const props = field({ sentimentEnabled: false });
    const screen = await render(React.createElement(NoteField, props));
    await fireEvent.changeText(screen.getByPlaceholderText('Note'), 'typed');
    await screen.rerender(React.createElement(NoteField, { ...props, value: 'typed' }));
    expect(screen.getByPlaceholderText('Note').props.value).toBe('typed');
    await screen.rerender(React.createElement(NoteField, { ...props, value: 'synced' }));
    expect(screen.getByPlaceholderText('Note').props.value).toBe('synced');
  });

  it('cancels a pending score on unmount', async () => {
    const props = field();
    const screen = await render(React.createElement(NoteField, props));
    await fireEvent.changeText(screen.getByPlaceholderText('Note'), 'good');
    await screen.unmount();
    jest.advanceTimersByTime(900);
    expect(props.onScore).not.toHaveBeenCalled();
    const idle = await render(React.createElement(NoteField, field()));
    await idle.unmount();
  });
});
