import React from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TimeEditor } from '../src/components/TimeEditor';
import { colors } from '../src/theme/tokens';

const mockPicker: { value: Date } = { value: new Date() };

jest.mock('../src/components/SystemTimeField', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SystemTimeField: ({
      accessibilityLabel,
      onChange,
    }: {
      accessibilityLabel: string;
      onChange: (value: Date) => void;
    }) =>
      createElement(Pressable, {
        accessibilityLabel,
        onPress: () => onChange(mockPicker.value),
      }),
  };
});

type Props = React.ComponentProps<typeof TimeEditor>;

const evening = new Date(2026, 2, 1, 20, 0, 0);

const renderEditor = async (overrides: Partial<Props> = {}) => {
  const props: Props = {
    label: 'Start',
    timestamp: evening.toISOString(),
    showMilliseconds: false,
    rejectMessage: 'Out of range',
    onChange: jest.fn(),
    onReject: jest.fn(),
    ...overrides,
  };
  const screen = await render(React.createElement(TimeEditor, props));
  return { screen, props };
};

const borderColor = (node: { props: Record<string, unknown> }) =>
  StyleSheet.flatten(node.props.style as StyleProp<TextStyle>)?.borderColor;

describe('TimeEditor', () => {
  it('defaults to a 24-hour field with only the time picker', async () => {
    const { screen } = await renderEditor();
    const field = screen.getByDisplayValue('20:00:00');
    expect(field.props.placeholder).toBe('HH:MM:SS');
    expect(screen.getByLabelText('Open system time picker for Start')).toBeTruthy();
    expect(screen.queryByLabelText('Edit date for Start')).toBeNull();
  });

  it.each([
    [{ showMilliseconds: true }, 'HH:MM:SS.mmm', '20:00:00.000'],
    [{ is24Hour: false }, 'HH:MM:SS AM/PM', '08:00:00 PM'],
  ])('formats and hints the field for %p', async (overrides, placeholder, shown) => {
    const { screen } = await renderEditor(overrides);
    expect(screen.getByDisplayValue(shown).props.placeholder).toBe(placeholder);
  });

  it('keeps a bare 12-hour entry in the half of the day already shown', async () => {
    const morning = await renderEditor({
      is24Hour: false,
      timestamp: new Date(2026, 2, 1, 8).toISOString(),
    });
    const field = morning.screen.getByDisplayValue('08:00:00 AM');
    await fireEvent.changeText(field, '9');
    await fireEvent(field, 'blur');
    expect(morning.props.onChange).toHaveBeenCalledWith(new Date(2026, 2, 1, 9));
    expect(field.props.value).toBe('09:00:00 AM');

    const night = await renderEditor({ is24Hour: false });
    const evening12 = night.screen.getByDisplayValue('08:00:00 PM');
    await fireEvent.changeText(evening12, '9');
    await fireEvent(evening12, 'blur');
    expect(night.props.onChange).toHaveBeenCalledWith(new Date(2026, 2, 1, 21));
  });

  it('does nothing on blur when the text was not edited', async () => {
    const { screen, props } = await renderEditor();
    await fireEvent(screen.getByDisplayValue('20:00:00'), 'blur');
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onReject).not.toHaveBeenCalled();
  });

  it('keeps in-progress and invalid text when the stored timestamp changes', async () => {
    const { screen, props } = await renderEditor();
    const field = screen.getByDisplayValue('20:00:00');
    await fireEvent.changeText(field, '9');
    const later = new Date(2026, 2, 1, 21).toISOString();
    await screen.rerender(React.createElement(TimeEditor, { ...props, timestamp: later }));
    expect(field.props.value).toBe('9');

    await fireEvent.changeText(field, '99:99');
    await fireEvent(field, 'blur');
    await waitFor(() => expect(borderColor(field)).toBe(colors.danger));
    await screen.rerender(
      React.createElement(TimeEditor, { ...props, timestamp: evening.toISOString() }),
    );
    expect(field.props.value).toBe('99:99');
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('applies a picked time to today when there is no timestamp yet', async () => {
    mockPicker.value = new Date(2020, 0, 1, 7, 15, 0);
    const { screen, props } = await renderEditor({ timestamp: undefined });
    await fireEvent.press(screen.getByLabelText('Open system time picker for Start'));
    const picked: Date = (props.onChange as jest.Mock).mock.calls[0][0];
    expect(picked.toDateString()).toBe(new Date().toDateString());
    expect([picked.getHours(), picked.getMinutes()]).toEqual([7, 15]);
    expect(screen.getByDisplayValue('07:15:00')).toBeTruthy();
  });

  it('rolls past a minimum to the next day but rejects beyond a maximum', async () => {
    const { screen, props } = await renderEditor({
      minTimestamp: new Date(2026, 2, 1, 19).toISOString(),
      maxTimestamp: new Date(2026, 2, 2, 6).toISOString(),
    });
    const field = screen.getByDisplayValue('20:00:00');
    await fireEvent.changeText(field, '05:00:00');
    await fireEvent(field, 'blur');
    expect(props.onChange).toHaveBeenLastCalledWith(new Date(2026, 2, 2, 5));

    await fireEvent.changeText(field, '07:00:00');
    await fireEvent(field, 'blur');
    expect(props.onReject).toHaveBeenLastCalledWith('Out of range');
    expect(props.onChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(borderColor(field)).toBe(colors.danger));
  });

  it('keeps the same day when rollover is off and enforces both bounds', async () => {
    const { screen, props } = await renderEditor({
      allowRollover: false,
      minTimestamp: new Date(2026, 2, 1, 19).toISOString(),
      maxTimestamp: new Date(2026, 2, 1, 22).toISOString(),
    });
    const field = screen.getByDisplayValue('20:00:00');
    await fireEvent.changeText(field, '05:00:00');
    await fireEvent(field, 'blur');
    await fireEvent.changeText(field, '23:00:00');
    await fireEvent(field, 'blur');
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onReject).toHaveBeenCalledTimes(2);

    await fireEvent.changeText(field, '21:30:00');
    await fireEvent(field, 'submitEditing');
    expect(props.onReject).toHaveBeenLastCalledWith('');
    expect(props.onChange).toHaveBeenCalledWith(new Date(2026, 2, 1, 21, 30));
  });

  it('rejects picked dates outside the bounds and falls back to onChange', async () => {
    const { screen, props } = await renderEditor({
      showDateButton: true,
      minTimestamp: new Date(2026, 2, 1, 19).toISOString(),
      maxTimestamp: new Date(2026, 2, 5).toISOString(),
    });
    const datePicker = screen.getByLabelText('Edit date for Start');
    mockPicker.value = new Date(2026, 1, 28);
    await fireEvent.press(datePicker);
    mockPicker.value = new Date(2026, 2, 9);
    await fireEvent.press(datePicker);
    expect(props.onReject).toHaveBeenNthCalledWith(1, 'Out of range');
    expect(props.onReject).toHaveBeenNthCalledWith(2, 'Out of range');
    expect(props.onChange).not.toHaveBeenCalled();

    mockPicker.value = new Date(2026, 2, 3);
    await fireEvent.press(datePicker);
    expect(props.onReject).toHaveBeenLastCalledWith('');
    expect(props.onChange).toHaveBeenCalledWith(new Date(2026, 2, 3, 20));
  });

  it('labels how many days past the minimum the timestamp falls', async () => {
    const min = new Date(2026, 2, 1, 19).toISOString();
    const { screen, props } = await renderEditor({
      showDateButton: true,
      compact: true,
      minTimestamp: min,
      timestamp: new Date(2026, 2, 2, 1).toISOString(),
    });
    expect(screen.getByText(/^\+1 day \(/)).toBeTruthy();
    await screen.rerender(
      React.createElement(TimeEditor, {
        ...props,
        timestamp: new Date(2026, 2, 4, 1).toISOString(),
      }),
    );
    expect(screen.getByText(/^\+3 days \(/)).toBeTruthy();
    await screen.rerender(
      React.createElement(TimeEditor, { ...props, timestamp: evening.toISOString() }),
    );
    expect(screen.queryByText(/day/)).toBeNull();
    await screen.rerender(
      React.createElement(TimeEditor, {
        ...props,
        hideDayOffset: true,
        timestamp: new Date(2026, 2, 4, 1).toISOString(),
      }),
    );
    expect(screen.queryByText(/days/)).toBeNull();
  });
});
