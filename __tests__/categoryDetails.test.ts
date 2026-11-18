import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  CategoryDetails,
  GroupDetails,
} from '../src/components/CategoryDetails';
import { createDefaultCategory } from '../src/lib/category';
import { confirmAction } from '../src/lib/confirm';
import { StyleSheet } from 'react-native';
import { styles } from '../src/components/categoryEditorStyles';
import type {
  CategoryDefinition,
  CategoryGroup,
} from '../src/types/category';

jest.mock('../src/lib/confirm', () => ({ confirmAction: jest.fn() }));

// Gesture-driven drops are covered by the dragReorder tests; this fake exposes onDrop and the held row.
const mockDraggable: {
  onDrop?: (from: number, to: number) => void;
  fallbackHeightFor?: (index: number) => number;
  heldIndex?: number;
} = {};
jest.mock('../src/components/DraggableList', () => {
  const { createElement, Fragment } =
    jest.requireActual<typeof import('react')>('react');
  return {
    DraggableList: <T,>(props: {
      items: T[];
      keyFor: (item: T, index: number) => string;
      renderItem: (item: T, state: object) => unknown;
      onDrop: (from: number, to: number) => void;
      fallbackHeightFor: (index: number) => number;
    }) => {
      mockDraggable.onDrop = props.onDrop;
      mockDraggable.fallbackHeightFor = props.fallbackHeightFor;
      return props.items.map((item, index) =>
        createElement(
          Fragment,
          { key: props.keyFor(item, index) },
          props.renderItem(item, {
            index,
            held: mockDraggable.heldIndex === index,
            panHandlers: {},
          }) as never,
        ),
      );
    },
  };
});

const confirm = jest.mocked(confirmAction);
const reading = (): CategoryDefinition => ({
  ...createDefaultCategory('number', 0, 'Reading'),
  id: 'reading',
});

const renderDetails = (
  category: CategoryDefinition,
  onUpdate: jest.Mock,
  entryCount = 0,
) =>
  render(
    React.createElement(CategoryDetails, {
      category,
      entryCount,
      onUpdate,
      onDelete: jest.fn(),
      onDragChange: jest.fn(),
    }),
  );

beforeEach(() => confirm.mockReset());

it('switches type immediately without logged entries and ignores the current type', async () => {
  const onUpdate = jest.fn();
  const screen = await renderDetails(reading(), onUpdate);

  await fireEvent.press(screen.getByLabelText('Number'));
  expect(onUpdate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Counter'));

  expect(confirm).not.toHaveBeenCalled();
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'reading', kind: 'counter' }),
  );
});

it('asks before switching the type of a category with logged entries', async () => {
  const onUpdate = jest.fn();
  const screen = await renderDetails(reading(), onUpdate, 3);

  await fireEvent.press(screen.getByLabelText('Duration'));

  expect(onUpdate).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith(
    'Change category type?',
    expect.stringContaining('"Reading" has 3 logged entries.'),
    'Change type',
    expect.any(Function),
  );
  confirm.mock.calls[0][3]();
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'reading', kind: 'duration' }),
  );
});

it('shows Inverse and Main columns, grouped daily stats and no main aggregation control', async () => {
  const Harness = () => {
    const [category, setCategory] = React.useState<CategoryDefinition>({
      ...reading(),
      allowMultiplePerDay: true,
      virtualSeries: [],
    });
    return React.createElement(CategoryDetails, {
      category,
      onUpdate: setCategory,
      onDelete: jest.fn(),
      onDragChange: jest.fn(),
    });
  };
  const screen = await render(React.createElement(Harness));

  expect(screen.queryByText('Main aggregation')).toBeNull();
  expect(screen.queryByText('Inverse main series')).toBeNull();
  expect(screen.getByText('Inverse')).toBeTruthy();
  expect(screen.getByText('Main')).toBeTruthy();
  expect(screen.getByText('Entries')).toBeTruthy();
  expect(screen.getByText('Median')).toBeTruthy();

  const meanMain = screen.getByLabelText('Enable correlation of Reading mean');
  const meanInverse = screen.getByLabelText(
    'Enable inverse correlation of Reading mean',
  );
  expect(meanMain.props.accessibilityState.checked).toBe(true);
  expect(meanInverse.props.accessibilityState.checked).toBe(false);

  await fireEvent.press(meanInverse);
  await waitFor(() =>
    expect(
      screen.getByLabelText('Enable inverse correlation of Reading mean').props
        .accessibilityState.checked,
    ).toBe(true),
  );
  expect(
    screen.getByLabelText('Enable correlation of Reading mean').props
      .accessibilityState.checked,
  ).toBe(true);
});

