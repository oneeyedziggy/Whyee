import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { DurationInput } from '../src/components/DurationInput';
import { CarryoverTimerSection } from '../src/components/CarryoverTimerSection';
import { createDefaultCategory } from '../src/lib/category';
import { colors } from '../src/theme/tokens';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../src/types/category';

const mockPicker: { value: Date } = { value: new Date() };

jest.mock('../src/components/SystemTimeField', () => {
  const ReactLib = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    SystemTimeField: ({
      accessibilityLabel,
      disabled,
      onChange,
    }: {
      accessibilityLabel: string;
      disabled?: boolean;
      onChange: (value: Date) => void;
    }) =>
      ReactLib.createElement(
        Pressable,
        {
          accessibilityLabel,
          disabled,
          onPress: () => onChange(mockPicker.value),
        },
        ReactLib.createElement(Text, null, accessibilityLabel),
      ),
  };
});

type DurationCategory = Extract<CategoryDefinition, { kind: 'duration' }>;

const makeCategory = (): DurationCategory => {
  const category = createDefaultCategory(
    'duration',
    0,
    'Sleep',
  ) as DurationCategory;
  // The ticking interval would make elapsed-time assertions racy.
  return { ...category, duration: { ...category.duration, animate: false } };
};

const category = makeCategory();

const makeRecord = (
  start: Date,
  stop?: Date,
  extra: Partial<CategorySelectionRecord> = {},
): CategorySelectionRecord => {
  const base: CategorySelectionRecord = {
    key: `2026-03-01:0:${category.id}`,
    categoryId: category.id,
    dateKey: '2026-03-01',
    ordinal: 0,
    localTime: '20:00:00',
    value: 0,
    startTime: start.toISOString(),
    stopTime: stop?.toISOString(),
    ...extra,
  };
  if (stop && !base.durationRuns) {
    const durationMs = stop.getTime() - start.getTime();
    return {
      ...base,
      durationRuns: [
        {
          startTime: base.startTime!,
          stopTime: base.stopTime!,
          durationMs,
        },
      ],
      durationMs,
      durationMsExact: durationMs,
      value: durationMs,
    };
  }
  return base;
};

const DurationHarness = ({
  initial,
  onChange,
}: {
  initial: CategorySelectionRecord;
  onChange?: (entry: CategorySelectionRecord) => void;
}) => {
  const [record, setRecord] = React.useState(initial);
  return React.createElement(DurationInput, {
    category,
    entry: record,
    index: 0,
    dateKey: record.dateKey,
    isLast: true,
    onChange: (entry) => {
      setRecord(entry);
      onChange?.(entry);
    },
    onAddEntry: () => {},
    blocked: false,
  });
};

const CarryoverHarness = ({
  initial,
  viewedDateKey,
}: {
  initial: CategorySelectionRecord;
  viewedDateKey: string;
}) => {
  const [record, setRecord] = React.useState(initial);
  return React.createElement(CarryoverTimerSection, {
    records: [record],
    categories: [category],
    oldestRunningByCategory: new Map([[category.id, record]]),
    viewedDateKey,
    onChange: setRecord,
  });
};

const durationPattern = /^\d+:\d{2}:\d{2}$/;

// The headline total renders before any per-run rows that share the same format.
const readDuration = (screen: Awaited<ReturnType<typeof render>>): string =>
  screen.getAllByText(durationPattern)[0].props.children as string;

const toMs = (display: string): number => {
  const [hours, minutes, seconds] = display.split(':').map(Number);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
};

type Field = ReturnType<
  Awaited<ReturnType<typeof render>>['getByDisplayValue']
>;

// Back-to-back un-awaited events overlap act() scopes and blank every later render in the file.
const typeTime = async (field: Field, text: string) => {
  await fireEvent.changeText(field, text);
  await waitFor(() => expect(field.props.value).toBe(text));
  await fireEvent(field, 'blur');
};

