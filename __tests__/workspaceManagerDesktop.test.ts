import React from 'react';
import {
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { WorkspaceManagerModal } from '../src/components/WorkspaceManagerModal';
import type { WorkspaceMeta } from '../src/types/workspace';

let mockWindowWidth = 1200;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 1000,
    scale: 1,
    fontScale: 1,
  }),
}));
jest.mock('lucide-react-native', () => ({
  Eye: () => null,
  EyeOff: () => null,
  Trash2: () => null,
  X: () => null,
}));

const workspaces: WorkspaceMeta[] = [
  { id: 'user', name: 'User' },
  { id: 'test', name: 'Test', notes: 'Fixtures' },
];

const props = (overrides: Partial<React.ComponentProps<typeof WorkspaceManagerModal>> = {}) => ({
  visible: true,
  workspaces,
  onClose: jest.fn(),
  onAdd: jest.fn(),
  onUpdate: jest.fn(),
  onReorder: jest.fn(),
  onDelete: jest.fn(),
  ...overrides,
});

afterEach(() => {
  jest.restoreAllMocks();
  mockWindowWidth = 1200;
});

it('renders as a sized desktop dialog that closes from the backdrop or Done', async () => {
  const onClose = jest.fn();
  const screen = await render(
    React.createElement(WorkspaceManagerModal, props({ onClose })),
  );
  const title = screen.getByText('Workspaces');
  const dialog = title.parent!.parent!.parent!;
  expect(StyleSheet.flatten(dialog.props.style)).toMatchObject({
    width: 760,
    height: 860,
    borderRadius: 14,
  });
  expect(screen.getByLabelText('Notes for User').props.value).toBe('');
  expect(screen.getByLabelText('Notes for Test').props.value).toBe('Fixtures');

  await fireEvent.press(
    screen.getByLabelText('Close workspaces', { includeHiddenElements: true }),
  );
  await fireEvent.press(screen.getByText('Done'));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('renders full screen without a backdrop on narrow windows', async () => {
  mockWindowWidth = 600;
  const screen = await render(React.createElement(WorkspaceManagerModal, props()));
  expect(
    screen.queryByLabelText('Close workspaces', { includeHiddenElements: true }),
  ).toBeNull();
  const dialog = screen.getByText('Workspaces').parent!.parent!.parent!;
  expect(StyleSheet.flatten(dialog.props.style).width).toBeUndefined();
});

it('clears a draft when the modal is hidden', async () => {
  const screen = await render(React.createElement(WorkspaceManagerModal, props()));
  await fireEvent.changeText(screen.getByLabelText('New workspace name'), 'Draft');
  await fireEvent.changeText(screen.getByLabelText('New workspace notes'), 'Note');
  await screen.rerender(
    React.createElement(WorkspaceManagerModal, props({ visible: false })),
  );
  await screen.rerender(React.createElement(WorkspaceManagerModal, props()));
  await waitFor(() =>
    expect(screen.getByLabelText('New workspace name').props.value).toBe(''),
  );
  expect(screen.getByLabelText('New workspace notes').props.value).toBe('');
});

it('locks scrolling and highlights the row while dragging to reorder', async () => {
  let config: PanResponderCallbacks | undefined;
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
    config = callbacks;
    return create(callbacks);
  });
  const onReorder = jest.fn();
  const screen = await render(
    React.createElement(WorkspaceManagerModal, props({ onReorder })),
  );
  const event = {} as GestureResponderEvent;
  const gesture = (values: Partial<PanResponderGestureState>) =>
    values as PanResponderGestureState;
  const scroller = () => {
    let node = screen.getByText('Existing workspaces').parent;
    while (node && node.props.scrollEnabled === undefined) node = node.parent;
    return node!;
  };
  const rowStyle = () =>
    StyleSheet.flatten(
      screen.getByLabelText('Reorder Test').parent!.parent!.props.style,
    );
  expect(scroller().props.scrollEnabled).toBe(true);
  const idleRow = rowStyle();

  await act(async () => {
    screen
      .getByLabelText('Reorder Test')
      .props.onStartShouldSetResponder(event);
    config!.onPanResponderGrant!(event, gesture({ y0: 300 }));
  });
  expect(scroller().props.scrollEnabled).toBe(false);
  expect(rowStyle()).not.toEqual(idleRow);

  await act(async () => config!.onPanResponderMove!(event, gesture({ moveY: 0 })));
  await act(async () => config!.onPanResponderRelease!(event, gesture({})));
  expect(onReorder).toHaveBeenCalledWith(1, 0);
  expect(scroller().props.scrollEnabled).toBe(true);
  expect(rowStyle()).toEqual(idleRow);
});