type Updater = jest.Mock<void, [CategoryDefinition]>;

const StatefulDetails = ({
  initial,
  spy,
  entryCount = 0,
  onDelete = jest.fn(),
}: {
  initial: CategoryDefinition;
  spy: Updater;
  entryCount?: number;
  onDelete?: () => void;
}) => {
  const [category, setCategory] = React.useState(initial);
  return React.createElement(CategoryDetails, {
    category,
    entryCount,
    onUpdate: (next: CategoryDefinition) => {
      spy(next);
      setCategory(next);
    },
    onDelete,
    onDragChange: jest.fn(),
  });
};

const renderStateful = (initial: CategoryDefinition, entryCount = 0) => {
  const spy: Updater = jest.fn();
  const onDelete = jest.fn();
  return render(
    React.createElement(StatefulDetails, { initial, spy, entryCount, onDelete }),
  ).then((screen) => ({ screen, spy, onDelete }));
};

const last = (spy: Updater) => spy.mock.calls[spy.mock.calls.length - 1][0];

const choice = (): Extract<CategoryDefinition, { kind: 'multiple-choice' }> => {
  const category = createDefaultCategory('multiple-choice', 0, 'Mood');
  if (category.kind !== 'multiple-choice') throw new Error('expected choice');
  return { ...category, id: 'mood' };
};

