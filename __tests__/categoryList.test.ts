import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { DraggableCategoryList } from '../src/components/CategoryList';
import { styles } from '../src/components/categoryEditorStyles';
import { createDefaultCategory } from '../src/lib/category';
import { confirmAction } from '../src/lib/confirm';
import type { CategoryDefinition, CategoryGroup } from '../src/types/category';

jest.mock('lucide-react-native', () => ({ Settings: () => null }));
jest.mock('../src/lib/confirm', () => ({ confirmAction: jest.fn() }));

// Gesture handling lives in useDragReorder/ContextMenu tests; these fakes expose list callbacks and menu items.
const mockList: {
  props?: {
    items: unknown[];
    onDrop: (from: number, to: number) => void;
    fallbackHeightFor: (index: number) => number;
  };
  heldIndex?: number;
} = {};
jest.mock('../src/components/DraggableList', () => {
  const { createElement, Fragment } =
    jest.requireActual<typeof import('react')>('react');
  return {
    DraggableList: (props: {
      items: unknown[];
      keyFor: (item: unknown, index: number) => string;
      renderItem: (item: unknown, state: object) => unknown;
      onDrop: (from: number, to: number) => void;
      fallbackHeightFor: (index: number) => number;
    }) => {
      mockList.props = props;
      return props.items.map((item, index) =>
        createElement(
          Fragment,
          { key: props.keyFor(item, index) },
          props.renderItem(item, {
            index,
            held: mockList.heldIndex === index,
            panHandlers: {},
          }) as never,
        ),
      );
    },
  };
});
jest.mock('../src/components/ContextMenu', () => {
  const { createElement, Fragment } =
    jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ContextMenu: ({
      accessibilityLabel,
      items,
      renderTrigger,
    }: {
      accessibilityLabel: string;
      items: Array<{ key: string; label: string; onPress: () => void }>;
      renderTrigger: (open: () => void) => unknown;
    }) =>
      createElement(
        Fragment,
        null,
        renderTrigger(() => {}) as never,
        ...items.map((item) =>
          createElement(
            Pressable,
            {
              key: item.key,
              accessibilityLabel: `${accessibilityLabel}: ${item.label}`,
              onPress: item.onPress,
            },
            createElement(Text, null, item.label),
          ),
        ),
      ),
  };
});

const confirm = jest.mocked(confirmAction);

const category = (id: string, enabled = true): CategoryDefinition => ({
  ...createDefaultCategory('number', 0, id.toUpperCase()),
  id,
  enabled,
});

const categories = [category('a1'), category('a2', false), category('b1')];
const groupA: CategoryGroup = {
  id: 'A',
  name: 'Alpha',
  categoryIds: ['a1', 'a2', 'missing'],
  expanded: true,
};
const groupB: CategoryGroup = {
  id: 'B',
  name: 'Beta',
  categoryIds: ['b1'],
  expanded: true,
};

const setup = async (
  overrides: Partial<React.ComponentProps<typeof DraggableCategoryList>> = {},
) => {
  const props = {
    groups: [groupA, groupB],
    categories,
    selectedCategoryId: 'a1',
    selectedGroupId: '',
    onSelect: jest.fn(),
    onSelectGroup: jest.fn(),
    onUpdateCategory: jest.fn(),
    onUpdateGroup: jest.fn(),
    onToggleGroupEnabled: jest.fn(),
    onAddCategoryToGroup: jest.fn(),
    onDragChange: jest.fn(),
    onMove: jest.fn(),
    onDelete: jest.fn(),
    onSetNotification: jest.fn(),
    ...overrides,
  };
  const screen = await render(React.createElement(DraggableCategoryList, props));
  return { screen, props };
};

const rowStyle = (screen: Awaited<ReturnType<typeof setup>>['screen'], name: string) =>
  StyleSheet.flatten(screen.getByLabelText(`Reorder ${name}`).parent?.props.style);

beforeEach(() => {
  confirm.mockReset();
  mockList.heldIndex = undefined;
});

