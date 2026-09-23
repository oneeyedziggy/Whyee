import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CarryoverTimerSection } from '../src/components/CarryoverTimerSection';
import { createDefaultCategory } from '../src/lib/category';
import { getLocalDateKey } from '../src/lib/dates';
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

const category = createDefaultCategory('duration', 0, 'Sleep');

const makeRecord = (
  key: string,
  start: Date,
  stop?: Date,
): CategorySelectionRecord => ({
  key,
  categoryId: category.id,
  dateKey: '2026-03-01',
  ordinal: Number(key.split(':')[1]),
  localTime: '23:00:00',
  value: 0,
  startTime: start.toISOString(),
  stopTime: stop?.toISOString(),
});

describe('CarryoverTimerSection', () => {
  it('collapses and stops the active carryover without navigation', async () => {
    const running = makeRecord(
      `2026-03-01:0:${category.id}`,
      new Date(Date.now() - 3600000),
    );
    const onChange = jest.fn();
    const screen = await render(
      React.createElement(CarryoverTimerSection, {
        records: [running],
        categories: [category],
        oldestRunningByCategory: new Map([[category.id, running]]),
        viewedDateKey: '2026-03-02',
        onChange,
      }),
    );

    fireEvent.press(screen.getByText('Carried-over timers (1)'));
    await waitFor(() => expect(screen.queryByText('Stop')).toBeNull());
    fireEvent.press(screen.getByText('Carried-over timers (1)'));
    await waitFor(() => expect(screen.getByText('Stop')).toBeTruthy());
    fireEvent.press(screen.getByText('Stop'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        key: running.key,
        dateKey: running.dateKey,
        stopTime: expect.any(String),
        durationRuns: expect.any(Array),
      }),
    );
  });

  it('allows only the oldest running carryover to stop', async () => {
    const older = makeRecord(
      `2026-03-01:0:${category.id}`,
      new Date(Date.now() - 7200000),
    );
    const newer = makeRecord(
      `2026-03-01:1:${category.id}`,
      new Date(Date.now() - 3600000),
    );
    const screen = await render(
      React.createElement(CarryoverTimerSection, {
        records: [older, newer],
        categories: [category],
        oldestRunningByCategory: new Map([[category.id, older]]),
        viewedDateKey: '2026-03-02',
        onChange: jest.fn(),
      }),
    );
    const stopButtons = screen.getAllByText('Stop');

    expect(
      stopButtons[0].parent?.props.accessibilityState?.disabled,
    ).toBeFalsy();
    expect(stopButtons[1].parent?.props.accessibilityState?.disabled).toBe(
      true,
    );
    expect(screen.getByText('Stop the older Sleep timer first.')).toBeTruthy();
  });

  it('shows a negative started offset and lets the running start time be corrected', async () => {
    // Viewed from "yesterday", a timer started two real days ago is still running "today":
    // started -1 day, still running +1 day — matches the spec's worked example exactly.
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);
    twoDaysAgo.setHours(20, 0, 0, 0);
    const viewedDateKey = getLocalDateKey(yesterday);
    const running = makeRecord(`2026-03-01:0:${category.id}`, twoDaysAgo);
    const onChange = jest.fn();
    const screen = await render(
      React.createElement(CarryoverTimerSection, {
        records: [running],
        categories: [category],
        oldestRunningByCategory: new Map([[category.id, running]]),
        viewedDateKey,
        onChange,
      }),
    );

    expect(screen.getByText(/Started -1 day/)).toBeTruthy();
    expect(screen.getByText(/Still running \+1 day/)).toBeTruthy();

    const startField = screen.getByDisplayValue('20:00:00');
    fireEvent.changeText(startField, '19:30:00');
    await waitFor(() => expect(startField.props.value).toBe('19:30:00'));
    fireEvent(startField, 'blur');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ key: running.key, stopTime: undefined }),
    );
    const [edited] = onChange.mock.calls[onChange.mock.calls.length - 1];
    const editedStart = new Date(edited.startTime);
    expect(editedStart.getHours()).toBe(19);
    expect(editedStart.getMinutes()).toBe(30);
  });

  it('omits the end offset line when viewing the stop date itself', async () => {
    const stopped = makeRecord(
      `2026-03-01:0:${category.id}`,
      new Date(2026, 2, 1, 20, 0, 0),
      new Date(2026, 2, 2, 1, 0, 0),
    );
    const screen = await render(
      React.createElement(CarryoverTimerSection, {
        records: [stopped],
        categories: [category],
        oldestRunningByCategory: new Map(),
        viewedDateKey: '2026-03-02',
        onChange: jest.fn(),
      }),
    );

    expect(screen.getByText(/Started -1 day/)).toBeTruthy();
    expect(screen.queryByText(/Stopped/)).toBeNull();
  });
});
