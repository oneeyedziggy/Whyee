import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Settings } from 'lucide-react-native';
import { confirmAction } from '../lib/confirm';
import { isGroupEnabled } from '../lib/groups';
import { colors } from '../theme/tokens';
import type { CategoryDefinition, CategoryGroup } from '../types/category';
import {
  AddButton,
  CompactSwitch,
  getCategorySummary,
} from './CategoryEditorControls';
import { ContextMenu } from './ContextMenu';
import { DraggableList } from './DraggableList';
import { styles } from './categoryEditorStyles';

const CATEGORY_ROW_HEIGHT = 64;
const GROUP_HEADER_HEIGHT = 56;

type ListSlot =
  | { kind: 'group'; group: CategoryGroup; count: number }
  | { kind: 'category'; category: CategoryDefinition; groupId: string };

export const DraggableCategoryList = ({
  groups,
  categories,
  selectedCategoryId,
  selectedGroupId,
  onSelect,
  onSelectGroup,
  onUpdateCategory,
  onUpdateGroup,
  onToggleGroupEnabled,
  onAddCategoryToGroup,
  onDragChange,
  onMove,
  onDelete,
  onSetNotification,
}: {
  groups: CategoryGroup[];
  categories: CategoryDefinition[];
  selectedCategoryId: string;
  selectedGroupId: string;
  onSelect: (id: string) => void;
  onSelectGroup: (groupId: string) => void;
  onUpdateCategory: (category: CategoryDefinition) => void;
  onUpdateGroup: (group: CategoryGroup) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  onAddCategoryToGroup: (groupId: string) => void;
  onDragChange: (dragging: boolean) => void;
  onMove: (
    categoryId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
  onDelete: (id: string) => void;
  onSetNotification?: (category: CategoryDefinition) => void;
}) => {
  const slots = useMemo(() => {
    const next: ListSlot[] = [];
    for (const group of groups) {
      const groupCategories = group.categoryIds
        .map((id) => categories.find((category) => category.id === id))
        .filter((category): category is CategoryDefinition =>
          Boolean(category),
        );
      next.push({ kind: 'group', group, count: groupCategories.length });
      // A disabled group stays collapsed so its members can't be edited or toggled.
      if (!group.expanded || !isGroupEnabled(group)) continue;
      for (const category of groupCategories)
        next.push({ kind: 'category', category, groupId: group.id });
    }
    return next;
  }, [categories, groups]);
  const slotKey = (slot: ListSlot) =>
    slot.kind === 'group' ? `group:${slot.group.id}` : slot.category.id;

  return (
    <DraggableList
      items={slots}
      keyFor={slotKey}
      gapStyle={styles.dropGap}
      fallbackHeightFor={(index) =>
        slots[index]?.kind === 'group'
          ? GROUP_HEADER_HEIGHT
          : CATEGORY_ROW_HEIGHT
      }
      minBoundary={1}
      onDragChange={onDragChange}
      onDrop={(index, drop) => {
        const slot = slots[index];
        if (slot?.kind !== 'category') return;
        let groupId = '';
        let position = 0;
        for (let cursor = 0; cursor < drop; cursor += 1) {
          const candidate = slots[cursor];
          if (candidate.kind === 'group') {
            groupId = candidate.group.id;
            position = 0;
          } else if (cursor !== index) {
            position += 1;
          }
        }
        if (groupId) onMove(slot.category.id, groupId, position);
      }}
      renderItem={(slot, { held, panHandlers }) => {
        if (slot.kind === 'group') {
          const groupEnabled = isGroupEnabled(slot.group);
          return (
            <View
              style={[
                styles.groupHeader,
                slot.group.id === selectedGroupId && styles.groupSelected,
                !groupEnabled && styles.groupDisabled,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: slot.group.id === selectedGroupId,
                }}
                onPress={() => {
                  onSelectGroup(slot.group.id);
                  if (!groupEnabled) return;
                  onUpdateGroup({
                    ...slot.group,
                    expanded: !slot.group.expanded,
                  });
                }}
                style={styles.groupTitleButton}
              >
                <Text style={styles.groupTitle}>
                  {groupEnabled ? (slot.group.expanded ? '−' : '+') : '·'}{' '}
                  {slot.group.name}
                </Text>
                <Text style={styles.caption}>
                  {slot.count} categories{groupEnabled ? '' : ' · disabled'}
                </Text>
              </Pressable>
              <CompactSwitch
                accessibilityLabel={`Enable ${slot.group.name}`}
                value={groupEnabled}
                onChange={(enabled) => {
                  onSelectGroup(slot.group.id);
                  onToggleGroupEnabled(slot.group.id, enabled);
                }}
              />
              <AddButton
                accessibilityLabel={`Add category to ${slot.group.name}`}
                accessibilityHint={
                  groupEnabled
                    ? `Adds a category to ${slot.group.name}.`
                    : `${slot.group.name} is disabled; enable it before adding a category.`
                }
                disabled={!groupEnabled}
                onPress={() => onAddCategoryToGroup(slot.group.id)}
              />
            </View>
          );
        }
        const category = slot.category;
        return (
          <View
            style={[
              styles.categoryRow,
              !category.enabled && styles.categoryDisabled,
              category.id === selectedCategoryId && styles.categorySelected,
              held && styles.categoryDragging,
            ]}
          >
            <View
              accessibilityLabel={`Reorder ${category.name}`}
              accessibilityRole="adjustable"
              style={styles.dragHandle}
              {...panHandlers}
            >
              <Text style={styles.dragHandleText} selectable={false}>
                {'\u283f'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                selected: category.id === selectedCategoryId,
              }}
              onPress={() => onSelect(category.id)}
              style={styles.categoryText}
            >
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.caption}>
                {category.enabled
                  ? getCategorySummary(category)
                  : `Disabled · ${getCategorySummary(category)}`}
              </Text>
            </Pressable>
            <CompactSwitch
              accessibilityLabel={`Enable category ${category.name}`}
              value={category.enabled}
              onChange={(enabled) => {
                onSelect(category.id);
                onUpdateCategory({ ...category, enabled });
              }}
            />
            {/* Delete is always available, so the options menu always renders. */}
            <ContextMenu
              accessibilityLabel={`Category options for ${category.name}`}
              renderTrigger={() => (
                <Settings color={colors.primary} size={18} />
              )}
              triggerStyle={styles.notificationButton}
              items={[
                ...(onSetNotification
                  ? [
                      {
                        key: 'notify',
                        label: 'Set notification',
                        onPress: () => onSetNotification(category),
                      },
                    ]
                  : []),
                {
                  key: 'delete',
                  label: 'Delete category',
                  destructive: true,
                  onPress: () =>
                    confirmAction(
                      'Delete category',
                      `Delete "${category.name}"? This cannot be undone.`,
                      'Delete',
                      () => onDelete(category.id),
                    ),
                },
              ]}
            />
          </View>
        );
      }}
    />
  );
};