describe('duration display responds to time edits', () => {
  const start = new Date(2026, 2, 1, 20, 0, 0);
  const stop = new Date(2026, 2, 2, 1, 0, 0);

  it.each(['Resume w/ gap', 'Resume w/o gap'])(
    '%s honors a stop-time edit when resuming and stopping again',
    async (label) => {
      const currentTime = new Date(2026, 2, 2, 4, 0, 0);
      const editedStop = new Date(2026, 2, 2, 2, 30, 0);
      const onChange = jest.fn<void, [CategorySelectionRecord]>();
      jest.useFakeTimers({ now: currentTime });
      try {
        const screen = await render(
          React.createElement(DurationHarness, {
            initial: makeRecord(start, stop),
            onChange,
          }),
        );
        await typeTime(screen.getByDisplayValue('01:00:00'), '02:30:00');
        expect(readDuration(screen)).toBe('06:30:00');

        await fireEvent.press(screen.getByText(label));
        const resumed = onChange.mock.calls[onChange.mock.calls.length - 1][0];
        expect(resumed.startTime).toBe(
          (label === 'Resume w/ gap' ? currentTime : editedStop).toISOString(),
        );
        expect(resumed.durationRuns?.[0].stopTime).toBe(editedStop.toISOString());
        expect(resumed.stopTime).toBeUndefined();
        const expectedTotal = label === 'Resume w/ gap' ? '06:30:00' : '08:00:00';
        expect(readDuration(screen)).toBe(expectedTotal);
        if (label === 'Resume w/ gap')
          expect(screen.getByText('Gap')).toBeTruthy();
        else expect(screen.queryByText('Gap')).toBeNull();

        await fireEvent.press(screen.getByText('Stop'));
        expect(readDuration(screen)).toBe(expectedTotal);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('recomputes the total when a stopped start time is typed', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, stop),
      }),
    );

    expect(readDuration(screen)).toBe('05:00:00');
    await typeTime(screen.getByDisplayValue('20:00:00'), '18:00:00');

    await waitFor(() => expect(readDuration(screen)).toBe('07:00:00'));
  });

  it('recomputes the total when a stopped start time comes from the picker', async () => {
    mockPicker.value = new Date(2026, 2, 1, 19, 30, 0);
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, stop),
      }),
    );

    expect(readDuration(screen)).toBe('05:00:00');
    await fireEvent.press(
      screen.getByLabelText('Open system time picker for Start time'),
    );

    await waitFor(() => expect(readDuration(screen)).toBe('05:30:00'));
  });

  it('recomputes the total when a stop time is typed or picked', async () => {
    mockPicker.value = new Date(2026, 2, 2, 3, 0, 0);
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, stop),
      }),
    );

    await typeTime(screen.getByDisplayValue('01:00:00'), '02:00:00');
    await waitFor(() => expect(readDuration(screen)).toBe('06:00:00'));

    await fireEvent.press(
      screen.getByLabelText('Open system time picker for Stop time'),
    );
    await waitFor(() => expect(readDuration(screen)).toBe('07:00:00'));
  });

  it('keeps earlier banked runs intact while editing the overall start', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, stop, {
          durationRuns: [
            {
              startTime: new Date(2026, 2, 1, 10, 0, 0).toISOString(),
              stopTime: new Date(2026, 2, 1, 11, 0, 0).toISOString(),
              durationMs: 3600000,
            },
            {
              startTime: start.toISOString(),
              stopTime: stop.toISOString(),
              durationMs: 18000000,
            },
          ],
        }),
      }),
    );

    expect(readDuration(screen)).toBe('06:00:00');
    // The field shows the first run's start, not the resumed lap's.
    await typeTime(screen.getByDisplayValue('10:00:00'), '09:00:00');

    await waitFor(() => expect(readDuration(screen)).toBe('07:00:00'));
  });

  it('extends a running total when its start time is typed earlier', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start),
      }),
    );

    const before = toMs(readDuration(screen));
    await typeTime(screen.getAllByDisplayValue('20:00:00')[0], '19:00:00');

    await waitFor(() =>
      expect(toMs(readDuration(screen)) - before).toBe(3600000),
    );
  });

  it('rolls a typed 06:00 stop after a 19:00 start to the next day', async () => {
    const eveningStart = new Date(2026, 2, 1, 19, 0, 0);
    const sameDayStop = new Date(2026, 2, 1, 20, 0, 0);
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(eveningStart, sameDayStop),
      }),
    );

    await typeTime(screen.getByDisplayValue('20:00:00'), '06:00:00');

    await waitFor(() => expect(readDuration(screen)).toBe('11:00:00'));
  });
});

