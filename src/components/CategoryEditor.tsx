import {
  Animated,
  Button,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Settings } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChoiceOption,
  makeInverseSeries,
  normalizeChoiceOptions,
  recomputeVirtualSeries,
  switchCategoryKind,
} from '../lib/category';
import { describeVirtualSeries } from '../lib/virtualSeries';
import { DraggableList } from './DraggableList';
import { moveToDropIndex } from '../hooks/useDragReorder';
import type {
  CategoryDefinition,
  CategoryGroup,
  ChoiceOption,
  VirtualSeriesDefinition,
} from '../types/category';
import { colors } from '../theme/tokens';
import {
  getCategorySummary,
  NotesEditor,
  Segment,
  SwitchRow,
} from './CategoryEditorControls';
import { InfoLink } from './InfoLink';
import { NotificationSettings } from './NotificationSettings';
import { SystemScreen } from './SystemScreen';

interface CategoryEditorProps {
  visible: boolean;
  categories: CategoryDefinition[];
  groups: CategoryGroup[];
  selectedCategoryId: string;
  selectedGroupId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddGroup: () => void;
  onAddCategoryToGroup: (groupId: string) => void;
  onRestoreDefaults: () => void;
  onDeleteGroup: (groupId: string) => void;
  onDelete: (id: string) => void;
  onMoveCategory: (
    categoryId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
  onUpdate: (category: CategoryDefinition) => void;
  onSelectGroup: (groupId: string) => void;
  onUpdateGroup: (group: CategoryGroup) => void;
  notificationSupported?: boolean;
}

export const CategoryEditor = ({
  visible,
  categories,
  groups,
  selectedCategoryId,
  selectedGroupId,
  onClose,
  onSelect,
  onAddGroup,
  onAddCategoryToGroup,
  onRestoreDefaults,
  onDeleteGroup,
  onDelete,
  onMoveCategory,
  onUpdate,
  onSelectGroup,
  onUpdateGroup,
  notificationSupported = true,
}: CategoryEditorProps) => {
  const selected = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const panelWidth = Math.min(560, Math.max(380, Math.round(width / 3)));
  const slide = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [dragging, setDragging] = useState(false);
  const [notificationCategoryId, setNotificationCategoryId] = useState('');
  const notificationCategory = categories.find(
    (category) => category.id === notificationCategoryId,
  );
  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [slide, visible]);
  return (
    <Modal
      visible={visible}
      animationType={desktop ? 'fade' : 'slide'}
      transparent={desktop}
      statusBarTranslucent={!desktop && Platform.OS === 'android'}
      onRequestClose={onClose}
      presentationStyle={desktop ? 'overFullScreen' : 'fullScreen'}
    >
      <SystemScreen
        enabled={!desktop}
        style={desktop ? styles.desktopBackdrop : styles.mobileModal}
      >
        {desktop ? (
          <Pressable
            accessibilityLabel="Close category editor"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Animated.View
          style={[
            styles.root,
            desktop && styles.desktopPanel,
            desktop && {
              width: panelWidth,
              opacity: slide,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-panelWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.heading}>
            <View>
              <Text style={styles.headingTitle}>Category editor</Text>
              <Text style={styles.caption}>Select a category to edit it.</Text>
            </View>
            <InfoLink
              section="categories"
              label="Open category editor documentation"
            />
            <Button title="Done" onPress={onClose} />
          </View>
          <View style={styles.addRow}>
            <Button title="Add group" onPress={onAddGroup} />
            <Button title="Restore defaults" onPress={onRestoreDefaults} />
          </View>
          <ScrollView
            style={styles.categoryScroller}
            contentContainerStyle={styles.categoryList}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!dragging}
            showsVerticalScrollIndicator
          >
            <DraggableCategoryList
              groups={groups}
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelect={(id) => {
                onSelectGroup('');
                onSelect(id);
              }}
              onSelectGroup={onSelectGroup}
              onUpdateGroup={onUpdateGroup}
              onAddCategoryToGroup={onAddCategoryToGroup}
              onDragChange={setDragging}
              onMove={onMoveCategory}
              onSetNotification={
                notificationSupported
                  ? (category) => setNotificationCategoryId(category.id)
                  : undefined
              }
            />
            {selected && !selectedGroup ? (
              <CategoryDetails
                category={selected}
                onUpdate={onUpdate}
                onDelete={() => onDelete(selected.id)}
                onDragChange={setDragging}
              />
            ) : null}
            {selectedGroup ? (
              <GroupDetails
                group={selectedGroup}
                onUpdate={onUpdateGroup}
                onDelete={() => onDeleteGroup(selectedGroup.id)}
              />
            ) : null}
          </ScrollView>
          {notificationCategory ? (
            <NotificationSettings
              category={notificationCategory}
              visible
              onClose={() => setNotificationCategoryId('')}
              onUpdate={(category) => {
                onUpdate(category);
                setNotificationCategoryId('');
              }}
            />
          ) : null}
        </Animated.View>
      </SystemScreen>
    </Modal>
  );
};

const CATEGORY_ROW_HEIGHT = 64;
const GROUP_HEADER_HEIGHT = 56;

type ListSlot =
  | { kind: 'group'; group: CategoryGroup; count: number }
  | { kind: 'category'; category: CategoryDefinition; groupId: string };

const DraggableCategoryList = ({
  groups,
  categories,
  selectedCategoryId,
  onSelect,
  onSelectGroup,
  onUpdateGroup,
  onAddCategoryToGroup,
  onDragChange,
  onMove,
  onSetNotification,
}: {
  groups: CategoryGroup[];
  categories: CategoryDefinition[];
  selectedCategoryId: string;
  onSelect: (id: string) => void;
  onSelectGroup: (groupId: string) => void;
  onUpdateGroup: (group: CategoryGroup) => void;
  onAddCategoryToGroup: (groupId: string) => void;
  onDragChange: (dragging: boolean) => void;
  onMove: (
    categoryId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
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
      if (!group.expanded) continue;
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
        if (slot.kind === 'group')
          return (
            <View style={styles.groupHeader}>
              <Pressable
                onPress={() => {
                  onSelectGroup(slot.group.id);
                  onUpdateGroup({
                    ...slot.group,
                    expanded: !slot.group.expanded,
                  });
                }}
                style={styles.groupTitleButton}
              >
                <Text style={styles.groupTitle}>
                  {slot.group.expanded ? '−' : '+'} {slot.group.name}
                </Text>
                <Text style={styles.caption}>{slot.count} categories</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Add category to ${slot.group.name}`}
                accessibilityRole="button"
                onPress={() => onAddCategoryToGroup(slot.group.id)}
                style={styles.choiceAddButton}
              >
                <Text style={styles.choiceAddIcon}>+</Text>
              </Pressable>
            </View>
          );
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
            <Pressable
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
            <View
              accessibilityLabel={`Reorder ${category.name}`}
              accessibilityRole="adjustable"
              style={styles.dragHandle}
              {...panHandlers}
            >
              <Text style={styles.dragHandleText} selectable={false}>
                ⠿
              </Text>
            </View>
            {onSetNotification ? (
              <Pressable
                accessibilityLabel={`Set notification for ${category.name}`}
                accessibilityRole="button"
                onPress={() => onSetNotification(category)}
                style={styles.notificationButton}
              >
                <Settings color={colors.primary} size={18} />
              </Pressable>
            ) : null}
          </View>
        );
      }}
    />
  );
};

const CategoryDetails = ({
  category,
  onUpdate,
  onDelete,
  onDragChange,
}: {
  category: CategoryDefinition;
  onUpdate: (category: CategoryDefinition) => void;
  onDelete: () => void;
  onDragChange: (dragging: boolean) => void;
}) => {
  // Config changes that alter which series exist must rebuild the series list.
  const updateAndRecompute = (next: CategoryDefinition) =>
    onUpdate({ ...next, virtualSeries: recomputeVirtualSeries(next) });
  return (
    <View style={styles.details}>
      <Text style={styles.detailsTitle}>Selected category</Text>
      <Text style={styles.inputLabel}>Name</Text>
      <TextInput
        value={category.name}
        onChangeText={(name) => updateAndRecompute({ ...category, name })}
        style={styles.input}
        placeholder="Category name"
        placeholderTextColor={colors.placeholder}
      />
      <Text style={styles.inputLabel}>Type</Text>
      <View style={styles.segmented}>
        <Segment
          label="Choice"
          selected={category.kind === 'multiple-choice'}
          onPress={() =>
            onUpdate(switchCategoryKind(category, 'multiple-choice'))
          }
        />
        <Segment
          label="Number"
          selected={category.kind === 'number'}
          onPress={() => onUpdate(switchCategoryKind(category, 'number'))}
        />
        <Segment
          label="Duration"
          selected={category.kind === 'duration'}
          onPress={() => onUpdate(switchCategoryKind(category, 'duration'))}
        />
        <Segment
          label="Counter"
          selected={category.kind === 'counter'}
          onPress={() => onUpdate(switchCategoryKind(category, 'counter'))}
        />
        <Segment
          label="Notes"
          selected={category.kind === 'notes'}
          onPress={() => onUpdate(switchCategoryKind(category, 'notes'))}
        />
      </View>
      <SwitchRow
        label="Enabled"
        value={category.enabled}
        onChange={(enabled) => onUpdate({ ...category, enabled })}
      />
      <SwitchRow
        label="Allow notes"
        value={category.notesEnabled}
        onChange={(notesEnabled) =>
          updateAndRecompute({ ...category, notesEnabled })
        }
      />
      <SwitchRow
        label="Correlate only within this group"
        description="Restrict this category and its virtual series to correlations with categories in the same group, while retaining global series such as calendar data."
        value={category.correlateWithinGroup}
        onChange={(correlateWithinGroup) =>
          onUpdate({ ...category, correlateWithinGroup })
        }
      />
      {category.notesEnabled ? (
        <SwitchRow
          label="Analyze note sentiment locally"
          value={category.sentimentEnabled}
          onChange={(sentimentEnabled) =>
            updateAndRecompute({
              ...category,
              sentimentEnabled,
              ...(category.kind === 'notes'
                ? { notes: { sentimentEnabled } }
                : {}),
            })
          }
        />
      ) : null}
      {category.kind === 'multiple-choice' || category.kind === 'number' ? (
        <SwitchRow
          label="Calculate weekly effect"
          value={category.weeklyEffectEnabled}
          onChange={(weeklyEffectEnabled) =>
            onUpdate({ ...category, weeklyEffectEnabled })
          }
        />
      ) : null}
      <SwitchRow
        label="Allow multiple per day"
        value={category.allowMultiplePerDay}
        disabled={
          (category.kind === 'duration' && category.duration.splitEnabled) ||
          (category.kind === 'counter' && category.counter.splitEnabled)
        }
        onChange={(allowMultiplePerDay) =>
          updateAndRecompute({ ...category, allowMultiplePerDay })
        }
      />
      {category.allowMultiplePerDay ? (
        <AggregationEditor category={category} onUpdate={onUpdate} />
      ) : null}
      {category.kind === 'multiple-choice' ? (
        <ChoiceEditor
          multiSelect={category.multiSelect}
          options={category.options}
          onChange={(options) => onUpdate({ ...category, options })}
          onMultiSelectChange={(multiSelect) =>
            onUpdate({ ...category, multiSelect })
          }
          onDragChange={onDragChange}
        />
      ) : category.kind === 'number' ? (
        <NumericEditor category={category} onUpdate={onUpdate} />
      ) : category.kind === 'duration' ? (
        <DurationEditor category={category} onUpdate={onUpdate} />
      ) : category.kind === 'notes' ? (
        <NotesEditor />
      ) : (
        <CounterEditor category={category} onUpdate={onUpdate} />
      )}
      <VirtualSeriesEditor category={category} onUpdate={onUpdate} />
      <View style={styles.delete}>
        <Button
          title="Remove category"
          color={colors.danger}
          onPress={onDelete}
        />
      </View>
    </View>
  );
};

const GroupDetails = ({
  group,
  onUpdate,
  onDelete,
}: {
  group: CategoryGroup;
  onUpdate: (group: CategoryGroup) => void;
  onDelete: () => void;
}) => (
  <View style={styles.details}>
    <Text style={styles.detailsTitle}>Selected group</Text>
    <Text style={styles.inputLabel}>Name</Text>
    <TextInput
      value={group.name}
      onChangeText={(name) => onUpdate({ ...group, name })}
      style={styles.input}
      placeholder="Group name"
      placeholderTextColor={colors.placeholder}
    />
    <Text style={styles.caption}>
      Categories in this group: {group.categoryIds.length}
    </Text>
    <View style={styles.delete}>
      <Button title="Delete group" color={colors.danger} onPress={onDelete} />
    </View>
  </View>
);

const VirtualSeriesEditor = ({
  category,
  onUpdate,
}: {
  category: CategoryDefinition;
  onUpdate: (category: CategoryDefinition) => void;
}) => {
  const series: VirtualSeriesDefinition[] = category.virtualSeries.length
    ? category.virtualSeries
    : recomputeVirtualSeries(category);
  const inverse = series.find(
    (definition) => definition.transform === 'inverse',
  );
  const setSeries = (virtualSeries: VirtualSeriesDefinition[]) =>
    onUpdate({ ...category, virtualSeries });
  return (
    <View style={styles.configGroup}>
      <Text style={styles.inputLabel}>Virtual series</Text>
      {series
        .filter((definition) => definition.transform !== 'inverse')
        .map((definition) => (
          <SwitchRow
            key={definition.id}
            label={definition.name}
            description={describeVirtualSeries(definition)}
            value={definition.enabled !== false}
            onChange={(enabled) =>
              setSeries(
                series.map((candidate) =>
                  candidate.id === definition.id
                    ? { ...candidate, enabled }
                    : candidate,
                ),
              )
            }
          />
        ))}
      <SwitchRow
        label="Inverse main series"
        description={describeVirtualSeries(
          inverse ?? makeInverseSeries(category),
        )}
        value={Boolean(inverse?.enabled)}
        onChange={(enabled) =>
          setSeries([
            ...series.filter(
              (definition) => definition.transform !== 'inverse',
            ),
            { ...makeInverseSeries(category), enabled },
          ])
        }
      />
    </View>
  );
};

const AggregationEditor = ({
  category,
  onUpdate,
}: {
  category: CategoryDefinition;
  onUpdate: (category: CategoryDefinition) => void;
}) => (
  <View style={styles.configGroup}>
    <Text style={styles.inputLabel}>Main aggregation</Text>
    <View style={styles.aggregationChoices}>
      {(['mean', 'median', 'sum', 'product', 'min', 'max'] as const).map(
        (mainAggregation) => (
          <Pressable
            key={mainAggregation}
            onPress={() => onUpdate({ ...category, mainAggregation })}
            style={[
              styles.aggregationChoice,
              category.mainAggregation === mainAggregation &&
                styles.segmentSelected,
            ]}
          >
            <Text
              style={[
                styles.aggregationText,
                category.mainAggregation === mainAggregation &&
                  styles.segmentTextSelected,
              ]}
            >
              {mainAggregation}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  </View>
);

const CHOICE_ROW_HEIGHT = 44;

const ChoiceEditor = ({
  multiSelect,
  options,
  onChange,
  onMultiSelectChange,
  onDragChange,
}: {
  multiSelect: boolean;
  options: ChoiceOption[];
  onChange: (options: ChoiceOption[]) => void;
  onMultiSelectChange: (value: boolean) => void;
  onDragChange: (dragging: boolean) => void;
}) => {
  return (
    <View style={styles.choiceEditor}>
      <Text style={styles.inputLabel}>Choices</Text>
      <SwitchRow
        label="Allow multiple selections"
        value={multiSelect}
        onChange={onMultiSelectChange}
      />
      <DraggableList
        items={options}
        keyFor={(option) => option.id}
        gapStyle={styles.dropGap}
        fallbackHeightFor={() => CHOICE_ROW_HEIGHT}
        onDragChange={onDragChange}
        onDrop={(from, to) =>
          onChange(normalizeChoiceOptions(moveToDropIndex(options, from, to)))
        }
        renderItem={(option, { held, panHandlers }) => (
          <View style={[styles.choiceRow, held && styles.categoryDragging]}>
            <View
              accessibilityLabel={`Reorder ${option.label}`}
              accessibilityRole="adjustable"
              style={styles.dragHandle}
              {...panHandlers}
            >
              <Text style={styles.dragHandleText} selectable={false}>
                ⠿
              </Text>
            </View>
            <Text style={styles.choiceIndex}>{option.value}</Text>
            <TextInput
              value={option.label}
              onChangeText={(label) =>
                onChange(
                  options.map((candidate) =>
                    candidate.id === option.id
                      ? { ...candidate, label }
                      : candidate,
                  ),
                )
              }
              style={[styles.input, styles.choiceInput]}
            />
            <TextInput
              value={`${option.value}`}
              keyboardType="decimal-pad"
              onChangeText={(value) => {
                const numericValue = Number(value);
                if (Number.isFinite(numericValue)) {
                  onChange(
                    options.map((candidate) =>
                      candidate.id === option.id
                        ? { ...candidate, value: numericValue }
                        : candidate,
                    ),
                  );
                }
              }}
              style={styles.choiceValueInput}
              accessibilityLabel={`Value for ${option.label}`}
            />
            <Pressable
              onPress={() =>
                onChange(
                  normalizeChoiceOptions(
                    options.filter((candidate) => candidate.id !== option.id),
                  ),
                )
              }
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
      <View style={styles.choiceAddRow}>
        <Pressable
          accessibilityLabel="Add choice"
          accessibilityRole="button"
          onPress={() =>
            onChange(
              normalizeChoiceOptions([
                ...options,
                createChoiceOption(options.length),
              ]),
            )
          }
          style={styles.choiceAddButton}
        >
          <Text style={styles.choiceAddIcon}>+</Text>
        </Pressable>
      </View>
    </View>
  );
};

const NumericEditor = ({
  category,
  onUpdate,
}: {
  category: Extract<CategoryDefinition, { kind: 'number' }>;
  onUpdate: (category: CategoryDefinition) => void;
}) => {
  const update = (key: 'min' | 'max' | 'step', value: string) =>
    onUpdate({
      ...category,
      range: { ...category.range, [key]: Number(value) || 0 },
    });
  return (
    <View style={styles.numeric}>
      <Text style={styles.inputLabel}>Range</Text>
      <View style={styles.numericRow}>
        {(['min', 'max', 'step'] as const).map((key) => (
          <View key={key} style={styles.numericField}>
            <Text style={styles.caption}>{key}</Text>
            <TextInput
              value={`${category.range[key]}`}
              keyboardType="decimal-pad"
              onChangeText={(value) => update(key, value)}
              style={styles.input}
            />
          </View>
        ))}
      </View>
    </View>
  );
};

const DurationEditor = ({
  category,
  onUpdate,
}: {
  category: Extract<CategoryDefinition, { kind: 'duration' }>;
  onUpdate: (category: CategoryDefinition) => void;
}) => (
  <View style={styles.configGroup}>
    <SwitchRow
      label="Show reset button"
      value={category.duration.resetEnabled}
      onChange={(resetEnabled) =>
        onUpdate({
          ...category,
          duration: { ...category.duration, resetEnabled },
        })
      }
    />
    <SwitchRow
      label="Cumulative duration"
      value={category.duration.cumulative}
      onChange={(cumulative) =>
        onUpdate({
          ...category,
          duration: { ...category.duration, cumulative },
        })
      }
    />
    <SwitchRow
      label="Animate timer"
      value={category.duration.animate}
      onChange={(animate) =>
        onUpdate({ ...category, duration: { ...category.duration, animate } })
      }
    />
    <SwitchRow
      label="Show split / lap"
      value={category.duration.splitEnabled}
      onChange={(splitEnabled) =>
        onUpdate({
          ...category,
          duration: { ...category.duration, splitEnabled },
        })
      }
    />
    <SwitchRow
      label="Show milliseconds"
      value={category.duration.showMilliseconds}
      onChange={(showMilliseconds) =>
        onUpdate({
          ...category,
          duration: { ...category.duration, showMilliseconds },
        })
      }
    />
  </View>
);

const CounterEditor = ({
  category,
  onUpdate,
}: {
  category: Extract<CategoryDefinition, { kind: 'counter' }>;
  onUpdate: (category: CategoryDefinition) => void;
}) => {
  const [stepsText, setStepsText] = useState(category.counter.steps.join(', '));
  const updateSteps = (text: string) => {
    setStepsText(text);
    const steps = text
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value !== 0);
    if (steps.length)
      onUpdate({ ...category, counter: { ...category.counter, steps } });
  };
  return (
    <View style={styles.configGroup}>
      <Text style={styles.inputLabel}>Step options</Text>
      <TextInput
        value={stepsText}
        onChangeText={updateSteps}
        onBlur={() => setStepsText(category.counter.steps.join(', '))}
        keyboardType="numbers-and-punctuation"
        style={styles.input}
        placeholder="-10, -5, -1, 1, 5, 10"
        placeholderTextColor={colors.placeholder}
      />
      <SwitchRow
        label="Show reset button"
        value={category.counter.resetEnabled}
        onChange={(resetEnabled) =>
          onUpdate({
            ...category,
            counter: { ...category.counter, resetEnabled },
          })
        }
      />
      <SwitchRow
        label="Allow direct editing"
        value={category.counter.editable}
        onChange={(editable) =>
          onUpdate({ ...category, counter: { ...category.counter, editable } })
        }
      />
      <SwitchRow
        label="Show split / lap"
        value={category.counter.splitEnabled}
        onChange={(splitEnabled) =>
          onUpdate({
            ...category,
            counter: { ...category.counter, splitEnabled },
          })
        }
      />
    </View>
  );
};

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  mobileModal: { flex: 1, backgroundColor: colors.canvas },
  desktopBackdrop: { backgroundColor: 'rgba(15, 23, 42, 0.35)', flex: 1 },
  desktopPanel: {
    borderRightColor: colors.border,
    borderRightWidth: 1,
    paddingTop: 24,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  headingTitle: { color: colors.text, fontSize: 23, fontWeight: '700' },
  caption: { color: colors.muted, fontSize: 12, marginTop: 2 },
  addRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  categoryScroller: { flex: 1 },
  categoryList: { paddingHorizontal: 18, paddingBottom: 28 },
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupHeader: { alignItems: 'center', flexDirection: 'row', padding: 12 },
  groupTitleButton: { flex: 1 },
  groupTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  categoryRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categorySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  categoryDisabled: { opacity: 0.45 },
  categoryDragging: {
    borderColor: colors.primary,
    elevation: 4,
    shadowColor: '#0f172a',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 2,
  },
  dropLine: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 3,
    marginBottom: 5,
  },
  dropGap: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: 8,
  },
  dragHandle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : {}),
  },
  dragHandleText: { color: colors.muted, fontSize: 20, lineHeight: 22 },
  notificationButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  notificationButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  categoryText: { flex: 1 },
  categoryName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  moveControls: { flexDirection: 'row', gap: 8, marginLeft: 10 },
  moveButton: { paddingVertical: 7, paddingHorizontal: 4 },
  moveText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  muted: { color: colors.muted },
  details: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    marginTop: 10,
  },
  detailsTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  inputLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: '#fff',
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  segmentSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentTextSelected: { color: '#fff' },
  configGroup: { marginTop: 4 },
  aggregationChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aggregationChoice: {
    borderColor: colors.border,
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  aggregationText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  choiceEditor: { marginTop: 4 },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 7,
  },
  choiceIndex: { color: colors.primary, fontWeight: '700', width: 14 },
  choiceInput: { flex: 1, minWidth: 96 },
  choiceValueInput: { width: 70 },
  remove: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  choiceAddRow: { marginLeft: 22, marginTop: 10 },
  choiceAddButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  choiceAddIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 32,
    transform: [{ translateY: -2.5 }],
  },
  numeric: { marginTop: 4 },
  numericRow: { flexDirection: 'row', gap: 8 },
  numericField: { flex: 1 },
  delete: { marginTop: 14 },
});
