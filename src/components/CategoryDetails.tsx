import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AppButton } from './AppButton';
import {
  createChoiceOption,
  hasPrintableChoiceLabel,
  normalizeChoiceOptions,
  recomputeVirtualSeries,
  switchCategoryKind,
} from '../lib/category';
import { confirmAction } from '../lib/confirm';
import { HoverTitle } from './HoverTitle';
import { isGroupEnabled } from '../lib/groups';
import {
  describeVirtualSeries,
  inverseSeriesDescription,
} from '../lib/virtualSeries';
import { moveToDropIndex } from '../hooks/useDragReorder';
import { colors } from '../theme/tokens';
import type {
  CategoryDefinition,
  CategoryGroup,
  CategoryKind,
  ChoiceOption,
  VirtualSeriesDefinition,
} from '../types/category';
import {
  AddButton,
  HintLabel,
  NotesEditor,
  Segment,
  SeriesToggleHeader,
  SeriesToggleRow,
  SwitchRow,
} from './CategoryEditorControls';
import { DraggableList } from './DraggableList';
import { styles } from './categoryEditorStyles';

export const CategoryDetails = ({
  category,
  entryCount = 0,
  onUpdate,
  onDelete,
  onDragChange,
}: {
  category: CategoryDefinition;
  entryCount?: number;
  onUpdate: (category: CategoryDefinition) => void;
  onDelete: () => void;
  onDragChange: (dragging: boolean) => void;
}) => {
  // Config changes that alter which series exist must rebuild the series list.
  const updateAndRecompute = (next: CategoryDefinition) =>
    onUpdate({ ...next, virtualSeries: recomputeVirtualSeries(next) });
  const switchType = (kind: CategoryKind) => {
    if (kind === category.kind) return;
    const apply = () => onUpdate(switchCategoryKind(category, kind));
    if (!entryCount) {
      apply();
      return;
    }
    confirmAction(
      'Change category type?',
      `"${category.name}" has ${entryCount} logged ${entryCount === 1 ? 'entry' : 'entries'}. They stay saved, but may not display, chart, or correlate as expected under the new type. Switching back restores this type's settings.`,
      'Change type',
      apply,
    );
  };
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
          onPress={() => switchType('multiple-choice')}
        />
        <Segment
          label="Number"
          selected={category.kind === 'number'}
          onPress={() => switchType('number')}
        />
        <Segment
          label="Duration"
          selected={category.kind === 'duration'}
          onPress={() => switchType('duration')}
        />
        <Segment
          label="Counter"
          selected={category.kind === 'counter'}
          onPress={() => switchType('counter')}
        />
        <Segment
          label="Notes"
          selected={category.kind === 'notes'}
          onPress={() => switchType('notes')}
        />
      </View>
      <SwitchRow
        label="Enabled"
        value={category.enabled}
        onChange={(enabled) => onUpdate({ ...category, enabled })}
      />
      <SwitchRow
        label="Allow notes"
        description="Adds a free-text note field to each entry for this category."
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
          description="Scores each note from negative to positive on this device and adds the score as its own series for correlation. Notes never leave the device."
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
        <>
          <SwitchRow
            label="Correlate with weekdays"
            description="Adds Sunday through Saturday series (1 on that weekday, 0 on every other day with data) and correlates this category against each one. Weekday series are never correlated with each other."
            value={category.weeklyEffectEnabled}
            onChange={(weeklyEffectEnabled) =>
              onUpdate({ ...category, weeklyEffectEnabled })
            }
          />
          <SwitchRow
            label="Correlate with inverse weekdays"
            description="Adds Not Sunday through Not Saturday series (0 on that weekday, 1 on every other day with data) and correlates this category against each one."
            value={category.weeklyEffectInverseEnabled === true}
            onChange={(weeklyEffectInverseEnabled) =>
              onUpdate({ ...category, weeklyEffectInverseEnabled })
            }
          />
        </>
      ) : null}
      <SwitchRow
        label="Allow multiple per day"
        description="Lets you record several separate entries on the same day and adds daily summary series (mean, sum, count, and more) below. Always on while split / lap is enabled."
        value={category.allowMultiplePerDay}
        disabled={
          (category.kind === 'duration' && category.duration.splitEnabled) ||
          (category.kind === 'counter' && category.counter.splitEnabled)
        }
        onChange={(allowMultiplePerDay) =>
          updateAndRecompute({ ...category, allowMultiplePerDay })
        }
      />
      {category.kind === 'multiple-choice' ? (
        <ChoiceEditor
          multiSelect={category.multiSelect}
          allowMultiplePerDay={category.allowMultiplePerDay}
          showOptionValues={category.showOptionValues === true}
          optionSeriesMode={category.optionSeriesMode}
          optionOccurrenceMode={category.optionOccurrenceMode}
          options={category.options}
          onChange={(options) => updateAndRecompute({ ...category, options })}
          onMultiSelectChange={(multiSelect) =>
            onUpdate({ ...category, multiSelect })
          }
          onOptionSeriesModeChange={(optionSeriesMode) =>
            updateAndRecompute({ ...category, optionSeriesMode })
          }
          onOptionOccurrenceModeChange={(optionOccurrenceMode) =>
            updateAndRecompute({ ...category, optionOccurrenceMode })
          }
          onShowOptionValuesChange={(showOptionValues) =>
            onUpdate({ ...category, showOptionValues })
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
        <AppButton
          size="block"
          variant="danger"
          title="Remove category"
          onPress={() =>
            confirmAction(
              'Delete category',
              `Delete "${category.name}"? This cannot be undone.`,
              'Delete',
              onDelete,
            )
          }
        />
      </View>
    </View>
  );
};

export const GroupDetails = ({
  group,
  onUpdate,
  onToggleEnabled,
  onDelete,
}: {
  group: CategoryGroup;
  onUpdate: (group: CategoryGroup) => void;
  onToggleEnabled: (enabled: boolean) => void;
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
    <SwitchRow
      label="Enabled"
      description="Disabling a group turns off all of its categories; re-enabling restores each category's own previous setting."
      value={isGroupEnabled(group)}
      onChange={onToggleEnabled}
    />
    <Text style={styles.caption}>
      {isGroupEnabled(group)
        ? `Categories in this group: ${group.categoryIds.length}`
        : `Disabling a group turns its ${group.categoryIds.length} categories off and restores their own settings when re-enabled.`}
    </Text>
    <View style={styles.delete}>
      <AppButton
        size="block"
        variant="danger"
        title="Delete group"
        onPress={onDelete}
      />
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
  const update = (id: string, patch: Partial<VirtualSeriesDefinition>) =>
    onUpdate({
      ...category,
      virtualSeries: series.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate,
      ),
    });
  const groups = new Map<string, VirtualSeriesDefinition[]>();
  for (const definition of series)
    groups.set(definition.group ?? '', [
      ...(groups.get(definition.group ?? '') ?? []),
      definition,
    ]);
  return (
    <View style={styles.configGroup}>
      <HintLabel
        label="Virtual series"
        description={`Series derived from this category that are correlated with other categories. ${inverseSeriesDescription}`}
      />
      <SeriesToggleHeader />
      {[...groups].map(([group, definitions]) => (
        <View key={group || 'ungrouped'}>
          {group ? <Text style={styles.inputLabel}>{group}</Text> : null}
          {definitions.map((definition) => (
            <SeriesToggleRow
              key={definition.id}
              label={definition.name}
              description={describeVirtualSeries(definition)}
              nested={Boolean(group)}
              inverse={definition.inverseEnabled === true}
              main={definition.enabled !== false}
              onInverseChange={(inverseEnabled) =>
                update(definition.id, { inverseEnabled })
              }
              onMainChange={(enabled) => update(definition.id, { enabled })}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

const CHOICE_ROW_HEIGHT = 44;

const ChoiceEditor = ({
  multiSelect,
  allowMultiplePerDay,
  showOptionValues,
  optionSeriesMode,
  optionOccurrenceMode,
  options,
  onChange,
  onMultiSelectChange,
  onOptionSeriesModeChange,
  onOptionOccurrenceModeChange,
  onShowOptionValuesChange,
  onDragChange,
}: {
  multiSelect: boolean;
  allowMultiplePerDay: boolean;
  showOptionValues: boolean;
  optionSeriesMode: 'intensity' | 'items';
  optionOccurrenceMode: 'sum' | 'capped';
  options: ChoiceOption[];
  onChange: (options: ChoiceOption[]) => void;
  onMultiSelectChange: (value: boolean) => void;
  onOptionSeriesModeChange: (value: 'intensity' | 'items') => void;
  onOptionOccurrenceModeChange: (value: 'sum' | 'capped') => void;
  onShowOptionValuesChange: (value: boolean) => void;
  onDragChange: (dragging: boolean) => void;
}) => {
  // An option can only be selected more than once a day via multi-select or repeated entries.
  const canRepeatPerDay = multiSelect || allowMultiplePerDay;
  const invalidOptionLabels = options.some(
    (option) => !hasPrintableChoiceLabel(option.label),
  );
  return (
    <View style={styles.choiceEditor}>
      <Text style={styles.inputLabel}>Choices</Text>
      <SwitchRow
        label="Allow multiple selections"
        description="Lets one entry select more than one choice at the same time."
        value={multiSelect}
        onChange={onMultiSelectChange}
      />
      <SwitchRow
        label="Show option values"
        description="Shows each choice's numeric value beside its name in daily entry."
        value={showOptionValues}
        disabled={showOptionValues && invalidOptionLabels}
        onChange={onShowOptionValuesChange}
      />
      {showOptionValues && invalidOptionLabels ? (
        <Text style={styles.choiceLabelNotice}>
          Add a printable name to every choice before hiding its value.
        </Text>
      ) : null}
      <View style={styles.configGroup}>
        <HintLabel
          label="Correlate as"
          description="Quality / Quantity / Intensity treats choice values as one scale. Separate items gives each choice its own series, either summing repeat selections or counting any selection as 1."
        />
        <View style={styles.segmented}>
          <Segment
            label="Quality / Quantity / Intensity"
            selected={optionSeriesMode === 'intensity'}
            onPress={() => onOptionSeriesModeChange('intensity')}
          />
          <Segment
            label="Separate items"
            selected={optionSeriesMode === 'items'}
            onPress={() => onOptionSeriesModeChange('items')}
          />
        </View>
        {canRepeatPerDay && optionSeriesMode === 'items' ? (
          <View style={styles.segmented}>
            <Segment
              label="Sum occurrences"
              selected={optionOccurrenceMode === 'sum'}
              onPress={() => onOptionOccurrenceModeChange('sum')}
            />
            <Segment
              label="Any = 1"
              selected={optionOccurrenceMode === 'capped'}
              onPress={() => onOptionOccurrenceModeChange('capped')}
            />
          </View>
        ) : null}
      </View>
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
                {'\u283f'}
              </Text>
            </View>
            <Text style={styles.choiceIndex}>{option.value}</Text>
            <ChoiceLabelInput
              option={option}
              allowBlank={showOptionValues}
              index={options.indexOf(option)}
              onChange={(label) =>
                onChange(
                  options.map((candidate) =>
                    candidate.id === option.id
                      ? { ...candidate, label }
                      : candidate,
                  ),
                )
              }
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
            <HoverTitle text={`Delete choice ${option.label}`}>
              <Pressable
                accessibilityLabel={`Delete choice ${option.label}`}
                accessibilityHint={`Removes ${option.label} from this category.`}
                accessibilityRole="button"
                hitSlop={6}
                onPress={() =>
                  onChange(
                    normalizeChoiceOptions(
                      options.filter((candidate) => candidate.id !== option.id),
                    ),
                  )
                }
                style={styles.choiceRemove}
              >
                <Text style={styles.choiceRemoveIcon} selectable={false}>
                  {'\u2715'}
                </Text>
              </Pressable>
            </HoverTitle>
          </View>
        )}
      />
      <View style={styles.choiceAddRow}>
        <AddButton
          accessibilityLabel="Add choice"
          accessibilityHint="Adds a new choice option to this category."
          text="Add"
          onPress={() =>
            onChange(
              normalizeChoiceOptions([
                ...options,
                createChoiceOption(options.length),
              ]),
            )
          }
        />
      </View>
    </View>
  );
};

const ChoiceLabelInput = ({
  option,
  allowBlank,
  index,
  onChange,
}: {
  option: ChoiceOption;
  allowBlank: boolean;
  index: number;
  onChange: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(option.label);
  const invalid = !allowBlank && !hasPrintableChoiceLabel(draft);
  useEffect(() => setDraft(option.label), [option.label]);
  return (
    <TextInput
      accessibilityLabel={`Name for choice ${index + 1}`}
      value={draft}
      onChangeText={(value) => {
        setDraft(value);
        if (allowBlank || hasPrintableChoiceLabel(value)) onChange(value);
      }}
      onBlur={() => {
        if (invalid) setDraft(option.label);
      }}
      style={[
        styles.input,
        styles.choiceInput,
        invalid && styles.choiceLabelInvalid,
      ]}
    />
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
      description="Shows a Reset button that clears the timer's recorded time for the entry."
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
      description="Saved with the category but not yet used by timing or correlations."
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
      description="Updates the elapsed time on screen while the timer runs. Turn off to save battery."
      value={category.duration.animate}
      onChange={(animate) =>
        onUpdate({ ...category, duration: { ...category.duration, animate } })
      }
    />
    <SwitchRow
      label="Show split / lap"
      description="Adds a Split button that ends the current lap and starts a new one, keeping each lap as its own entry."
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
      description="Displays and stores durations to the millisecond instead of rounding to whole seconds."
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
        description="Shows a Reset button that sets the counter back to zero."
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
        description="Lets you type the counter value directly instead of only using the step buttons."
        value={category.counter.editable}
        onChange={(editable) =>
          onUpdate({ ...category, counter: { ...category.counter, editable } })
        }
      />
      <SwitchRow
        label="Show split / lap"
        description="Adds a Split button that closes the current count and starts a new one, keeping each as its own entry."
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
