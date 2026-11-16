import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CategoryEditor } from '../src/components/CategoryEditor';
import { createDefaultCategory } from '../src/lib/category';
import { confirmAction } from '../src/lib/confirm';
import { setGroupEnabled } from '../src/lib/groups';
import type { CategoryDefinition, CategoryGroup } from '../src/types/category';

jest.mock('../src/lib/confirm', () => ({ confirmAction: jest.fn() }));
jest.mock('../src/lib/notificationService', () => ({
  notificationService: {
    checkAvailability: jest.fn(),
    requestPermission: jest.fn(),
    scheduleCategory: jest.fn(),
    cancelCategory: jest.fn(),
  },
}));
jest.mock('lucide-react-native', () => ({
  Calendar: () => null,
  Clock: () => null,
  Settings: () => null,
  X: () => null,
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

const makeFirstChoice = (): Extract<
  CategoryDefinition,
  { kind: 'multiple-choice' }
> => {
  const category = createDefaultCategory('multiple-choice', 0, 'First');
  if (category.kind !== 'multiple-choice')
    throw new Error('expected multiple-choice category');
  return {
    ...category,
    id: 'first',
    multiSelect: false,
    allowMultiplePerDay: false,
  };
};

const initialCategories: CategoryDefinition[] = [
  makeFirstChoice(),
  {
    ...createDefaultCategory('number', 1, 'Second'),
    id: 'second',
    enabled: false,
  },
];

const initialGroups: CategoryGroup[] = [
  {
    id: 'custom',
    name: 'Custom',
    categoryIds: ['first', 'second'],
    expanded: true,
  },
];

const Harness = ({ conflictingSelection = false }: { conflictingSelection?: boolean }) => {
  const [categories, setCategories] = React.useState(initialCategories);
  const [groups, setGroups] = React.useState(initialGroups);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState(conflictingSelection ? 'first' : '');
  const [selectedGroupId, setSelectedGroupId] = React.useState(conflictingSelection ? 'custom' : '');
  return React.createElement(CategoryEditor, {
    visible: true,
    categories,
    groups,
    selectedCategoryId,
    selectedGroupId,
    onClose: () => {},
    onSelect: setSelectedCategoryId,
    onAddGroup: () => {},
    onAddCategoryToGroup: () => {},
    onRestoreDefaults: () => {},
    onDeleteGroup: () => {},
    onDelete: () => {},
    onMoveCategory: () => {},
    onUpdate: (category) =>
      setCategories((current) =>
        current.map((candidate) =>
          candidate.id === category.id ? category : candidate,
        ),
      ),
    onSelectGroup: setSelectedGroupId,
    onUpdateGroup: (group) =>
      setGroups((current) =>
        current.map((candidate) =>
          candidate.id === group.id ? group : candidate,
        ),
      ),
    onToggleGroupEnabled: (groupId, enabled) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      const next = setGroupEnabled(group, categories, enabled);
      setGroups((current) =>
        current.map((candidate) =>
          candidate.id === groupId ? next.group : candidate,
        ),
      );
      setCategories(next.categories);
    },
    notificationSupported: false,
  });
};

describe('CategoryEditor group selection and enablement', () => {
  it('never highlights a category alongside a selected group', async () => {
    const screen = await render(React.createElement(Harness, { conflictingSelection: true }));
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(screen.getByText('Selected group')).toBeTruthy();
    expect(screen.queryByText('Selected category')).toBeNull();

    await fireEvent.press(screen.getByText('First'));
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(screen.getByText('Selected category')).toBeTruthy();
    expect(screen.queryByText('Selected group')).toBeNull();

    await fireEvent.press(screen.getByText('− Custom'));
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(screen.getByText('Selected group')).toBeTruthy();
    expect(screen.queryByText('Selected category')).toBeNull();
  });

  it('starts with nothing selected, selects groups, and locks disabled groups', async () => {
    const screen = await render(React.createElement(Harness));

    expect(screen.queryByText('Selected category')).toBeNull();
    expect(screen.queryByText('Selected group')).toBeNull();

    // Selecting a group shows its own editable properties and collapses the members.
    await fireEvent.press(screen.getByText('− Custom'));
    await waitFor(() =>
      expect(screen.getByText('Selected group')).toBeTruthy(),
    );
    expect(screen.queryByText('Selected category')).toBeNull();
    expect(screen.queryByText('First')).toBeNull();

    await fireEvent.press(screen.getByText('+ Custom'));
    await waitFor(() => expect(screen.getByText('First')).toBeTruthy());
    await fireEvent.press(screen.getByText('First'));
    await waitFor(() =>
      expect(screen.getByText('Selected category')).toBeTruthy(),
    );
    expect(screen.getByText('Correlate as')).toBeTruthy();
    expect(screen.queryByLabelText('What does Type mean?')).toBeNull();
    expect(screen.queryByLabelText('What does Enabled mean?')).toBeNull();
    const valuesSwitch = screen.getByLabelText('Show option values');
    await fireEvent(valuesSwitch, 'valueChange', true);
    await fireEvent.changeText(
      screen.getByLabelText('Name for choice 1'),
      '  ',
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Show option values').props.accessibilityState
          .disabled,
      ).toBe(true),
    );
    await fireEvent.changeText(
      screen.getByLabelText('Name for choice 1'),
      'Option 1',
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Show option values').props.accessibilityState
          .disabled,
      ).toBe(false),
    );
    await fireEvent(
      screen.getByLabelText('Show option values'),
      'valueChange',
      false,
    );
    expect(screen.getByText('Add')).toBeTruthy();
    expect(screen.getByLabelText('Add choice').props.accessibilityHint).toBe(
      'Adds a new choice option to this category.',
    );
    expect(screen.getAllByLabelText(/^Delete choice Option/)).toHaveLength(3);

    await fireEvent(screen.getByLabelText('Enable Custom'), 'valueChange', false);

    // Disabled groups collapse and keep their add button visible but inactive.
    await waitFor(() => expect(screen.getByText('· Custom')).toBeTruthy());
    expect(screen.queryByText('First')).toBeNull();
    const disabledAdd = screen.getByLabelText('Add category to Custom');
    expect(disabledAdd.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByText('· Custom'));
    await waitFor(() => expect(screen.getByText('· Custom')).toBeTruthy());
    expect(screen.queryByText('First')).toBeNull();

    // Re-enabling restores each member's own state: "Second" was already off.
    await fireEvent(screen.getByLabelText('Enable Custom'), 'valueChange', true);
    await waitFor(() => expect(screen.getByText('+ Custom')).toBeTruthy());
    await fireEvent.press(screen.getByText('+ Custom'));
    await waitFor(() => expect(screen.getByText('First')).toBeTruthy());
    expect(screen.getByText(/^Disabled ·/)).toBeTruthy();

    // The row toggle enables the category and selects it for editing.
    await fireEvent(
      screen.getByLabelText('Enable category Second'),
      'valueChange',
      true,
    );
    await waitFor(() =>
      expect(screen.getByText('Selected category')).toBeTruthy(),
    );
    expect(screen.queryByText(/^Disabled ·/)).toBeNull();

    // Toggling the group selects it, so no category stays editable while it is disabled.
    await fireEvent(
      screen.getByLabelText('Enable Custom'),
      'valueChange',
      false,
    );
    await waitFor(() =>
      expect(screen.getByText('Selected group')).toBeTruthy(),
    );
    expect(screen.queryByText('Selected category')).toBeNull();
  });
});

