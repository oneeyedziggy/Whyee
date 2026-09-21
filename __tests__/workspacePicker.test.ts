import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

    fireEvent.press(screen.getByText('Test'));
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

    fireEvent.press(screen.getByText('Test'));
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

    fireEvent.press(screen.getByLabelText('Manage workspaces'));
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

    expect(() =>
      fireEvent(scroller, 'layout', { nativeEvent: null }),
    ).not.toThrow();
    fireEvent(scroller, 'layout', {
      nativeEvent: { layout: { width: 400, height: 40, x: 0, y: 0 } },
    });
    fireEvent(scroller, 'contentSizeChange', 300, 40);
    await waitFor(() =>
      expect(screen.queryByLabelText('Show more workspaces')).toBeNull(),
    );

    fireEvent(scroller, 'contentSizeChange', 900, 40);
    await waitFor(() =>
      expect(screen.getByLabelText('Show more workspaces')).toBeTruthy(),
    );
    expect(
      screen.getByLabelText('Show previous workspaces').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

});
