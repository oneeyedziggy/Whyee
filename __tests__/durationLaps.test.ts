import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CategoryInputCard } from '../src/components/CategoryInputCard';
import { createDefaultCategory } from '../src/lib/category';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../src/types/category';

jest.mock('../src/components/SystemTimeField', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  return {
    SystemTimeField: ({ accessibilityLabel }: { accessibilityLabel: string }) =>
      ReactLib.createElement(Text, null, accessibilityLabel),
  };
});
jest.mock('../src/lib/confirm', () => ({
  confirmAction: (
    _title: string,
    _message: string,
    _label: string,
    onConfirm: () => void,
  ) => onConfirm(),
}));

const base = createDefaultCategory('duration', 0, 'Sleep') as Extract<
  CategoryDefinition,
  { kind: 'duration' }
>;
const category: CategoryDefinition = {
  ...base,
  allowMultiplePerDay: true,
  duration: { ...base.duration, splitEnabled: true, animate: false },
};

const makeLap = (
  ordinal: number,
  start: Date,
  stop: Date,
): CategorySelectionRecord => {
  const durationMs = stop.getTime() - start.getTime();
  return {
    key: `2026-03-01:${ordinal}:${category.id}`,
    categoryId: category.id,
    dateKey: '2026-03-01',
    ordinal,
    localTime: '20:00:00',
    value: durationMs,
    startTime: start.toISOString(),
    stopTime: stop.toISOString(),
    durationMs,
    durationMsExact: durationMs,
    durationRuns: [
      {
        startTime: start.toISOString(),
        stopTime: stop.toISOString(),
        durationMs,
      },
    ],
  };
};

const initialLaps = [
  makeLap(0, new Date(2026, 2, 1, 20, 0, 0), new Date(2026, 2, 1, 20, 30, 0)),
  makeLap(1, new Date(2026, 2, 1, 20, 30, 0), new Date(2026, 2, 1, 21, 0, 0)),
  makeLap(2, new Date(2026, 2, 1, 21, 0, 0), new Date(2026, 2, 1, 22, 0, 0)),
];

const Harness = () => {
  const [entries, setEntries] = React.useState(initialLaps);
  return React.createElement(CategoryInputCard, {
    category,
    entries,
    dateKey: '2026-03-01',
    onChange: (entry) =>
      setEntries((current) =>
        current.map((candidate) =>
          candidate.key === entry.key ? entry : candidate,
        ),
      ),
    onAddEntry: () => {},
    onDeleteEntry: (entry) =>
      setEntries((current) =>
        current.filter((candidate) => candidate.key !== entry.key),
      ),
  });
};

describe('duration split laps', () => {
  it('summarises laps, keeps their fields editable, and deletes both together', async () => {
    const screen = await render(React.createElement(Harness));

    // Compact summary: lap 1 has no preceding time, so it shows no running total.
    expect(screen.getByText('Lap 1')).toBeTruthy();
    expect(screen.getAllByText('00:30:00')).toHaveLength(2);
    expect(screen.getByText('(01:00:00)')).toBeTruthy();
    expect(screen.getByText('(02:00:00)')).toBeTruthy();

    // Only the current lap keeps the timer buttons; it is stopped, so it offers resume.
    expect(screen.getAllByText('Resume w/ gap')).toHaveLength(1);
    expect(screen.getAllByText('Stop')).toHaveLength(1);
    // Newest lap first, oldest at the bottom.
    expect(
      screen.getAllByText(/^Lap \d$/).map((node) => node.props.children),
    ).toEqual(['Lap 2', 'Lap 1']);

    // Every time field, including the current start, offers both pickers.
    expect(
      screen.getByText('Open system time picker for Start time'),
    ).toBeTruthy();
    expect(screen.getByText('Edit date for Start time')).toBeTruthy();
    expect(screen.getByText('Lap 2 start')).toBeTruthy();
    expect(screen.getByText('Lap 2 end')).toBeTruthy();
    expect(
      screen.getByText('Open system time picker for Lap 1 start'),
    ).toBeTruthy();
    expect(screen.getByText('Edit date for Lap 1 end')).toBeTruthy();

    await fireEvent.press(screen.getAllByLabelText('Delete Lap 1')[0]);

    await waitFor(() => expect(screen.queryByText('Lap 2')).toBeNull());
    expect(screen.queryByText('Lap 2 start')).toBeNull();
    // The surviving lap re-labels to Lap 1 and the grand total drops by 30 minutes.
    expect(screen.getByText('Lap 1')).toBeTruthy();
    expect(screen.getByText('Lap 1 end')).toBeTruthy();
    expect(screen.getByText('(01:30:00)')).toBeTruthy();
  });

  it('deletes a lap from the delete button beside its end time', async () => {
    const screen = await render(React.createElement(Harness));
    const buttons = screen.getAllByLabelText('Delete Lap 2');
    // One in the summary row, one trailing the lap's end-time field.
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[1]);
    await waitFor(() => expect(screen.queryByText('Lap 2')).toBeNull());
    expect(screen.getByText('(01:30:00)')).toBeTruthy();
  });

  it('edits a lap time and updates the running totals', async () => {
    const screen = await render(React.createElement(Harness));

    // Lap 2 (rendered first) starts where lap 1 ends, so lap 1's end is the second match.
    const field = screen.getAllByDisplayValue('20:30:00')[1];
    await fireEvent.changeText(field, '20:15:00');
    await waitFor(() => expect(field.props.value).toBe('20:15:00'));
    await fireEvent(field, 'blur');

    await waitFor(() => expect(screen.getByText('(01:45:00)')).toBeTruthy());
    expect(screen.getByText('(00:45:00)')).toBeTruthy();
  });
});
