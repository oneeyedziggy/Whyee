import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { confirmAction } from '../lib/confirm';
import { getLocalTimeStamp, makeRecordKey } from '../lib/dates';
import { buildEntry } from '../lib/entries';
import { colors } from '../theme/tokens';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
  EventTimeCategory,
} from '../types/category';
import { styles } from './categoryInputStyles';
import { CounterInput } from './CounterInput';
import { DurationInput } from './DurationInput';
import { NoteField } from './NoteField';
import { TimeEditor } from './TimeEditor';

interface CategoryInputCardProps {
  category: CategoryDefinition;
  entries: CategorySelectionRecord[];
  dateKey: string;
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
  onDeleteEntry?: (entry: CategorySelectionRecord) => void;
  activeDurationRecordKey?: string;
}

export const CategoryInputCard = ({
  category,
  entries,
  dateKey,
  onChange,
  onAddEntry,
  onDeleteEntry,
  activeDurationRecordKey,
}: CategoryInputCardProps) => {
  const entryList = entries.length ? entries : [null];
  const splitOwnsNewEntry =
    (category.kind === 'duration' && category.duration.splitEnabled) ||
    (category.kind === 'counter' && category.counter.splitEnabled);
  // Split laps are separate records but read as one timer, so the current lap owns the whole
  // display and the earlier laps are handed to it instead of getting their own entry blocks.
  const laps =
    category.kind === 'duration' && category.duration.splitEnabled
      ? entries.slice(0, -1)
      : [];
  const visibleEntries = laps.length ? entryList.slice(laps.length) : entryList;
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{category.name}</Text>
      {visibleEntries.map((entry, offset) => {
        const index = laps.length + offset;
        return (
          <DailyEntry
            key={entry?.key ?? makeRecordKey(dateKey, index, category.id)}
            category={category}
            entry={entry}
            entries={entries}
            index={index}
            dateKey={dateKey}
            isLast={offset === visibleEntries.length - 1}
            laps={offset === 0 ? laps : []}
            onChange={onChange}
            onAddEntry={onAddEntry}
            onDelete={entry ? () => onDeleteEntry?.(entry) : undefined}
            onDeleteLap={onDeleteEntry}
            activeDurationRecordKey={activeDurationRecordKey}
          />
        );
      })}
      {category.allowMultiplePerDay && !splitOwnsNewEntry ? (
        <Pressable
          accessibilityLabel={`Add ${category.name} entry`}
          onPress={() => {
            // With no saved records the first block is an unsaved placeholder; materialize
            // it as entry #1 so this press visibly adds a second set of inputs.
            if (!entries.length) onAddEntry();
            onAddEntry();
          }}
          style={styles.addEntry}
        >
          <Text style={styles.addEntryText}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const DailyEntry = ({
  category,
  entry,
  entries,
  index,
  dateKey,
  isLast,
  laps,
  onChange,
  onDelete,
  onDeleteLap,
  onAddEntry,
  activeDurationRecordKey,
}: {
  category: CategoryDefinition;
  entry: CategorySelectionRecord | null;
  entries: CategorySelectionRecord[];
  index: number;
  dateKey: string;
  isLast: boolean;
  laps: CategorySelectionRecord[];
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
  activeDurationRecordKey?: string;
  onDelete?: () => void;
  onDeleteLap?: (entry: CategorySelectionRecord) => void;
}) => {
  const selectedValue = entry?.value ?? null;
  const selectedValues =
    entry?.selectedValues ?? (selectedValue === null ? [] : [selectedValue]);
  const patchEntry = (patch: Partial<CategorySelectionRecord>) =>
    onChange(buildEntry(category, entry, index, dateKey, patch));

  const control =
    category.kind === 'duration' ? (
      <DurationInput
        category={category}
        entry={entry}
        index={index}
        dateKey={dateKey}
        isLast={isLast}
        laps={laps}
        onChange={onChange}
        onDeleteLap={onDeleteLap}
        onAddEntry={onAddEntry}
        blocked={Boolean(
          activeDurationRecordKey && entry?.key !== activeDurationRecordKey,
        )}
      />
    ) : category.kind === 'counter' ? (
      <CounterInput
        category={category}
        entry={entry}
        entries={entries}
        index={index}
        dateKey={dateKey}
        isLast={isLast}
        onChange={onChange}
        onAddEntry={onAddEntry}
      />
    ) : category.kind === 'notes' ? null : category.kind ===
      'multiple-choice' ? (
      <ChoiceOptions
        options={category.options}
        selectedValues={selectedValues}
        showOptionValues={category.showOptionValues === true}
        onSelect={(option) => {
          const selected = selectedValues.includes(option.value);
          const nextValues = category.multiSelect
            ? selected
              ? selectedValues.filter((value) => value !== option.value)
              : [...selectedValues, option.value]
            : [option.value];
          patchEntry({
            value: nextValues.reduce((sum, value) => sum + value, 0),
            selectedValues: nextValues,
          });
        }}
      />
    ) : category.kind === 'event-time' ? (
      <EventTimeInput
        category={category}
        entry={entry}
        onStamp={() => patchEntry({ localTime: getLocalTimeStamp() })}
        onChangeTime={(value) =>
          patchEntry({ localTime: getLocalTimeStamp(value) })
        }
      />
    ) : (
      <NumberInput
        category={category}
        selectedValue={selectedValue}
        onChange={(value) => patchEntry({ value })}
      />
    );

  return (
    <View style={styles.entryBlock}>
      {control}
      {category.notesEnabled || category.kind === 'notes' ? (
        <NoteField
          value={entry?.noteText ?? ''}
          score={entry?.sentimentScore}
          sentimentEnabled={category.sentimentEnabled}
          placeholder={
            category.kind === 'notes' ? 'Write a note' : 'Add a note'
          }
          onChangeText={(noteText) => patchEntry({ noteText })}
          onScore={(sentimentScore, noteText) =>
            patchEntry(
              category.kind === 'notes'
                ? { sentimentScore, noteText, value: sentimentScore }
                : { sentimentScore, noteText },
            )
          }
        />
      ) : null}
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            confirmAction(
              'Delete entry?',
              'This removes only this daily instance.',
              'Delete',
              onDelete,
            )
          }
          style={styles.removeEntryButton}
        >
          <Text style={styles.removeEntry}>Remove entry</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

// The event's datum is the entry timestamp itself: logging stamps the current wall-clock time
// and the editor rewrites the record's localTime while keeping its date.
const EventTimeInput = ({
  category,
  entry,
  onStamp,
  onChangeTime,
}: {
  category: EventTimeCategory;
  entry: CategorySelectionRecord | null;
  onStamp: () => void;
  onChangeTime: (value: Date) => void;
}) => {
  if (!entry)
    return (
      <View style={styles.durationButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Log ${category.name} now`}
          onPress={onStamp}
          style={styles.actionButton}
        >
          <Text style={styles.actionText}>Log now</Text>
        </Pressable>
      </View>
    );
  const timestamp = `${entry.dateKey}T${entry.localTime}`;
  return (
    <TimeEditor
      label="Time"
      timestamp={Number.isFinite(Date.parse(timestamp)) ? timestamp : undefined}
      showMilliseconds={false}
      is24Hour={category.eventTime.use24HourClock}
      allowRollover={false}
      onChange={onChangeTime}
      // Without min/max bounds a same-day commit cannot be rejected.
      onReject={() => undefined}
      rejectMessage="Enter a valid time of day."
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${category.name} time to now`}
          onPress={onStamp}
          style={styles.actionButton}
        >
          <Text style={styles.actionText}>Now</Text>
        </Pressable>
      }
    />
  );
};

const ChoiceOptions = ({
  options,
  selectedValues,
  showOptionValues,
  onSelect,
}: {
  options: Array<{ id: string; label: string; value: number }>;
  selectedValues: number[];
  showOptionValues: boolean;
  onSelect: (option: { id: string; label: string; value: number }) => void;
}) => {
  const [available, setAvailable] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const measured = options.every((option) => widths[option.id] !== undefined);
  const needed = options.reduce(
    (total, option) => total + (widths[option.id] ?? 0),
    0,
  );
  // Either every option shares one row, or each option gets its own row.
  const stacked =
    measured && available > 0 && needed + (options.length - 1) * 8 > available;
  return (
    <View
      style={[styles.options, stacked && styles.optionsStacked]}
      onLayout={(event) => setAvailable(event.nativeEvent.layout.width)}
    >
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option)}
            onLayout={(event) => {
              if (stacked) return;
              const width = event.nativeEvent.layout.width;
              setWidths((current) =>
                current[option.id] === width
                  ? current
                  : { ...current, [option.id]: width },
              );
            }}
            style={[
              styles.option,
              stacked && styles.optionStacked,
              selected && styles.optionSelected,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.optionLabel,
                selected && styles.optionLabelSelected,
              ]}
            >
              {showOptionValues
                ? `${option.label} (Value: ${option.value})`
                : option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const NumberInput = ({
  category,
  selectedValue,
  onChange,
}: {
  category: Extract<CategoryDefinition, { kind: 'number' }>;
  selectedValue: number | null;
  onChange: (value: number) => void;
}) => (
  <View style={styles.sliderArea}>
    <Text style={styles.value}>{selectedValue ?? category.range.min}</Text>
    <Slider
      value={selectedValue ?? category.range.min}
      minimumValue={category.range.min}
      maximumValue={category.range.max}
      step={category.range.step}
      minimumTrackTintColor={colors.primary}
      maximumTrackTintColor={colors.border}
      thumbTintColor={colors.primary}
      onValueChange={onChange}
    />
    <View style={styles.range}>
      <Text style={styles.optionValue}>{category.range.min}</Text>
      <Text style={styles.optionValue}>{category.range.max}</Text>
    </View>
  </View>
);
