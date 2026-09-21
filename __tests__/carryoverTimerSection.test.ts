import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CarryoverTimerSection } from '../src/components/CarryoverTimerSection';
import { createDefaultCategory } from '../src/lib/category';
import type { CategorySelectionRecord } from '../src/types/category';

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
        onChange,
      }),
    );

    fireEvent.press(screen.getByText('Carried-over timers (1)'));
    await waitFor(() =>
      expect(screen.queryByLabelText('Stop Sleep timer')).toBeNull(),
    );
    fireEvent.press(screen.getByText('Carried-over timers (1)'));
    await waitFor(() =>
      expect(screen.getByLabelText('Stop Sleep timer')).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText('Stop Sleep timer'));

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
        onChange: jest.fn(),
      }),
    );
    const stopButtons = screen.getAllByText('Stop');

    expect(stopButtons[0].parent?.props.accessibilityState?.disabled).toBeFalsy();
    expect(stopButtons[1].parent?.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Stop the older Sleep timer first.')).toBeTruthy();
  });
});
