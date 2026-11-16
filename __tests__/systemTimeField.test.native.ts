import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  SystemTimeField,
  type SystemTimeFieldProps,
} from '../src/components/SystemTimeField.native';

const mockIconProps: Array<{ name: string; color: string; size: number }> = [];
jest.mock('lucide-react-native', () => {
  const icon = (name: string) => (props: { color: string; size: number }) => {
    mockIconProps.push({ name, ...props });
    return null;
  };
  return { Calendar: icon('Calendar'), Clock: icon('Clock') };
});
jest.mock('@react-native-community/datetimepicker', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      ReactActual.createElement(View, { testID: 'picker', ...props }),
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const { colors } = jest.requireActual('../src/theme/tokens') as {
  colors: { muted: string; primary: string };
};
const openAndroid = DateTimePickerAndroid.open as jest.Mock;
type AndroidOpenArgs = {
  value: Date;
  mode: string;
  is24Hour?: boolean;
  onValueChange: (event: unknown, date?: Date) => void;
};
const androidCall = (index: number) => openAndroid.mock.calls[index][0] as AndroidOpenArgs;

const value = new Date(2024, 0, 15, 7, 5, 9);
let platform: jest.ReplaceProperty<typeof Platform.OS> | undefined;

// The first iOS Modal render loads slowly when the suite runs alongside other projects.
jest.setTimeout(20000);

const renderField = async (
  os: 'ios' | 'android',
  props: Partial<SystemTimeFieldProps> = {},
) => {
  platform = jest.replaceProperty(Platform, 'OS', os);
  const onChange = jest.fn();
  await render(
    React.createElement(SystemTimeField, {
      mode: 'time',
      value,
      onChange,
      accessibilityLabel: 'Pick time',
      ...props,
    }),
  );
  return { onChange, button: screen.getByLabelText('Pick time') };
};

beforeEach(() => {
  mockIconProps.length = 0;
  openAndroid.mockClear();
});

afterEach(() => {
  platform?.restore();
  platform = undefined;
});

describe('SystemTimeField (native) icon button', () => {
  it('shows a clock for time and a compact calendar for date', async () => {
    await renderField('ios');
    expect(mockIconProps.at(-1)).toEqual({ name: 'Clock', color: colors.primary, size: 18 });
    await renderField('ios', { mode: 'date', compact: true });
    expect(mockIconProps.at(-1)).toEqual({ name: 'Calendar', color: colors.primary, size: 14 });
  });

  it('does nothing when disabled', async () => {
    const { button } = await renderField('android', { disabled: true });
    expect(mockIconProps.at(-1)?.color).toBe(colors.muted);
    await fireEvent.press(button);
    expect(openAndroid).not.toHaveBeenCalled();
    platform?.restore();
    const ios = await renderField('ios', { disabled: true });
    await fireEvent.press(ios.button);
    expect(screen.queryByTestId('picker')).toBeNull();
  });
});

describe('SystemTimeField (native) on Android', () => {
  it('opens a 24h time dialog by default and applies the picked time', async () => {
    const { button, onChange } = await renderField('android');
    await fireEvent.press(button);
    expect(openAndroid).toHaveBeenCalledTimes(1);
    const args = androidCall(0);
    expect(args).toEqual(expect.objectContaining({ value, mode: 'time', is24Hour: true }));
    args.onValueChange({}, undefined);
    expect(onChange).not.toHaveBeenCalled();
    const next = new Date(2024, 0, 15, 9, 0);
    args.onValueChange({}, next);
    expect(onChange).toHaveBeenCalledWith(next);
    expect(screen.queryByTestId('picker')).toBeNull();
  });

  it('opens only a date dialog in date mode', async () => {
    const { button, onChange } = await renderField('android', { mode: 'date' });
    await fireEvent.press(button);
    const args = androidCall(0);
    expect(args.mode).toBe('date');
    args.onValueChange({}, undefined);
    expect(onChange).not.toHaveBeenCalled();
    const picked = new Date(2024, 1, 2);
    args.onValueChange({}, picked);
    expect(onChange).toHaveBeenCalledWith(picked);
    expect(openAndroid).toHaveBeenCalledTimes(1);
  });

  it('chains a date dialog into a 12h time dialog in datetime mode', async () => {
    const { button, onChange } = await renderField('android', {
      mode: 'datetime',
      is24Hour: false,
    });
    await fireEvent.press(button);
    const dateOnly = new Date(2024, 1, 2);
    androidCall(0).onValueChange({}, dateOnly);
    expect(onChange).not.toHaveBeenCalled();
    const timeArgs = androidCall(1);
    expect(timeArgs).toEqual(
      expect.objectContaining({ value: dateOnly, mode: 'time', is24Hour: false }),
    );
    timeArgs.onValueChange({}, undefined);
    expect(onChange).not.toHaveBeenCalled();
    const final = new Date(2024, 1, 2, 18, 30);
    timeArgs.onValueChange({}, final);
    expect(onChange).toHaveBeenCalledWith(final);
  });
});

describe('SystemTimeField (native) on iOS', () => {
  it.each([
    ['time', 'time'],
    ['date', 'date'],
    ['datetime', 'datetime'],
  ] as const)('opens a %s spinner sheet', async (mode, pickerMode) => {
    const { button } = await renderField('ios', { mode });
    expect(screen.queryByTestId('picker')).toBeNull();
    await fireEvent.press(button);
    const picker = screen.getByTestId('picker');
    expect(picker.props).toEqual(
      expect.objectContaining({ mode: pickerMode, display: 'spinner', is24Hour: true, value }),
    );
    expect(screen.queryByLabelText('Set AM')).toBeNull();
    expect(openAndroid).not.toHaveBeenCalled();
  });

  it('applies spinner changes and ignores empty ones', async () => {
    const { button, onChange } = await renderField('ios');
    await fireEvent.press(button);
    const picker = screen.getByTestId('picker');
    await fireEvent(picker, 'valueChange', {}, undefined);
    expect(onChange).not.toHaveBeenCalled();
    const next = new Date(2024, 0, 15, 10, 0);
    await fireEvent(picker, 'valueChange', {}, next);
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it('keeps the sheet open when the sheet itself is pressed and closes via Done', async () => {
    const { button } = await renderField('ios');
    await fireEvent.press(button);
    await fireEvent.press(screen.getByTestId('picker'));
    expect(screen.getByTestId('picker')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByTestId('picker')).toBeNull();
  });

  it('closes when the backdrop is pressed', async () => {
    const { button } = await renderField('ios');
    await fireEvent.press(button);
    await fireEvent.press(screen.getByLabelText('Dismiss picker'));
    expect(screen.queryByTestId('picker')).toBeNull();
  });

  it('closes on the hardware back/request-close event', async () => {
    const { button } = await renderField('ios');
    await fireEvent.press(button);
    let node = screen.getByLabelText('Dismiss picker').parent;
    while (node && !node.props.onRequestClose) node = node.parent;
    expect(node).toBeTruthy();
    await fireEvent(node!, 'requestClose');
    expect(screen.queryByTestId('picker')).toBeNull();
  });

  it('offers an AM/PM toggle in 12h mode that flips the half of day', async () => {
    const { button, onChange } = await renderField('ios', { is24Hour: false });
    await fireEvent.press(button);
    expect(screen.getByTestId('picker').props.is24Hour).toBe(false);
    expect(screen.getByLabelText('Set AM').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByLabelText('Set PM').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );

    await fireEvent.press(screen.getByLabelText('Set AM'));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Set PM'));
    expect(onChange).toHaveBeenCalledWith(new Date(2024, 0, 15, 19, 5, 9));
  });

  it('flips PM back to AM', async () => {
    const { button, onChange } = await renderField('ios', {
      is24Hour: false,
      mode: 'datetime',
      value: new Date(2024, 0, 15, 23, 0),
    });
    await fireEvent.press(button);
    await fireEvent.press(screen.getByLabelText('Set PM'));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Set AM'));
    expect(onChange).toHaveBeenCalledWith(new Date(2024, 0, 15, 11, 0));
  });

  it('omits the AM/PM toggle in date mode', async () => {
    const { button } = await renderField('ios', { mode: 'date', is24Hour: false });
    await fireEvent.press(button);
    expect(screen.queryByLabelText('Set AM')).toBeNull();
  });
});
