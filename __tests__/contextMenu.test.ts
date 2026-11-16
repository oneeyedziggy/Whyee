import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, Platform, StyleSheet, Text } from 'react-native';
import {
  ContextMenu,
  type ContextMenuItem,
} from '../src/components/ContextMenu';

// The React Native jest preset backs every mocked View with this shared object,
// whose measureInWindow is a no-op jest.fn() that never calls back.
const { measureInWindow } = jest.requireActual(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default as { measureInWindow: jest.Mock };

const createItems = (): ContextMenuItem[] => [
  { key: 'rename', label: 'Rename', onPress: jest.fn() },
  { key: 'delete', label: 'Delete', destructive: true, onPress: jest.fn() },
];

const createMenu = (
  label: string,
  items: ContextMenuItem[],
  captureOpen?: (open: () => void) => void,
) =>
  React.createElement(ContextMenu, {
    key: label,
    accessibilityLabel: label,
    items,
    renderTrigger: (open) => {
      captureOpen?.(open);
      return React.createElement(Text, null, `${label} trigger`);
    },
  });

type HostNode = {
  parent: HostNode | null;
  props: Record<string, unknown> & { onRequestClose?: () => void };
};

const findModal = (node: HostNode): HostNode => {
  let current: HostNode | null = node;
  while (current && !current.props.onRequestClose) current = current.parent;
  if (!current) throw new Error('Modal host not found');
  return current;
};

beforeEach(() => {
  measureInWindow.mockImplementation(
    (callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(200, 50, 40, 30),
  );
});

afterEach(() => {
  measureInWindow.mockReset();
});

describe('ContextMenu', () => {
  it('stays closed until the trigger is pressed', async () => {
    const screen = await render(createMenu('Options', createItems()));
    expect(screen.getByText('Options trigger')).toBeTruthy();
    expect(screen.queryByLabelText('Rename')).toBeNull();
  });

  it('opens below the trigger, right-aligned to it', async () => {
    const screen = await render(createMenu('Options', createItems()));
    await fireEvent.press(screen.getByLabelText('Options'));

    expect(screen.getByLabelText('Rename')).toBeTruthy();
    const menuStyle = StyleSheet.flatten(
      screen.getByLabelText('Rename').parent?.props.style,
    );
    expect(menuStyle).toMatchObject({
      position: 'absolute',
      top: 50 + 30 + 4,
      right: Dimensions.get('window').width - (200 + 40),
    });
  });

  it('marks destructive items with the danger color', async () => {
    const screen = await render(createMenu('Options', createItems()));
    await fireEvent.press(screen.getByLabelText('Options'));
    const deleteColor = StyleSheet.flatten(
      screen.getByText('Delete').props.style,
    ).color;
    const renameColor = StyleSheet.flatten(
      screen.getByText('Rename').props.style,
    ).color;
    expect(deleteColor).not.toBe(renameColor);
  });

  it('closes and runs the item action when an item is selected', async () => {
    const items = createItems();
    const screen = await render(createMenu('Options', items));
    await fireEvent.press(screen.getByLabelText('Options'));
    await fireEvent.press(screen.getByLabelText('Delete'));

    expect(items[1].onPress).toHaveBeenCalledTimes(1);
    expect(items[0].onPress).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Delete')).toBeNull();
  });

  it('dismisses without running an action when the backdrop is tapped', async () => {
    const items = createItems();
    const screen = await render(createMenu('Options', items));
    await fireEvent.press(screen.getByLabelText('Options'));
    await fireEvent.press(screen.getByLabelText('Dismiss menu'));

    expect(screen.queryByLabelText('Rename')).toBeNull();
    expect(items[0].onPress).not.toHaveBeenCalled();
    expect(items[1].onPress).not.toHaveBeenCalled();
  });

  it('closes on the hardware back request', async () => {
    const screen = await render(createMenu('Options', createItems()));
    await fireEvent.press(screen.getByLabelText('Options'));
    const modal = findModal(screen.getByLabelText('Dismiss menu'));
    await act(async () => modal.props.onRequestClose?.());
    expect(screen.queryByLabelText('Rename')).toBeNull();
  });

  it('uses a translucent status bar only on Android', async () => {
    const screen = await render(createMenu('Options', createItems()));
    await fireEvent.press(screen.getByLabelText('Options'));
    const modal = findModal(screen.getByLabelText('Dismiss menu'));
    expect(modal.props.statusBarTranslucent).toBe(Platform.OS === 'android');
  });

  it('does not wire hover handlers on native', async () => {
    const screen = await render(createMenu('Options', createItems()));
    await fireEvent.press(screen.getByLabelText('Options'));
    expect(screen.getByLabelText('Rename').props.onHoverIn).toBeUndefined();
  });

  it('lets the custom trigger open the menu', async () => {
    let openFromTrigger: () => void = () => undefined;
    const screen = await render(
      createMenu('Options', createItems(), (open) => {
        openFromTrigger = open;
      }),
    );
    await act(async () => openFromTrigger());
    expect(screen.getByLabelText('Rename')).toBeTruthy();
  });

  it('ignores a stale open request after the trigger unmounts', async () => {
    let openFromTrigger: () => void = () => undefined;
    const screen = await render(
      createMenu('Options', createItems(), (open) => {
        openFromTrigger = open;
      }),
    );
    await screen.unmount();
    measureInWindow.mockClear();
    expect(() => openFromTrigger()).not.toThrow();
    expect(measureInWindow).not.toHaveBeenCalled();
  });

  it('keeps only one menu open at a time', async () => {
    const screen = await render(
      React.createElement(
        React.Fragment,
        null,
        createMenu('First', [
          { key: 'a', label: 'First action', onPress: jest.fn() },
        ]),
        createMenu('Second', [
          { key: 'b', label: 'Second action', onPress: jest.fn() },
        ]),
      ),
    );

    await fireEvent.press(screen.getByLabelText('First'));
    expect(screen.getByLabelText('First action')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Second'));
    expect(screen.getByLabelText('Second action')).toBeTruthy();
    expect(screen.queryByLabelText('First action')).toBeNull();

    // Closing the second menu unregisters it, so reopening the first leaves it alone.
    await fireEvent.press(screen.getByLabelText('Dismiss menu'));
    await fireEvent.press(screen.getByLabelText('First'));
    expect(screen.getByLabelText('First action')).toBeTruthy();
    expect(screen.queryByLabelText('Second action')).toBeNull();
  });
});