describe('carryover duration display responds to time edits', () => {
  const start = new Date(2026, 2, 1, 20, 0, 0);
  const stop = new Date(2026, 2, 2, 1, 0, 0);

  it('recomputes a stopped carryover total for typed and picked start times', async () => {
    mockPicker.value = new Date(2026, 2, 1, 17, 0, 0);
    const screen = await render(
      React.createElement(CarryoverHarness, {
        initial: makeRecord(start, stop),
        viewedDateKey: '2026-03-02',
      }),
    );

    expect(readDuration(screen)).toBe('05:00:00');
    await typeTime(screen.getByDisplayValue('20:00:00'), '18:00:00');
    await waitFor(() => expect(readDuration(screen)).toBe('07:00:00'));

    await fireEvent.press(
      screen.getByLabelText('Open system time picker for Start time'),
    );
    await waitFor(() => expect(readDuration(screen)).toBe('08:00:00'));
  });

  it('recomputes a stopped carryover total when the stop time is picked', async () => {
    mockPicker.value = new Date(2026, 2, 2, 2, 30, 0);
    const screen = await render(
      React.createElement(CarryoverHarness, {
        initial: makeRecord(start, stop),
        viewedDateKey: '2026-03-02',
      }),
    );

    await fireEvent.press(
      screen.getByLabelText('Open system time picker for Stop time'),
    );

    await waitFor(() => expect(readDuration(screen)).toBe('06:30:00'));
  });

  it('extends a running carryover total when its start time is picked earlier', async () => {
    mockPicker.value = new Date(2026, 2, 1, 19, 0, 0);
    const screen = await render(
      React.createElement(CarryoverHarness, {
        initial: makeRecord(start),
        viewedDateKey: '2026-03-02',
      }),
    );

    const before = toMs(readDuration(screen));
    await fireEvent.press(
      screen.getByLabelText('Open system time picker for Start time'),
    );

    await waitFor(() =>
      expect(toMs(readDuration(screen)) - before).toBe(3600000),
    );
  });
});

