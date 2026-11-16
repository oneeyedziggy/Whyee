import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { confirmAction } from '../src/lib/confirm';

describe('ConfirmDialog', () => {
  it('confirms when Enter is pressed while open on web', async () => {
    const onConfirm = jest.fn();
    const listeners = new Map<string, EventListener>();
    const addListener = globalThis.addEventListener;
    const removeListener = globalThis.removeEventListener;
    const platform = jest.replaceProperty(Platform, 'OS', 'web');

    globalThis.addEventListener = ((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }) as typeof globalThis.addEventListener;
    globalThis.removeEventListener = ((type: string) => {
      listeners.delete(type);
    }) as typeof globalThis.removeEventListener;

    try {
      const screen = await render(React.createElement(ConfirmDialog));

      await act(async () => {
        confirmAction(
          'Delete item?',
          'This cannot be undone.',
          'Delete',
          onConfirm,
        );
      });
      await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());

      const preventDefault = jest.fn();
      await act(async () => {
        listeners.get('keydown')?.({
          key: 'Enter',
          preventDefault,
        } as unknown as KeyboardEvent);
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByText('Delete')).toBeNull());
    } finally {
      globalThis.addEventListener = addListener;
      globalThis.removeEventListener = removeListener;
      platform.restore();
    }
  });
});

describe('ConfirmDialog buttons', () => {
  const open = async (onConfirm: jest.Mock) => {
    const screen = await render(React.createElement(ConfirmDialog));
    expect(screen.queryByText('Remove')).toBeNull();
    await act(async () => {
      confirmAction('Remove row?', 'It goes away.', 'Remove', onConfirm);
    });
    await waitFor(() => expect(screen.getByText('Remove')).toBeTruthy());
    expect(screen.getByText('It goes away.')).toBeTruthy();
    expect(screen.getByLabelText('Remove row?')).toBeTruthy();
    return screen;
  };

  it('runs the action and closes when confirmed', async () => {
    const onConfirm = jest.fn();
    const screen = await open(onConfirm);
    await fireEvent.press(screen.getByText('Remove'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Remove')).toBeNull());
  });

  it.each(['Cancel', 'Dismiss confirmation'])(
    'closes without running the action from %s',
    async (control) => {
      const onConfirm = jest.fn();
      const screen = await open(onConfirm);
      await fireEvent.press(
        control === 'Cancel'
          ? screen.getByText('Cancel')
          : // The dialog is accessibilityViewIsModal, which hides its backdrop sibling.
            screen.getByLabelText(control, { includeHiddenElements: true }),
      );
      await waitFor(() => expect(screen.queryByText('Remove')).toBeNull());
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it('ignores the keyboard on native and other keys on web', async () => {
    const added: string[] = [];
    const listeners = new Map<string, EventListener>();
    const addListener = globalThis.addEventListener;
    const removeListener = globalThis.removeEventListener;
    globalThis.addEventListener = ((type: string, listener: EventListener) => {
      added.push(type);
      listeners.set(type, listener);
    }) as typeof globalThis.addEventListener;
    globalThis.removeEventListener = ((type: string) => {
      listeners.delete(type);
    }) as typeof globalThis.removeEventListener;

    try {
      const onConfirm = jest.fn();
      const nativeScreen = await open(onConfirm);
      expect(added).not.toContain('keydown');
      await nativeScreen.unmount();

      const platform = jest.replaceProperty(Platform, 'OS', 'web');
      try {
        const webScreen = await open(onConfirm);
        const preventDefault = jest.fn();
        await act(async () => {
          listeners.get('keydown')?.({
            key: 'Escape',
            preventDefault,
          } as unknown as KeyboardEvent);
        });
        expect(preventDefault).not.toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(webScreen.getByText('Remove')).toBeTruthy();

        await fireEvent.press(webScreen.getByText('Cancel'));
        await waitFor(() => expect(listeners.has('keydown')).toBe(false));
      } finally {
        platform.restore();
      }
    } finally {
      globalThis.addEventListener = addListener;
      globalThis.removeEventListener = removeListener;
    }
  });
});
