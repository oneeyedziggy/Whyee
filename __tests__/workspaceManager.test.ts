import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { WorkspaceManagerModal } from '../src/components/WorkspaceManagerModal';
import {
  createWorkspaceId,
  isDuplicateWorkspaceName,
  moveWorkspace,
} from '../src/lib/workspaces';
import type { WorkspaceMeta } from '../src/types/workspace';

jest.mock('lucide-react-native', () => ({
  Eye: () => null,
  EyeOff: () => null,
  Trash2: () => null,
  X: () => null,
}));

const workspaces: WorkspaceMeta[] = [
  { id: 'user', name: 'User', notes: 'Daily tracking', hidden: false },
  { id: 'test', name: 'Test', notes: '', hidden: true },
];

const renderModal = (overrides: Partial<Record<string, unknown>> = {}) =>
  render(
    React.createElement(WorkspaceManagerModal, {
      visible: true,
      workspaces,
      onClose: jest.fn(),
      onAdd: jest.fn(),
      onUpdate: jest.fn(),
      onReorder: jest.fn(),
      onDelete: jest.fn(),
      ...overrides,
    } as never),
  );

describe('workspace helpers', () => {
  it('slugs names into safe transfer ids and dedupes them', () => {
    expect(createWorkspaceId('Work / Life', [])).toBe('work-life');
    expect(createWorkspaceId('User', ['user'])).toBe('user-2');
    expect(createWorkspaceId('User', ['user', 'user-2'])).toBe('user-3');
    expect(createWorkspaceId('   ', [])).toBe('workspace');
  });

  it('detects duplicate names case-insensitively', () => {
    expect(isDuplicateWorkspaceName(workspaces, ' user ')).toBe(true);
    expect(isDuplicateWorkspaceName(workspaces, 'User', 'user')).toBe(false);
    expect(isDuplicateWorkspaceName(workspaces, 'Fresh')).toBe(false);
  });

  it('moves a workspace to a boundary index', () => {
    const list: WorkspaceMeta[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ];
    expect(moveWorkspace(list, 2, 0).map((w) => w.id)).toEqual(['c', 'a', 'b']);
    expect(moveWorkspace(list, 0, 3).map((w) => w.id)).toEqual(['b', 'c', 'a']);
    expect(moveWorkspace(list, 1, 1)).toBe(list);
  });
});

// A single render per file: this testing-library version returns empty trees
// for later renders of the same modal.
describe('WorkspaceManagerModal', () => {
  it('adds, edits, hides, and deletes workspaces', async () => {
    const onAdd = jest.fn();
    const onUpdate = jest.fn();
    const onDelete = jest.fn();
    const screen = await renderModal({ onAdd, onUpdate, onDelete });

    await fireEvent.changeText(screen.getByLabelText('New workspace name'), 'user');
    await waitFor(() =>
      expect(
        screen.getByText('A workspace with that name already exists.'),
      ).toBeTruthy(),
    );
    await fireEvent.press(screen.getByText('Add workspace'));
    expect(onAdd).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('New workspace name'), 'Sleep');
    await fireEvent.changeText(
      screen.getByLabelText('New workspace notes'),
      'Bedtime experiments',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('New workspace notes').props.value).toBe(
        'Bedtime experiments',
      ),
    );
    await fireEvent.press(screen.getByText('Add workspace'));
    expect(onAdd).toHaveBeenCalledWith('Sleep', 'Bedtime experiments');

    await fireEvent.changeText(screen.getByLabelText('Rename User'), 'Primary');
    expect(onUpdate).toHaveBeenCalledWith('user', { name: 'Primary' });

    await fireEvent.changeText(screen.getByLabelText('Notes for User'), 'Updated');
    expect(onUpdate).toHaveBeenCalledWith('user', { notes: 'Updated' });

    await fireEvent.press(screen.getByLabelText('Hide User from the workspace bar'));
    expect(onUpdate).toHaveBeenCalledWith('user', { hidden: true });

    await fireEvent.press(screen.getByLabelText('Show Test in the workspace bar'));
    expect(onUpdate).toHaveBeenCalledWith('test', { hidden: false });

    await fireEvent.press(screen.getByLabelText('Delete Test'));
    expect(onDelete).toHaveBeenCalledWith('test');
  });
});
