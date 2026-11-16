import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { DatePickerModal } from '../src/components/DatePickerModal';
import { colors } from '../src/theme/tokens';

jest.mock('lucide-react-native', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
}));

const march15 = new Date(2024, 2, 15);
const monthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const renderPicker = async (
  props: Partial<React.ComponentProps<typeof DatePickerModal>> = {},
) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const element = (overrides: typeof props = {}) =>
    React.createElement(DatePickerModal, {
      visible: true,
      date: march15,
      onSelect,
      onClose,
      ...props,
      ...overrides,
    });
  const screen = await render(element());
  return {
    screen,
    onSelect,
    onClose,
    rerender: (overrides: typeof props) => screen.rerender(element(overrides)),
  };
};

const dialogStyle = (screen: Awaited<ReturnType<typeof render>>) =>
  StyleSheet.flatten(
    screen.getByLabelText('Previous month').parent?.parent?.props.style,
  );

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');

afterEach(async () => {
  await act(async () =>
    Dimensions.set({ window: originalWindow, screen: originalScreen }),
  );
});

describe('DatePickerModal', () => {
  it('shows the month of the selected date with the date selected', async () => {
    const { screen } = await renderPicker();
    expect(screen.getByText(monthLabel(march15))).toBeTruthy();
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((label) =>
      expect(screen.getByText(label)).toBeTruthy(),
    );
    const selected = screen.getByLabelText(march15.toDateString());
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(
      colors.primary,
    );
    const other = screen.getByLabelText(new Date(2024, 2, 16).toDateString());
    expect(other.props.accessibilityState).toEqual({ selected: false });
    expect(screen.getAllByText('31')).toHaveLength(1);
  });

  it('renders nothing while hidden', async () => {
    const { screen } = await renderPicker({ visible: false });
    expect(screen.queryByText(monthLabel(march15))).toBeNull();
  });

  it('selects a pressed day and closes', async () => {
    const { screen, onSelect, onClose } = await renderPicker();
    const target = new Date(2024, 2, 3);
    await fireEvent.press(screen.getByLabelText(target.toDateString()));
    expect(onSelect).toHaveBeenCalledWith(target);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('navigates between months, across year boundaries', async () => {
    const { screen, onSelect } = await renderPicker({
      date: new Date(2024, 0, 10),
    });
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText(monthLabel(new Date(2023, 11, 1)))).toBeTruthy();
    expect(
      screen.getByLabelText(new Date(2023, 11, 31).toDateString()).props
        .accessibilityState,
    ).toEqual({ selected: false });

    await fireEvent.press(screen.getByLabelText('Next month'));
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText(monthLabel(new Date(2024, 1, 1)))).toBeTruthy();
    expect(screen.getByLabelText(new Date(2024, 1, 29).toDateString())).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('jumps to today', async () => {
    const { screen, onSelect, onClose } = await renderPicker();
    const before = Date.now();
    await fireEvent.press(screen.getByText('Jump to today'));
    const picked = onSelect.mock.calls[0][0] as Date;
    expect(picked.getTime()).toBeGreaterThanOrEqual(before);
    expect(picked.getTime()).toBeLessThanOrEqual(Date.now());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('outlines today when it is not the selected day', async () => {
    const today = new Date();
    const otherDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() === 1 ? 2 : 1,
    );
    const { screen } = await renderPicker({ date: otherDay });
    const todayStyle = StyleSheet.flatten(
      screen.getByLabelText(today.toDateString()).props.style,
    );
    expect(todayStyle.borderColor).toBe(colors.primary);
    expect(todayStyle.backgroundColor).toBeUndefined();
  });

  it('closes from the backdrop and the hardware back request without selecting', async () => {
    const { screen, onSelect, onClose } = await renderPicker();
    await fireEvent.press(screen.getByLabelText('Close date picker', {
      includeHiddenElements: true,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);

    let node = screen.getByLabelText('Close date picker', {
      includeHiddenElements: true,
    }).parent;
    while (node && !node.props.onRequestClose) node = node.parent;
    await act(async () => node?.props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('returns to the selected month when reopened', async () => {
    const { screen, rerender } = await renderPicker();
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText(monthLabel(new Date(2024, 3, 1)))).toBeTruthy();

    await rerender({ visible: false });
    await rerender({ visible: true });
    expect(screen.getByText(monthLabel(march15))).toBeTruthy();

    // A new date while open also re-centers the calendar.
    await rerender({ date: new Date(2025, 6, 4) });
    expect(screen.getByText(monthLabel(new Date(2025, 6, 1)))).toBeTruthy();
  });

  it('centers on a date that changed while hidden once reopened', async () => {
    const { screen, rerender } = await renderPicker();
    await fireEvent.press(screen.getByLabelText('Next month'));
    await rerender({ visible: false, date: new Date(2025, 6, 4) });
    await rerender({ visible: true, date: new Date(2025, 6, 4) });
    expect(screen.getByText(monthLabel(new Date(2025, 6, 1)))).toBeTruthy();
  });

  it('uses a fluid width on phones and a fixed width on desktop', async () => {
    const { screen } = await renderPicker();
    expect(dialogStyle(screen).width).toBe('86%');

    await act(async () =>
      Dimensions.set({
        window: { ...originalWindow, width: 1200 },
        screen: { ...originalScreen, width: 1200 },
      }),
    );
    expect(dialogStyle(screen).width).toBe(340);
  });
});