describe('duration time entry', () => {
  const start = new Date(2026, 2, 1, 20, 0, 0);
  const stop = new Date(2026, 2, 2, 1, 0, 0);

  it('keeps the original start time visible after stopping and restarting', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, new Date(2026, 2, 1, 21, 0, 0)),
      }),
    );

    expect(screen.getByDisplayValue('20:00:00')).toBeTruthy();
    await fireEvent.press(screen.getByText('Resume w/ gap'));

    await waitFor(() =>
      expect(
        screen.getByText('Stop').parent?.props.accessibilityState?.disabled,
      ).toBe(false),
    );
    expect(screen.getByDisplayValue('20:00:00')).toBeTruthy();
  });

  it('accepts partial input without committing until blur', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, stop),
      }),
    );

    const field = screen.getByDisplayValue('20:00:00');
    await fireEvent.changeText(field, '9');

    await waitFor(() => expect(field.props.value).toBe('9'));
    expect(readDuration(screen)).toBe('05:00:00');
    expect(StyleSheet.flatten(field.props.style).borderColor).not.toBe(
      colors.danger,
    );

    await fireEvent(field, 'blur');
    await waitFor(() => expect(readDuration(screen)).toBe('16:00:00'));
  });

  it('flags an out-of-range value without touching the stored duration', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, stop),
      }),
    );

    const field = screen.getByDisplayValue('20:00:00');
    await typeTime(field, '19:99');

    await waitFor(() =>
      expect(StyleSheet.flatten(field.props.style).borderColor).toBe(
        colors.danger,
      ),
    );
    expect(field.props.value).toBe('19:99');
    expect(readDuration(screen)).toBe('05:00:00');

    await typeTime(field, '19:30');
    await waitFor(() => expect(readDuration(screen)).toBe('05:30:00'));
    expect(StyleSheet.flatten(field.props.style).borderColor).not.toBe(
      colors.danger,
    );
  });

  it('resumes without a gap by reopening the last run', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, new Date(2026, 2, 1, 21, 0, 0)),
      }),
    );

    await fireEvent.press(screen.getByText('Resume w/o gap'));

    // The run reopens from 20:00 on a past date, so elapsed now far exceeds the banked hour.
    await waitFor(() =>
      expect(toMs(readDuration(screen))).toBeGreaterThan(3600000),
    );
    expect(screen.queryByText('Resume w/o gap')).toBeNull();
  });

  it('lists runs and gaps newest first for a non-split timer', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, new Date(2026, 2, 1, 23, 0, 0), {
          durationRuns: [
            {
              startTime: start.toISOString(),
              stopTime: new Date(2026, 2, 1, 21, 0, 0).toISOString(),
              durationMs: 3600000,
            },
            {
              startTime: new Date(2026, 2, 1, 22, 0, 0).toISOString(),
              stopTime: new Date(2026, 2, 1, 23, 0, 0).toISOString(),
              durationMs: 3600000,
            },
          ],
        }),
      }),
    );

    const labels = screen
      .getAllByText(/^(Run \d|Gap)/)
      .map((node) => [node.props.children].flat().join(''));
    expect(labels[0]).toMatch(/^Run 2/);
    expect(labels[1]).toBe('Gap');
    expect(labels[2]).toMatch(/^Run 1/);
  });

  it('keeps a manually picked stop date instead of rolling over a day', async () => {
    const screen = await render(
      React.createElement(DurationHarness, {
        initial: makeRecord(start, new Date(2026, 2, 1, 22, 0, 0)),
      }),
    );

    mockPicker.value = new Date(2026, 2, 1, 0, 0, 0);
    await fireEvent.press(screen.getByLabelText('Edit date for Stop time'));

    // Without the pin, 19:00 would roll over to the next day (23h); pinned, it is rejected.
    const field = screen.getByDisplayValue('22:00:00');
    await typeTime(field, '19:00:00');
    await waitFor(() =>
      expect(StyleSheet.flatten(field.props.style).borderColor).toBe(
        colors.danger,
      ),
    );
    expect(readDuration(screen)).toBe('02:00:00');
  });
});

