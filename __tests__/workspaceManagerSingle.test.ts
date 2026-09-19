import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { WorkspaceManagerModal } from '../src/components/WorkspaceManagerModal';

jest.mock('lucide-react-native', () => ({
  Eye: () => null,
  EyeOff: () => null,
  Trash2: () => null,
  X: () => null,
}));

it('keeps the last workspace undeletable', async () => {
  const onDelete = jest.fn();
  const screen = await render(
    React.createElement(WorkspaceManagerModal, {
      visible: true,
      workspaces: [{ id: 'user', name: 'User', notes: '', hidden: false }],
      onClose: jest.fn(),
      onAdd: jest.fn(),
      onUpdate: jest.fn(),
      onReorder: jest.fn(),
      onDelete,
    }),
  );

  expect(
    screen.getByLabelText('Delete User').props.accessibilityState.disabled,
  ).toBe(true);
  fireEvent.press(screen.getByLabelText('Delete User'));
  expect(onDelete).not.toHaveBeenCalled();
});
