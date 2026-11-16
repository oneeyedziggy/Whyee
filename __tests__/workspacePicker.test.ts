import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { WorkspacePicker } from '../src/components/WorkspacePicker';

jest.mock('lucide-react-native', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Settings: () => null,
}));

describe('WorkspacePicker', () => {
  const options = [
    { id: 'user', label: 'User' },
    { id: 'test', label: 'Test' },
  ];

  it('renders every option and reports the selection', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      React.createElement(WorkspacePicker, {
        options,
        selectedId: 'user',
        onSelect,
      }),
    );

    expect(screen.getByText('User')).toBeTruthy();
    expect(screen.getByText('Test')).toBeTruthy();

    await fireEvent.press(screen.getByText('Test'));
    expect(onSelect).toHaveBeenCalledWith('test');
  });

  it('ignores presses on disabled options', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      React.createElement(WorkspacePicker, {
        options,
        selectedId: 'user',
        onSelect,
        disabledIds: ['test'],
      }),
    );

    await fireEvent.press(screen.getByText('Test'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens workspace management from the settings button', async () => {
    const onManage = jest.fn();
    const screen = await render(
      React.createElement(WorkspacePicker, {
        options,
        selectedId: 'user',
        onSelect: jest.fn(),
        onManage,
      }),
    );

    await fireEvent.press(screen.getByLabelText('Manage workspaces'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('shows the pager only once the options overflow the bar', async () => {
    const screen = await render(
      React.createElement(WorkspacePicker, {
        options,
        selectedId: 'user',
        onSelect: jest.fn(),
      }),
    );
    const scroller = screen.getByTestId('workspace-track');

    await expect(
      fireEvent(scroller, 'layout', { nativeEvent: null }),
    ).resolves.toBeUndefined();
    await fireEvent(scroller, 'layout', {
      nativeEvent: { layout: { width: 400, height: 40, x: 0, y: 0 } },
    });
    await fireEvent(scroller, 'contentSizeChange', 300, 40);
    await waitFor(() =>
      expect(screen.queryByLabelText('Show more workspaces')).toBeNull(),
    );

    await fireEvent(scroller, 'contentSizeChange', 900, 40);
    await waitFor(() =>
      expect(screen.getByLabelText('Show more workspaces')).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Show previous workspaces').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  const isDisabled = (
    screen: Awaited<ReturnType<typeof render>>,
    label: string,
  ) => screen.getByLabelText(label).props.accessibilityState.disabled;

  it('pages by one viewport, clamped to the ends of the track', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo')
      .mockImplementation(() => undefined);
    const screen = await render(
      React.createElement(WorkspacePicker, {
        options,
        selectedId: 'user',
        onSelect: jest.fn(),
      }),
    );
    const scroller = screen.getByTestId('workspace-track');
    await fireEvent(scroller, 'layout', {
      nativeEvent: { layout: { width: 400, height: 40, x: 0, y: 0 } },
    });
    await fireEvent(scroller, 'contentSizeChange', 900, 40);

    await fireEvent.press(screen.getByLabelText('Show previous workspaces'));
    expect(scrollTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Show more workspaces'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 400, animated: true });

    await fireEvent.scroll(scroller, { nativeEvent: null });
    expect(isDisabled(screen, 'Show previous workspaces')).toBe(true);

    await fireEvent.scroll(scroller, {
      nativeEvent: { contentOffset: { x: 450, y: 0 } },
    });
    await waitFor(() =>
      expect(isDisabled(screen, 'Show more workspaces')).toBe(false),
    );
    await fireEvent.press(screen.getByLabelText('Show more workspaces'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 500, animated: true });

    await fireEvent.scroll(scroller, {
      nativeEvent: { contentOffset: { x: 500, y: 0 } },
    });
    await waitFor(() =>
      expect(isDisabled(screen, 'Show more workspaces')).toBe(true),
    );
    expect(isDisabled(screen, 'Show previous workspaces')).toBe(false);
    scrollTo.mockClear();
    await fireEvent.press(screen.getByLabelText('Show more workspaces'));
    expect(scrollTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Show previous workspaces'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 100, animated: true });
    scrollTo.mockRestore();
  });

  it('steps by one point before the viewport has been measured', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo')
      .mockImplementation(() => undefined);
    const screen = await render(
      React.createElement(WorkspacePicker, {
        options,
        selectedId: 'user',
        onSelect: jest.fn(),
      }),
    );
    await fireEvent(
      screen.getByTestId('workspace-track'),
      'contentSizeChange',
      300,
      40,
    );
    await fireEvent.press(screen.getByLabelText('Show more workspaces'));
    expect(scrollTo).toHaveBeenCalledWith({ x: 1, animated: true });
    scrollTo.mockRestore();
  });
});