describe('CategoryDetails editing', () => {
  it('uses singular wording for one logged entry and switches only on confirm', async () => {
    const { screen, spy } = await renderStateful(reading(), 1);
    await fireEvent.press(screen.getByLabelText('Notes'));
    expect(confirm.mock.calls[0][1]).toContain('has 1 logged entry.');
    expect(spy).not.toHaveBeenCalled();
    await act(async () => confirm.mock.calls[0][3]());
    expect(last(spy).kind).toBe('notes');
    expect(screen.getByText(/stores notes and can optionally derive/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Choice'));
    await act(async () => confirm.mock.calls[1][3]());
    expect(last(spy).kind).toBe('multiple-choice');
  });

  it('renames, toggles the shared switches, and recomputes series', async () => {
    const { screen, spy } = await renderStateful(reading());
    await fireEvent.changeText(screen.getByPlaceholderText('Category name'), 'Pages');
    expect(last(spy).name).toBe('Pages');
    expect(last(spy).virtualSeries.length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText('Enabled'));
    expect(last(spy).enabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Correlate only within this group'));
    expect(last(spy).correlateWithinGroup).toBe(true);
    await fireEvent.press(screen.getByLabelText('Correlate with weekdays'));
    expect(last(spy)).toMatchObject({ weeklyEffectEnabled: true });
    await fireEvent.press(screen.getByLabelText('Correlate with inverse weekdays'));
    expect(last(spy)).toMatchObject({ weeklyEffectInverseEnabled: true });

    expect(screen.queryByLabelText('Analyze note sentiment locally')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Allow notes'));
    expect(last(spy).notesEnabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Analyze note sentiment locally'));
    expect(last(spy).sentimentEnabled).toBe(false);
    expect(last(spy)).not.toHaveProperty('notes');

    await fireEvent.press(screen.getByLabelText('Allow multiple per day'));
    expect(last(spy).allowMultiplePerDay).toBe(true);

    await fireEvent.press(screen.getByLabelText('What does Allow notes mean?'));
    expect(screen.getByText(/free-text note field/)).toBeTruthy();
  });

  it('mirrors sentiment into the notes config for notes categories', async () => {
    const notes = {
      ...createDefaultCategory('notes', 0, 'Journal'),
      notesEnabled: true,
    } as CategoryDefinition;
    const { screen, spy } = await renderStateful(notes);
    expect(screen.queryByLabelText('Correlate with weekdays')).toBeNull();
    expect(screen.queryByLabelText('Correlate with inverse weekdays')).toBeNull();
    const before = notes.sentimentEnabled;
    await fireEvent.press(screen.getByLabelText('Analyze note sentiment locally'));
    expect(last(spy)).toMatchObject({
      sentimentEnabled: !before,
      notes: { sentimentEnabled: !before },
    });
  });

  it('updates numeric ranges and falls back to zero for invalid input', async () => {
    const { screen, spy } = await renderStateful(reading());
    const inputs = screen.getAllByDisplayValue(/^-?\d+(\.\d+)?$/);
    await fireEvent.changeText(inputs[1], '42');
    expect((last(spy) as { range: { max: number } }).range.max).toBe(42);
    await fireEvent.changeText(inputs[0], 'abc');
    expect((last(spy) as { range: { min: number } }).range.min).toBe(0);
  });

  it('toggles every duration option and locks multiple-per-day while splitting', async () => {
    const duration = createDefaultCategory('duration', 0, 'Sleep');
    const { screen, spy } = await renderStateful(duration);
    const config = () =>
      (last(spy) as Extract<CategoryDefinition, { kind: 'duration' }>).duration;
    await fireEvent.press(screen.getByLabelText('Show reset button'));
    expect(config().resetEnabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Cumulative duration'));
    expect(config().cumulative).toBe(true);
    await fireEvent.press(screen.getByLabelText('Animate timer'));
    expect(config().animate).toBe(false);
    await fireEvent.press(screen.getByLabelText('Show milliseconds'));
    expect(config().showMilliseconds).toBe(true);
    expect(
      screen.getByLabelText('Allow multiple per day').props.accessibilityState.disabled,
    ).toBe(false);
    await fireEvent.press(screen.getByLabelText('Show split / lap'));
    expect(config().splitEnabled).toBe(true);
    expect(
      screen.getByLabelText('Allow multiple per day').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('edits counter steps, ignores lists without usable steps, and restores on blur', async () => {
    const counter = createDefaultCategory('counter', 0, 'Cups') as Extract<
      CategoryDefinition,
      { kind: 'counter' }
    >;
    const { screen, spy } = await renderStateful(counter);
    const steps = () =>
      (last(spy) as Extract<CategoryDefinition, { kind: 'counter' }>).counter;
    const input = screen.getByPlaceholderText('-10, -5, -1, 1, 5, 10');
    await fireEvent.changeText(input, '2, x, 0, 4');
    expect(steps().steps).toEqual([2, 4]);
    const calls = spy.mock.calls.length;
    await fireEvent.changeText(input, 'x, 0');
    expect(spy).toHaveBeenCalledTimes(calls);
    expect(input.props.value).toBe('x, 0');
    await fireEvent(input, 'blur');
    expect(screen.getByPlaceholderText('-10, -5, -1, 1, 5, 10').props.value).toBe('2, 4');

    await fireEvent.press(screen.getByLabelText('Show reset button'));
    expect(steps().resetEnabled).toBe(!counter.counter.resetEnabled);
    await fireEvent.press(screen.getByLabelText('Allow direct editing'));
    expect(steps().editable).toBe(!counter.counter.editable);
    await fireEvent.press(screen.getByLabelText('Show split / lap'));
    expect(steps().splitEnabled).toBe(true);
    expect(
      screen.getByLabelText('Allow multiple per day').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('edits choices: modes, labels, values, add, delete, and drop reorder', async () => {
    const { screen, spy } = await renderStateful(choice());
    const options = () =>
      (last(spy) as Extract<CategoryDefinition, { kind: 'multiple-choice' }>);

    expect(screen.queryByLabelText('Sum occurrences')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Separate items'));
    expect(options().optionSeriesMode).toBe('items');
    // Repeats are impossible without multi-select or multiple entries per day.
    expect(screen.queryByLabelText('Sum occurrences')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Allow multiple selections'));
    expect(options().multiSelect).toBe(true);
    await fireEvent.press(screen.getByLabelText('Sum occurrences'));
    expect(options().optionOccurrenceMode).toBe('sum');
    await fireEvent.press(screen.getByLabelText('Any = 1'));
    expect(options().optionOccurrenceMode).toBe('capped');
    await fireEvent.press(screen.getByLabelText('Quality / Quantity / Intensity'));
    expect(options().optionSeriesMode).toBe('intensity');

    const label = screen.getByLabelText('Name for choice 1');
    const calls = spy.mock.calls.length;
    await fireEvent.changeText(label, '   ');
    expect(spy).toHaveBeenCalledTimes(calls);
    await fireEvent(label, 'blur');
    expect(screen.getByLabelText('Name for choice 1').props.value).toBe('Option 1');
    await fireEvent(screen.getByLabelText('Name for choice 1'), 'blur');
    await fireEvent.changeText(screen.getByLabelText('Name for choice 1'), 'Calm');
    expect(options().options[0].label).toBe('Calm');

    await fireEvent.changeText(screen.getByLabelText('Value for Calm'), 'nope');
    expect(options().options[0].value).toBe(0);
    await fireEvent.changeText(screen.getByLabelText('Value for Calm'), '7');
    expect(options().options[0].value).toBe(7);

    await fireEvent.press(screen.getByLabelText('Add choice'));
    expect(options().options.map((option) => option.value)).toEqual([0, 1, 2, 3]);
    await fireEvent.press(screen.getByLabelText('Delete choice Calm'));
    expect(options().options.map((option) => option.label)).toEqual([
      'Option 2',
      'Option 3',
      'Option 4',
    ]);

    await act(async () => mockDraggable.onDrop?.(0, 3));
    expect(options().options.map((option) => option.label)).toEqual([
      'Option 3',
      'Option 4',
      'Option 2',
    ]);
    expect(options().options.map((option) => option.value)).toEqual([0, 1, 2]);
    // Unmeasured rows fall back to a fixed, positive drag height.
    expect(mockDraggable.fallbackHeightFor?.(0)).toBeGreaterThan(0);
  });

  it('allows blank labels only while option values are shown', async () => {
    const { screen, spy } = await renderStateful(choice());
    await fireEvent.press(screen.getByLabelText('Show option values'));
    expect(last(spy)).toMatchObject({ showOptionValues: true });
    await fireEvent.changeText(screen.getByLabelText('Name for choice 2'), '');
    expect(
      (last(spy) as Extract<CategoryDefinition, { kind: 'multiple-choice' }>)
        .options[1].label,
    ).toBe('');
    expect(
      screen.getByText('Add a printable name to every choice before hiding its value.'),
    ).toBeTruthy();
    const toggle = screen.getByLabelText('Show option values');
    expect(toggle.props.accessibilityState.disabled).toBe(true);
    const calls = spy.mock.calls.length;
    await fireEvent.press(toggle);
    expect(spy).toHaveBeenCalledTimes(calls);
  });

  it('highlights the row being dragged', async () => {
    mockDraggable.heldIndex = 1;
    try {
      const { screen } = await renderStateful(choice());
      const style = (label: string) =>
        StyleSheet.flatten(screen.getByLabelText(label).parent?.props.style);
      expect(style('Reorder Option 2')).toMatchObject(
        StyleSheet.flatten(styles.categoryDragging)!,
      );
      expect(style('Reorder Option 1')).not.toMatchObject(
        StyleSheet.flatten(styles.categoryDragging)!,
      );
    } finally {
      mockDraggable.heldIndex = undefined;
    }
  });

  it('toggles a virtual series main switch', async () => {
    const { screen, spy } = await renderStateful(reading());
    const main = screen.getAllByLabelText(/^Enable correlation of /)[0];
    expect(main.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(main);
    expect(last(spy).virtualSeries[0].enabled).toBe(false);
  });

  it('only deletes after confirming removal', async () => {
    const { screen, onDelete } = await renderStateful(reading());
    await fireEvent.press(screen.getByText('Remove category'));
    expect(confirm).toHaveBeenCalledWith(
      'Delete category',
      'Delete "Reading"? This cannot be undone.',
      'Delete',
      onDelete,
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('GroupDetails', () => {
  const group: CategoryGroup = {
    id: 'g',
    name: 'Health',
    categoryIds: ['a', 'b'],
    expanded: true,
  };

  describe('event-time editor', () => {
  const { measureInWindow } = jest.requireActual(
    '@react-native/jest-preset/jest/MockNativeMethods',
  ).default as { measureInWindow: jest.Mock };
  beforeEach(() =>
    measureInWindow.mockImplementation(
      (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(0, 0, 20, 20),
    ),
  );
  afterEach(() => measureInWindow.mockReset());
  const pain = (): CategoryDefinition => ({
    ...createDefaultCategory('event-time', 0, 'Pain'),
    id: 'pain',
  });
  const source = (id: string, name: string): CategoryDefinition => ({
    ...createDefaultCategory('event-time', 1, name),
    id,
  });
  const renderWith = (
    self: CategoryDefinition,
    others: CategoryDefinition[],
    onUpdate: jest.Mock,
  ) =>
    render(
      React.createElement(CategoryDetails, {
        category: self,
        categories: [self, ...others],
        onUpdate,
        onDelete: jest.fn(),
        onDragChange: jest.fn(),
      }),
    );

  it('switches a category to the event type', async () => {
    const onUpdate = jest.fn();
    const screen = await renderDetails(reading(), onUpdate);
    await fireEvent.press(screen.getByLabelText('Event'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reading', kind: 'event-time' }),
    );
  });

  it('prompts for sources when no other categories exist', async () => {
    const screen = await renderDetails(pain(), jest.fn());
    expect(
      screen.getByText(
        'Add another category to measure time since its entries.',
      ),
    ).toBeTruthy();
  });

  it('toggles the clock and adds a time-since source from the dropdown, excluding itself', async () => {
    const onUpdate = jest.fn();
    const screen = await renderWith(pain(), [source('meals', 'Meals')], onUpdate);

    await fireEvent.press(screen.getByLabelText('Use 24-hour clock'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTime: expect.objectContaining({ use24HourClock: false }),
      }),
    );

    await fireEvent.press(screen.getByLabelText('Add time-since source'));
    // The menu offers other categories but never the category itself.
    expect(screen.queryByLabelText('Pain')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Meals'));
    const added = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(added.eventTime.timeSinceCategoryIds).toEqual(['meals']);
    expect(
      added.virtualSeries.some(
        (series: { id: string; name: string }) =>
          series.id === 'pain:since:meals' &&
          series.name === 'Pain minutes since Meals',
      ),
    ).toBe(true);
  });

  it('replaces a row source from its dropdown, offering only unclaimed categories', async () => {
    const base = pain();
    if (base.kind !== 'event-time') throw new Error('expected event');
    const self: CategoryDefinition = {
      ...base,
      eventTime: {
        use24HourClock: true,
        timeSinceCategoryIds: ['meals', 'sleep'],
      },
    };
    const onUpdate = jest.fn();
    const screen = await renderWith(
      self,
      [source('meals', 'Meals'), source('sleep', 'Sleep'), source('water', 'Water')],
      onUpdate,
    );

    await fireEvent.press(screen.getByLabelText('Time-since source Meals'));
    // A category claimed by another row is excluded; the row's own selection stays listed.
    expect(screen.queryByLabelText('Sleep')).toBeNull();
    expect(screen.getByLabelText('Meals')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Water'));
    const replaced = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(replaced.eventTime.timeSinceCategoryIds).toEqual(['water', 'sleep']);
  });

  it('removes a selected source and labels dangling references', async () => {
    const base = pain();
    if (base.kind !== 'event-time') throw new Error('expected event');
    const self: CategoryDefinition = {
      ...base,
      eventTime: { use24HourClock: true, timeSinceCategoryIds: ['meals', 'ghost'] },
    };
    const onUpdate = jest.fn();
    const screen = await renderWith(self, [source('meals', 'Meals')], onUpdate);

    // A reference to a deleted category still renders with a placeholder label.
    expect(screen.getByText('Missing category')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Remove time-since source Meals'));
    const removed = onUpdate.mock.calls[0][0];
    expect(removed.eventTime.timeSinceCategoryIds).toEqual(['ghost']);
    expect(
      removed.virtualSeries.some(
        (series: { id: string }) => series.id === 'pain:since:meals',
      ),
    ).toBe(false);
  });

  it('hides the add trigger once every category is claimed', async () => {
    const base = pain();
    if (base.kind !== 'event-time') throw new Error('expected event');
    const self: CategoryDefinition = {
      ...base,
      eventTime: { use24HourClock: true, timeSinceCategoryIds: ['meals'] },
    };
    const screen = await renderWith(self, [source('meals', 'Meals')], jest.fn());
    expect(screen.queryByLabelText('Add time-since source')).toBeNull();
  });

  it('adds time-since sources to duration categories', async () => {
    const timer: CategoryDefinition = {
      ...createDefaultCategory('duration', 0, 'Timer'),
      id: 'timer',
    };
    const onUpdate = jest.fn();
    const screen = await renderWith(timer, [source('meals', 'Meals')], onUpdate);

    await fireEvent.press(screen.getByLabelText('Add time-since source'));
    await fireEvent.press(screen.getByLabelText('Meals'));
    const added = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][0];
    expect(added.duration.timeSinceCategoryIds).toEqual(['meals']);
    expect(
      added.virtualSeries.some(
        (series: { id: string; name: string }) =>
          series.id === 'timer:since:meals' &&
          series.name === 'Timer minutes since Meals',
      ),
    ).toBe(true);
  });
});

it('renames, toggles, and deletes an enabled group', async () => {
    const onUpdate = jest.fn();
    const onToggleEnabled = jest.fn();
    const onDelete = jest.fn();
    const screen = await render(
      React.createElement(GroupDetails, { group, onUpdate, onToggleEnabled, onDelete }),
    );
    expect(screen.getByText('Categories in this group: 2')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Group name'), 'Body');
    expect(onUpdate).toHaveBeenCalledWith({ ...group, name: 'Body' });
    await fireEvent.press(screen.getByLabelText('Enabled'));
    expect(onToggleEnabled).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByText('Delete group'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('explains restoration for a disabled group', async () => {
    const screen = await render(
      React.createElement(GroupDetails, {
        group: { ...group, enabled: false },
        onUpdate: jest.fn(),
        onToggleEnabled: jest.fn(),
        onDelete: jest.fn(),
      }),
    );
    expect(screen.getByText(/turns its 2 categories off/)).toBeTruthy();
  });
});
