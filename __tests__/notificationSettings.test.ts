import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotificationSettings } from '../src/components/NotificationSettings';
import { createDefaultCategory } from '../src/lib/category';
import { notificationService } from '../src/lib/notificationService';
import type {
  CategoryDefinition,
  NotificationSchedule,
} from '../src/types/category';

// Platform pickers are covered by the SystemTimeField suites; this stand-in reports a fixed pick.
jest.mock('../src/components/SystemTimeField', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SystemTimeField: (props: {
      accessibilityLabel: string;
      is24Hour?: boolean;
      onChange: (value: Date) => void;
    }) =>
      createElement(Pressable, {
        accessibilityLabel: props.accessibilityLabel,
        accessibilityHint: props.is24Hour ? '24-hour' : '12-hour',
        onPress: () => props.onChange(new Date(2020, 0, 1, 6, 45)),
      }),
  };
});

jest.mock('lucide-react-native', () => ({
  X: () => null,
  Calendar: () => null,
  CalendarClock: () => null,
  Clock: () => null,
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock('../src/lib/notificationService', () => ({
  notificationService: {
    checkAvailability: jest.fn(),
    requestPermission: jest.fn(),
    scheduleCategory: jest.fn(),
    cancelCategory: jest.fn(),
    addResponseListener: jest.fn(() => ({ remove: jest.fn() })),
    getLastResponse: jest.fn(),
  },
}));

const enableAndSave = async (
  category: ReturnType<typeof createDefaultCategory>,
  onUpdate: jest.Mock,
) => {
  const screen = await render(
    React.createElement(
      SafeAreaProvider,
      {
        initialMetrics: {
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        },
      },
      React.createElement(NotificationSettings, {
        category,
        visible: true,
        onClose: jest.fn(),
        onUpdate,
      }),
    ),
  );
  await fireEvent(
    screen.getByLabelText(`Notifications for ${category.name}`),
    'valueChange',
    true,
  );
  // Android's native Button upper-cases its title ("SAVE").
  await waitFor(() => screen.getByText(/^save$/i));
  await fireEvent.press(screen.getByText(/^save$/i));
  return screen;
};

describe('NotificationSettings', () => {
  it('migrates a legacy schedule-level weekdays array instead of crashing', async () => {
    const category = createDefaultCategory('duration', 0, 'Sleep');
    // Legacy on-disk shape: shared `weekdays` on the schedule, none per-time.
    (category as { notificationSchedule?: unknown }).notificationSchedule = {
      enabled: true,
      weekdays: [2, 4],
      times: [{ id: 'legacy-time', hour: 9, minute: 0 }],
    };

    const screen = await render(
      React.createElement(
        SafeAreaProvider,
        {
          initialMetrics: {
            frame: { x: 0, y: 0, width: 320, height: 640 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          },
        },
        React.createElement(NotificationSettings, {
          category,
          visible: true,
          onClose: jest.fn(),
          onUpdate: jest.fn(),
        }),
      ),
    );

    expect(screen.getByLabelText('Mon, selected')).toBeTruthy();
    expect(screen.getByLabelText('Wed, selected')).toBeTruthy();
    expect(screen.getByLabelText('Sun, not selected')).toBeTruthy();
  });

  afterEach(() => jest.clearAllMocks());

  it('offers Open Settings when permission is denied, and opens it on press', async () => {
    (notificationService.checkAvailability as jest.Mock).mockResolvedValue(
      true,
    );
    (notificationService.requestPermission as jest.Mock).mockResolvedValue(
      false,
    );
    const alertSpy = jest.spyOn(Alert, 'alert');
    const openSettingsSpy = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue();
    const onUpdate = jest.fn();
    const category = createDefaultCategory('number', 0, 'Energy');

    await enableAndSave(category, onUpdate);
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    expect(onUpdate).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === 'Open Settings')?.onPress?.();
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
  });

  it('saves the schedule but warns when this build cannot schedule notifications', async () => {
    (notificationService.checkAvailability as jest.Mock).mockResolvedValue(
      false,
    );
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onUpdate = jest.fn();
    const category = createDefaultCategory('number', 0, 'Energy');

    await enableAndSave(category, onUpdate);
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());

    expect(notificationService.requestPermission).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Reminders saved but inactive',
      expect.any(String),
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationSchedule: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it('does not persist the schedule when scheduling actually fails', async () => {
    (notificationService.checkAvailability as jest.Mock).mockResolvedValue(
      true,
    );
    (notificationService.requestPermission as jest.Mock).mockResolvedValue(
      true,
    );
    (notificationService.scheduleCategory as jest.Mock).mockRejectedValue(
      new Error('native failure'),
    );
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onUpdate = jest.fn();
    const category = createDefaultCategory('number', 0, 'Energy');

    await enableAndSave(category, onUpdate);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't schedule reminders",
        'native failure',
      ),
    );

    expect(onUpdate).not.toHaveBeenCalled();
  });
});

const renderSettings = (
  category: CategoryDefinition,
  props: { onClose?: jest.Mock; onUpdate?: jest.Mock } = {},
) => {
  const onClose = props.onClose ?? jest.fn();
  const onUpdate = props.onUpdate ?? jest.fn();
  return render(
    React.createElement(
      SafeAreaProvider,
      {
        initialMetrics: {
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        },
      },
      React.createElement(NotificationSettings, {
        category,
        visible: true,
        onClose,
        onUpdate,
      }),
    ),
  ).then((screen) => ({ screen, onClose, onUpdate }));
};

const button = (
  screen: Awaited<ReturnType<typeof renderSettings>>['screen'],
  title: string,
) => screen.getAllByRole('button', { name: new RegExp(`^${title}$`, 'i') });

const withSchedule = (
  category: CategoryDefinition,
  schedule: NotificationSchedule,
  overrides: Partial<CategoryDefinition> = {},
) =>
  ({ ...category, notificationSchedule: schedule, ...overrides }) as CategoryDefinition;

const everyDay = [1, 2, 3, 4, 5, 6, 7];

describe('NotificationSettings editing and validation', () => {
  const alert = () => jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  beforeEach(() =>
    Object.values(notificationService).forEach((fn) =>
      (fn as jest.Mock).mockReset(),
    ),
  );
  afterEach(() => jest.restoreAllMocks());

  it('keeps a stored enabled flag when the stored schedule has no times', async () => {
    const category = withSchedule(createDefaultCategory('number', 0, 'Mood'), {
      enabled: true,
      times: [],
    });
    const { screen } = await renderSettings(category);
    expect(
      screen.getByLabelText('Notifications for Mood').props.accessibilityState.checked,
    ).toBe(true);
    expect(screen.getByLabelText('Reminder time 09:00')).toBeTruthy();
  });

  it('accepts typed HH:MM times and ignores invalid or out-of-range text', async () => {
    const { screen } = await renderSettings(createDefaultCategory('number', 0, 'Mood'));
    const endEditing = async (text: string) =>
      fireEvent(screen.getByLabelText(/^Reminder time /), 'endEditing', {
        nativeEvent: { text },
      });
    await endEditing(' 7:05 ');
    expect(screen.getByLabelText('Reminder time 07:05')).toBeTruthy();
    for (const text of ['abc', '24:00', '12:60', '1:5', '123:00']) await endEditing(text);
    expect(screen.getByLabelText('Reminder time 07:05')).toBeTruthy();
    await endEditing('23:59');
    expect(screen.getByLabelText('Reminder time 23:59')).toBeTruthy();
  });

  it('applies times picked from the system picker using the category clock format', async () => {
    const duration = createDefaultCategory('duration', 0, 'Nap');
    if (duration.kind !== 'duration') throw new Error('expected duration');
    const { screen } = await renderSettings({
      ...duration,
      duration: { ...duration.duration, use24HourClock: false },
    });
    const picker = screen.getByLabelText('Open system picker for reminder time 09:00');
    expect(picker.props.accessibilityHint).toBe('12-hour');
    await fireEvent.press(picker);
    expect(screen.getByLabelText('Reminder time 06:45')).toBeTruthy();
  });

  it('toggles weekdays off and back on in order', async () => {
    const { screen } = await renderSettings(createDefaultCategory('number', 0, 'Mood'));
    await fireEvent.press(screen.getByLabelText('Wed, selected'));
    expect(screen.getByLabelText('Wed, not selected')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Wed, not selected'));
    expect(screen.getByLabelText('Wed, selected')).toBeTruthy();
  });

  it('blocks enabling reminders for a disabled category', async () => {
    const spy = alert();
    const { screen, onUpdate } = await renderSettings({
      ...createDefaultCategory('number', 0, 'Mood'),
      enabled: false,
    });
    await fireEvent.press(screen.getByLabelText('Notifications for Mood'));
    await fireEvent.press(button(screen, 'save')[0]);
    expect(spy).toHaveBeenCalledWith('Category is disabled', expect.any(String));
    expect(notificationService.cancelCategory).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('requires at least one weekday per time', async () => {
    const spy = alert();
    const { screen, onUpdate } = await renderSettings(
      withSchedule(createDefaultCategory('number', 0, 'Mood'), {
        enabled: true,
        times: [{ id: 't', hour: 8, minute: 0, weekdays: [3] }],
      }),
    );
    await fireEvent.press(screen.getByLabelText('Tue, selected'));
    await fireEvent.press(button(screen, 'save')[0]);
    expect(spy).toHaveBeenCalledWith(
      'Choose a schedule',
      'Select at least one day and one time.',
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('rejects several reminders when multiple entries per day are off', async () => {
    const spy = alert();
    const { screen, onUpdate } = await renderSettings(
      withSchedule(createDefaultCategory('number', 0, 'Mood'), {
        enabled: false,
        times: [
          { id: 'a', hour: 8, minute: 0, weekdays: everyDay },
          { id: 'b', hour: 20, minute: 0, weekdays: everyDay },
        ],
      }),
    );
    expect(
      button(screen, 'add time')[0].props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByText('Enable multiple per day to add more than one reminder.'),
    ).toBeTruthy();
    // Weekday toggles and time edits only affect their own time.
    await fireEvent.press(screen.getAllByLabelText('Mon, selected')[0]);
    expect(screen.getAllByLabelText('Mon, selected')).toHaveLength(1);
    await fireEvent(screen.getByLabelText('Reminder time 20:00'), 'endEditing', {
      nativeEvent: { text: '21:30' },
    });
    expect(screen.getByLabelText('Reminder time 08:00')).toBeTruthy();
    expect(screen.getByLabelText('Reminder time 21:30')).toBeTruthy();
    await fireEvent.press(button(screen, 'save')[0]);
    expect(spy).toHaveBeenCalledWith(
      'Multiple entries are disabled',
      expect.any(String),
    );
    // Removing the extra time makes the schedule valid again.
    await fireEvent.press(button(screen, 'remove')[1]);
    expect(screen.queryByLabelText('Reminder time 21:30')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^remove$/i })).toHaveLength(0);
    await fireEvent.press(button(screen, 'save')[0]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  it('rejects schedules that expand to more than 64 notifications', async () => {
    const spy = alert();
    // Every-day times collapse to one daily request, so use six weekdays: 11 x 6 = 66.
    const times = Array.from({ length: 11 }, (_, index) => ({
      id: `t${index}`,
      hour: index,
      minute: 0,
      weekdays: [2, 3, 4, 5, 6, 7],
    }));
    const { screen, onUpdate } = await renderSettings(
      withSchedule(
        createDefaultCategory('number', 0, 'Mood'),
        { enabled: true, times },
        { allowMultiplePerDay: true },
      ),
    );
    await fireEvent.press(button(screen, 'save')[0]);
    expect(spy).toHaveBeenCalledWith(
      'Schedule is too large',
      'Reduce the number of days or times.',
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('adds times copying the first weekdays, or every day when it has none', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2);
    const { screen } = await renderSettings({
      ...createDefaultCategory('number', 0, 'Mood'),
      allowMultiplePerDay: true,
    });
    expect(screen.queryByText(/Enable multiple per day/)).toBeNull();
    await fireEvent.press(screen.getAllByLabelText('Mon, selected')[0]);
    await fireEvent.press(button(screen, 'add time')[0]);
    expect(screen.getAllByLabelText('Mon, not selected')).toHaveLength(2);

    for (const day of ['Sun', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
      await fireEvent.press(screen.getAllByLabelText(`${day}, selected`)[0]);
    await fireEvent.press(button(screen, 'add time')[0]);
    expect(screen.getAllByLabelText('Mon, selected')).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Reminder time 12:00$/)).toHaveLength(2);
  });

  it('cancels existing reminders without scheduling when saved disabled', async () => {
    const { screen, onUpdate } = await renderSettings(
      withSchedule(createDefaultCategory('number', 0, 'Mood'), {
        enabled: true,
        times: [{ id: 't', hour: 8, minute: 0, weekdays: everyDay }],
      }),
    );
    await fireEvent.press(screen.getByLabelText('Notifications for Mood'));
    await fireEvent.press(button(screen, 'save')[0]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(notificationService.checkAvailability).not.toHaveBeenCalled();
    expect(notificationService.cancelCategory).toHaveBeenCalledWith(expect.any(String));
    expect(notificationService.scheduleCategory).not.toHaveBeenCalled();
    expect(onUpdate.mock.calls[0][0].notificationSchedule.enabled).toBe(false);
  });

  it('shows saving progress, then schedules and saves enabled reminders', async () => {
    let resolveCancel = () => {};
    (notificationService.checkAvailability as jest.Mock).mockResolvedValue(true);
    (notificationService.requestPermission as jest.Mock).mockResolvedValue(true);
    (notificationService.cancelCategory as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCancel = resolve;
      }),
    );
    (notificationService.scheduleCategory as jest.Mock).mockResolvedValue(undefined);
    const category = createDefaultCategory('number', 0, 'Mood');
    const { screen, onUpdate } = await renderSettings(category);
    await fireEvent.press(screen.getByLabelText('Notifications for Mood'));
    // fireEvent resolves only once the async save handler settles, so keep it pending here.
    const pressed = fireEvent.press(button(screen, 'save')[0]);
    const saving = await waitFor(() => button(screen, 'saving\\.\\.\\.')[0]);
    expect(saving.props.accessibilityState.disabled).toBe(true);
    await act(async () => resolveCancel());
    await pressed;
    expect(onUpdate).toHaveBeenCalled();
    expect(notificationService.scheduleCategory).toHaveBeenCalledWith(
      category,
      expect.arrayContaining([expect.objectContaining({ hour: 9, minute: 0 })]),
    );
    expect(button(screen, 'save')).toHaveLength(1);
  });

  it('falls back to a generic message for non-Error scheduling failures', async () => {
    const spy = alert();
    (notificationService.checkAvailability as jest.Mock).mockResolvedValue(true);
    (notificationService.requestPermission as jest.Mock).mockResolvedValue(true);
    (notificationService.scheduleCategory as jest.Mock).mockRejectedValue('nope');
    const { screen, onUpdate } = await renderSettings(
      createDefaultCategory('number', 0, 'Mood'),
    );
    await fireEvent.press(screen.getByLabelText('Notifications for Mood'));
    await fireEvent.press(button(screen, 'save')[0]);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("Couldn't schedule reminders", 'Please try again.'),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('closes from the close icon and Cancel without saving', async () => {
    const { screen, onClose, onUpdate } = await renderSettings(
      createDefaultCategory('number', 0, 'Mood'),
    );
    await fireEvent.press(screen.getByLabelText('Close set notification dialog'));
    await fireEvent.press(button(screen, 'cancel')[0]);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