describe('DurationInput controls and guards', () => {
  const renderInput = (
    props: Partial<React.ComponentProps<typeof DurationInput>> = {},
    duration: Partial<DurationCategory['duration']> = {},
  ) => {
    const handlers = { onChange: jest.fn(), onAddEntry: jest.fn() };
    return render(
      React.createElement(DurationInput, {
        category: { ...category, duration: { ...category.duration, ...duration } },
        entry: null,
        index: 0,
        dateKey: '2026-03-01',
        isLast: true,
        blocked: false,
        ...handlers,
        ...props,
      }),
    ).then((screen) => ({ screen, ...handlers }));
  };

  afterEach(() => jest.useRealTimers());

  it('pins a fresh start to the viewed date but restarts banked time from now', async () => {
    const now = new Date(2026, 2, 5, 10, 0, 0);
    jest.useFakeTimers({ now });
    const fresh = await renderInput();
    await fireEvent.press(fresh.screen.getByText('Start'));
    const started = fresh.onChange.mock.calls[0][0];
    expect(started.startTime).toBe(new Date(2026, 2, 1, 10, 0, 0).toISOString());
    expect(started.localTime).toBe('10:00:00');

    const banked = await renderInput({
      entry: {
        ...makeRecord(new Date(2026, 2, 1, 8), new Date(2026, 2, 1, 9)),
        startTime: undefined,
        stopTime: undefined,
        localTime: '08:00:00',
      },
    });
    await fireEvent.press(banked.screen.getByText('Start'));
    const restarted = banked.onChange.mock.calls[0][0];
    expect(restarted.startTime).toBe(now.toISOString());
    expect(restarted.localTime).toBe('08:00:00');
  });

  it.each([
    [false, 1000, '00:00:01'],
    [true, 37, '00:00:00.037'],
  ])('ticks a running animated timer (ms=%s) every %ims', async (showMilliseconds, step, shown) => {
    const now = new Date(2026, 2, 1, 10, 0, 0);
    jest.useFakeTimers({ now });
    const { screen } = await renderInput(
      { entry: makeRecord(now) },
      { animate: true, showMilliseconds },
    );
    await act(async () => jest.advanceTimersByTime(step - 1));
    expect(screen.queryByText(shown)).toBeNull();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.getByText(shown)).toBeTruthy();
  });

  it('cannot stop a timer whose start was set in the future', async () => {
    const { screen, onChange } = await renderInput({
      entry: makeRecord(new Date(Date.now() + 3600000)),
    });
    await fireEvent.press(screen.getByText('Stop'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains why a record with a stop before its start cannot resume', async () => {
    const { screen, onChange } = await renderInput({
      entry: makeRecord(new Date(2026, 2, 1, 23), new Date(2026, 2, 1, 22)),
    });
    await fireEvent.press(screen.getByText('Resume w/ gap'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Cannot resume: check the start and stop times.')).toBeTruthy();
  });

  it('rejects a stop edit that the record stamps cannot accept', async () => {
    // The run says 20:00 but the record stamp says 23:00, so 22:00 passes the field bounds only.
    const { screen, onChange } = await renderInput({
      entry: makeRecord(new Date(2026, 2, 1, 23), new Date(2026, 2, 1, 23, 30), {
        durationRuns: [
          {
            startTime: new Date(2026, 2, 1, 20).toISOString(),
            stopTime: new Date(2026, 2, 1, 23, 30).toISOString(),
            durationMs: 12600000,
          },
        ],
      }),
    });
    await typeTime(screen.getByDisplayValue('23:30:00'), '22:00:00');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Stop time cannot be earlier than the start time.')).toBeTruthy();
  });

  it('ignores Reset when there is nothing recorded yet', async () => {
    const { screen, onChange } = await renderInput({}, { resetEnabled: true });
    await fireEvent.press(screen.getByText('Reset'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('splits a running timer into a new lap and disables Split while blocked', async () => {
    const running = makeRecord(new Date(Date.now() - 60000));
    const { screen, onChange, onAddEntry } = await renderInput(
      { entry: running },
      { splitEnabled: true },
    );
    await fireEvent.press(screen.getByText('Split'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ key: running.key, stopTime: expect.any(String) }),
    );
    expect(onAddEntry).toHaveBeenCalledWith({
      startTime: expect.any(String),
      localTime: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
    });

    const blocked = await renderInput(
      { entry: running, blocked: true },
      { splitEnabled: true },
    );
    expect(
      blocked.screen.getByText('Split').parent?.props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it('edits read-only laps through their pickers without offering deletion', async () => {
    const lap = makeRecord(new Date(2026, 2, 1, 20), new Date(2026, 2, 1, 21));
    const { screen, onChange } = await renderInput(
      {
        entry: makeRecord(new Date(2026, 2, 1, 21), undefined, {
          key: `2026-03-01:1:${category.id}`,
          ordinal: 1,
        }),
        laps: [lap],
      },
      { splitEnabled: true },
    );
    expect(screen.queryByLabelText('Delete Lap 1')).toBeNull();

    mockPicker.value = new Date(2026, 2, 1, 19, 30);
    await fireEvent.press(screen.getByLabelText('Open system time picker for Lap 1 start'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        key: lap.key,
        startTime: mockPicker.value.toISOString(),
      }),
    );

    mockPicker.value = new Date(2026, 2, 2, 0, 0);
    await fireEvent.press(screen.getByLabelText('Edit date for Lap 1 end'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        key: lap.key,
        stopTime: new Date(2026, 2, 2, 21).toISOString(),
        stopDateManual: true,
      }),
    );
  });
});