describe('CategoryEditor actions and layout', () => {
  const { measureInWindow } = jest.requireActual(
    '@react-native/jest-preset/jest/MockNativeMethods',
  ).default as { measureInWindow: jest.Mock };
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');

  afterEach(async () => {
    // Restoring dimensions notifies the still-mounted editor, so flush that update inside act.
    await act(async () =>
      Dimensions.set({ window: originalWindow, screen: originalScreen }),
    );
    measureInWindow.mockReset();
    jest.mocked(confirmAction).mockReset();
  });

  type HostNode = { parent: HostNode | null; props: Record<string, unknown> };
  const modalProps = (screen: Awaited<ReturnType<typeof render>>) => {
    let node: HostNode | null = screen.getByText('Category editor') as unknown as HostNode;
    while (node && node.props.presentationStyle === undefined) node = node.parent;
    return node?.props;
  };

  const renderEditor = (
    overrides: Partial<React.ComponentProps<typeof CategoryEditor>> = {},
  ) => {
    const props: React.ComponentProps<typeof CategoryEditor> = {
      visible: true,
      categories: initialCategories,
      groups: initialGroups,
      selectedCategoryId: 'first',
      selectedGroupId: '',
      onClose: jest.fn(),
      onSelect: jest.fn(),
      onAddGroup: jest.fn(),
      onAddCategoryToGroup: jest.fn(),
      onRestoreDefaults: jest.fn(),
      onDeleteGroup: jest.fn(),
      onDelete: jest.fn(),
      onMoveCategory: jest.fn(),
      onUpdate: jest.fn(),
      onSelectGroup: jest.fn(),
      onUpdateGroup: jest.fn(),
      onToggleGroupEnabled: jest.fn(),
      ...overrides,
    };
    return render(
      React.createElement(
        SafeAreaProvider,
        {
          initialMetrics: {
            frame: { x: 0, y: 0, width: 400, height: 800 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          },
        },
        React.createElement(CategoryEditor, props),
      ),
    ).then((screen) => ({
      screen,
      props,
    }));
  };

  it('uses a dismissible side panel on wide screens', async () => {
    Dimensions.set({
      window: { ...originalWindow, width: 1200 },
      screen: { ...originalScreen, width: 1200 },
    });
    const { screen, props } = await renderEditor();
    expect(modalProps(screen)).toMatchObject({
      animationType: 'fade',
      transparent: true,
      presentationStyle: 'overFullScreen',
      statusBarTranslucent: false,
    });
    await fireEvent.press(screen.getByLabelText('Close category editor'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders no editor content while hidden', async () => {
    const { screen } = await renderEditor({ visible: false });
    expect(screen.queryByText('Category editor')).toBeNull();
  });

  it('uses a full-screen sheet on narrow screens', async () => {
    Dimensions.set({
      window: { ...originalWindow, width: 400 },
      screen: { ...originalScreen, width: 400 },
    });
    const { screen, props } = await renderEditor();
    expect(screen.queryByLabelText('Close category editor')).toBeNull();
    expect(modalProps(screen)).toMatchObject({
      animationType: 'slide',
      transparent: false,
      presentationStyle: 'pageSheet',
      statusBarTranslucent: Platform.OS === 'android',
    });
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByText('Add group'));
    await fireEvent.press(screen.getByText('Restore defaults'));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onAddGroup).toHaveBeenCalled();
    expect(props.onRestoreDefaults).toHaveBeenCalled();
  });

  it('passes entry counts to type changes and deletes the selected category after confirming', async () => {
    const { screen, props } = await renderEditor({ entryCounts: { first: 4 } });
    await fireEvent.press(screen.getByLabelText('Number'));
    expect(jest.mocked(confirmAction).mock.calls[0][1]).toContain('has 4 logged entries');
    await fireEvent.press(screen.getByText('Remove category'));
    jest.mocked(confirmAction).mock.calls[1][3]();
    expect(props.onDelete).toHaveBeenCalledWith('first');
  });

  it('switches types immediately for categories missing from entry counts', async () => {
    const { screen, props } = await renderEditor({ entryCounts: {} });
    await fireEvent.press(screen.getByLabelText('Number'));
    expect(confirmAction).not.toHaveBeenCalled();
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'first', kind: 'number' }),
    );
  });

  it('routes group detail toggles and deletion to the selected group', async () => {
    const { screen, props } = await renderEditor({
      selectedCategoryId: '',
      selectedGroupId: 'custom',
    });
    await fireEvent.press(screen.getByLabelText('Enabled'));
    expect(props.onToggleGroupEnabled).toHaveBeenCalledWith('custom', false);
    await fireEvent.press(screen.getByText('Delete group'));
    expect(props.onDeleteGroup).toHaveBeenCalledWith('custom');
  });

  it('opens notification settings from the category menu, closing on cancel or save', async () => {
    measureInWindow.mockImplementation(
      (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(0, 0, 20, 20),
    );
    const { screen, props } = await renderEditor();
    const openSettings = async () => {
      await fireEvent.press(screen.getByLabelText('Category options for First'));
      await fireEvent.press(screen.getByText('Set notification'));
      return screen.getByLabelText('Set notification for First');
    };

    await openSettings();
    await fireEvent.press(screen.getByLabelText('Close set notification dialog'));
    expect(screen.queryByLabelText('Set notification for First')).toBeNull();

    await openSettings();
    await fireEvent.press(screen.getByText(/^save$/i));
    await waitFor(() =>
      expect(screen.queryByLabelText('Set notification for First')).toBeNull(),
    );
    expect(props.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'first',
        notificationSchedule: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it('hides notification options when notifications are unsupported', async () => {
    measureInWindow.mockImplementation(
      (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(0, 0, 20, 20),
    );
    const { screen } = await renderEditor({ notificationSupported: false });
    await fireEvent.press(screen.getByLabelText('Category options for First'));
    expect(screen.getByText('Delete category')).toBeTruthy();
    expect(screen.queryByText('Set notification')).toBeNull();
  });
});