describe('DraggableCategoryList', () => {
  it('lists existing members under expanded groups with summaries and states', async () => {
    mockList.heldIndex = 1;
    const { screen } = await setup();
    // Slots: Alpha, A1, A2, Beta, B1 (the missing id is skipped and not counted).
    expect(mockList.props?.items).toHaveLength(5);
    expect(screen.getByText('2 categories')).toBeTruthy();
    expect(screen.getByText(/^Disabled · /)).toBeTruthy();
    expect(rowStyle(screen, 'A1')).toMatchObject(
      StyleSheet.flatten([styles.categorySelected, styles.categoryDragging])!,
    );
    expect(rowStyle(screen, 'B1')).not.toMatchObject(
      StyleSheet.flatten(styles.categoryDragging)!,
    );
    const heights = [0, 1, 99].map((index) =>
      mockList.props!.fallbackHeightFor(index),
    );
    expect(heights[0]).not.toBe(heights[1]);
    // Out-of-range indexes are treated as category rows.
    expect(heights[2]).toBe(heights[1]);
  });

  it('moves categories to the group and position of the drop boundary', async () => {
    const { props } = await setup();
    const drop = mockList.props!.onDrop;
    drop(1, 5);
    expect(props.onMove).toHaveBeenLastCalledWith('a1', 'B', 1);
    drop(4, 1);
    expect(props.onMove).toHaveBeenLastCalledWith('b1', 'A', 0);
    drop(1, 3);
    // The dragged row itself is not counted toward the target position.
    expect(props.onMove).toHaveBeenLastCalledWith('a1', 'A', 1);
    (props.onMove as jest.Mock).mockClear();
    drop(0, 3);
    drop(99, 3);
    drop(1, 0);
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('expands, collapses, toggles, and adds to enabled groups', async () => {
    const { screen, props } = await setup({ selectedGroupId: 'A' });
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(2);
    await fireEvent.press(screen.getByText('− Alpha'));
    expect(props.onSelectGroup).toHaveBeenCalledWith('A');
    expect(props.onUpdateGroup).toHaveBeenCalledWith({ ...groupA, expanded: false });
    await fireEvent.press(screen.getByLabelText('Enable Beta'));
    expect(props.onSelectGroup).toHaveBeenLastCalledWith('B');
    expect(props.onToggleGroupEnabled).toHaveBeenCalledWith('B', false);
    await fireEvent.press(screen.getByLabelText('Add category to Beta'));
    expect(props.onAddCategoryToGroup).toHaveBeenCalledWith('B');
  });

  it('keeps disabled and collapsed groups closed', async () => {
    const { screen, props } = await setup({
      groups: [{ ...groupA, enabled: false }, { ...groupB, expanded: false }],
    });
    expect(mockList.props?.items).toHaveLength(2);
    expect(screen.getByText('+ Beta')).toBeTruthy();
    expect(screen.getByText('2 categories · disabled')).toBeTruthy();
    await fireEvent.press(screen.getByText('· Alpha'));
    expect(props.onSelectGroup).toHaveBeenCalledWith('A');
    expect(props.onUpdateGroup).not.toHaveBeenCalled();
    const add = screen.getByLabelText('Add category to Alpha');
    expect(add.props.accessibilityState.disabled).toBe(true);
    expect(add.props.accessibilityHint).toBe(
      'Alpha is disabled; enable it before adding a category.',
    );
  });

  it('selects, toggles, notifies, and deletes categories only after confirmation', async () => {
    const { screen, props } = await setup();
    await fireEvent.press(screen.getByText('B1'));
    expect(props.onSelect).toHaveBeenCalledWith('b1');
    await fireEvent.press(screen.getByLabelText('Enable category A2'));
    expect(props.onSelect).toHaveBeenLastCalledWith('a2');
    expect(props.onUpdateCategory).toHaveBeenCalledWith({
      ...categories[1],
      enabled: true,
    });
    await fireEvent.press(
      screen.getByLabelText('Category options for B1: Set notification'),
    );
    expect(props.onSetNotification).toHaveBeenCalledWith(categories[2]);
    await fireEvent.press(
      screen.getByLabelText('Category options for B1: Delete category'),
    );
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(
      'Delete category',
      'Delete "B1"? This cannot be undone.',
      'Delete',
      expect.any(Function),
    );
    confirm.mock.calls[0][3]();
    expect(props.onDelete).toHaveBeenCalledWith('b1');
  });

  it('offers only deletion when notifications are unsupported', async () => {
    const { screen } = await setup({ onSetNotification: undefined });
    expect(screen.queryByText('Set notification')).toBeNull();
    expect(screen.getAllByText('Delete category')).toHaveLength(3);
  });
});
