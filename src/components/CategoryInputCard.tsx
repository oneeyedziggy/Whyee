import Slider from '@react-native-community/slider';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import {
  getLocalDateKey,
  getLocalTimeStamp,
  makeRecordKey,
} from '../lib/dates';
import { confirmAction } from '../lib/confirm';
import {
  applyDurationPrecision,
  editDurationStopTime,
  stopDurationRecord,
} from '../lib/durationTimers';
import { scoreSentiment } from '../lib/sentiment';
import { colors } from '../theme/tokens';

const SENTIMENT_DEBOUNCE_MS = 900;

// Sub-second precision is retained on the record but hidden from every derived number.
interface CategoryInputCardProps {
  category: CategoryDefinition;
  entries: CategorySelectionRecord[];
  dateKey: string;
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
  onDeleteEntry?: (entry: CategorySelectionRecord) => void;
  activeDurationRecordKey?: string;
}

// Patch must land after the existing entry so edits are never overwritten by stale fields.
const buildEntry = (
  category: CategoryDefinition,
  entry: CategorySelectionRecord | null,
  index: number,
  dateKey: string,
  patch: Partial<CategorySelectionRecord>,
): CategorySelectionRecord => {
  const ordinal = entry?.ordinal ?? index;
  return {
    key: entry?.key ?? makeRecordKey(dateKey, ordinal, category.id),
    categoryId: category.id,
    dateKey: entry?.dateKey ?? dateKey,
    ordinal,
    localTime: entry?.localTime ?? getLocalTimeStamp(),
    value: 0,
    instanceId: entry?.instanceId ?? `${category.id}:${ordinal}`,
    ...entry,
    ...patch,
  };
};

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
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{category.name}</Text>
      {entryList.map((entry, index) => (
        <DailyEntry
          key={entry?.key ?? makeRecordKey(dateKey, index, category.id)}
          category={category}
          entry={entry}
          entries={entries}
          index={index}
          dateKey={dateKey}
          isLast={index === entryList.length - 1}
          onChange={onChange}
          onAddEntry={onAddEntry}
          onDelete={entry ? () => onDeleteEntry?.(entry) : undefined}
          activeDurationRecordKey={activeDurationRecordKey}
        />
      ))}
      {category.allowMultiplePerDay && !splitOwnsNewEntry ? (
        <Pressable
          accessibilityLabel={`Add ${category.name} entry`}
          onPress={() => onAddEntry()}
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
  onChange,
  onDelete,
  onAddEntry,
  activeDurationRecordKey,
}: {
  category: CategoryDefinition;
  entry: CategorySelectionRecord | null;
  entries: CategorySelectionRecord[];
  index: number;
  dateKey: string;
  isLast: boolean;
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
  activeDurationRecordKey?: string;
  onDelete?: () => void;
}) => {
  const selectedValue = entry?.value ?? null;
  const confirmDelete = () => {
    if (!onDelete) return;
    confirmAction(
      'Delete entry?',
      'This removes only this daily instance.',
      'Delete',
      onDelete,
    );
  };
  const selectedValues =
    entry?.selectedValues ?? (selectedValue === null ? [] : [selectedValue]);
  const patchEntry = (patch: Partial<CategorySelectionRecord>) =>
    onChange(buildEntry(category, entry, index, dateKey, patch));
  const updateValue = (value: number) => patchEntry({ value });
  const updateNote = (noteText: string) => patchEntry({ noteText });
  const updateSentiment = (sentimentScore: number, noteText: string) =>
    patchEntry(
      category.kind === 'notes'
        ? { sentimentScore, noteText, value: sentimentScore }
        : { sentimentScore, noteText },
    );

  const control =
    category.kind === 'duration' ? (
      <DurationInput
        category={category}
        entry={entry}
        entries={entries}
        index={index}
        dateKey={dateKey}
        isLast={isLast}
        onChange={onChange}
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
    ) : (
      <NumberInput
        category={category}
        selectedValue={selectedValue}
        onChange={updateValue}
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
          onChangeText={updateNote}
          onScore={updateSentiment}
        />
      ) : null}
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          onPress={confirmDelete}
          style={styles.removeEntryButton}
        >
          <Text style={styles.removeEntry}>Remove entry</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const ChoiceOptions = ({
  options,
  selectedValues,
  onSelect,
}: {
  options: Array<{ id: string; label: string; value: number }>;
  selectedValues: number[];
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
              {option.label}
            </Text>
            <Text
              style={[
                styles.optionValue,
                selected && styles.optionLabelSelected,
              ]}
            >
              Value {option.value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const NoteField = ({
  value,
  score,
  sentimentEnabled,
  placeholder,
  onChangeText,
  onScore,
}: {
  value: string;
  score?: number;
  sentimentEnabled: boolean;
  placeholder: string;
  onChangeText: (text: string) => void;
  onScore: (score: number, text: string) => void;
}) => {
  const [scoring, setScoring] = useState(false);
  const [text, setText] = useState(value);
  // The record round-trips a render behind, so the input owns its own text.
  const emitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const handleChange = (next: string) => {
    emitted.current = next;
    setText(next);
    onChangeText(next);
    if (!sentimentEnabled) return;
    if (timer.current) clearTimeout(timer.current);
    setScoring(true);
    timer.current = setTimeout(() => {
      setScoring(false);
      onScore(next.trim() ? scoreSentiment(next) : 0, next);
    }, SENTIMENT_DEBOUNCE_MS);
  };
  return (
    <View style={styles.noteField}>
      <TextInput
        multiline
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={styles.notesInput}
      />
      {sentimentEnabled ? (
        <View style={styles.sentimentRow}>
          <Text style={styles.sentimentLabel}>Sentiment</Text>
          {scoring ? (
            <ActivityIndicator
              accessibilityLabel="Calculating sentiment"
              color={colors.primary}
              size="small"
            />
          ) : (
            <Text style={styles.sentimentScore}>
              {value.trim() ? (score ?? 0).toFixed(2) : '—'}
            </Text>
          )}
          <Text style={styles.sentimentLegend}>
            −5 negative · 0 neutral · +5 positive
          </Text>
        </View>
      ) : null}
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

const DurationInput = ({
  category,
  entry,
  entries,
  index,
  dateKey,
  isLast,
  onChange,
  onAddEntry,
  blocked,
}: {
  category: Extract<CategoryDefinition, { kind: 'duration' }>;
  entry: CategorySelectionRecord | null;
  entries: CategorySelectionRecord[];
  index: number;
  dateKey: string;
  isLast: boolean;
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
  blocked: boolean;
}) => {
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const { showMilliseconds } = category.duration;
  const running = Boolean(entry?.startTime && !entry.stopTime);
  const patchEntry = (patch: Partial<CategorySelectionRecord>) =>
    onChange(buildEntry(category, entry, index, dateKey, patch));
  useEffect(() => {
    if (!running || !category.duration.animate) return undefined;
    const timer = setInterval(
      () => setNow(Date.now()),
      showMilliseconds ? 37 : 1000,
    );
    return () => clearInterval(timer);
  }, [category.duration.animate, showMilliseconds, running]);
  const storeTotal = (exact: number, patch: Partial<CategorySelectionRecord>) =>
    patchEntry({
      ...patch,
      durationMsExact: exact,
      durationMs: applyDurationPrecision(exact, showMilliseconds),
      value: applyDurationPrecision(exact, showMilliseconds),
    });
  // Restarting keeps whatever has already been banked; only Reset clears it.
  const start = () => {
    const startedAt = new Date();
    setNow(startedAt.getTime());
    setNotice('');
    patchEntry({
      localTime: entry?.localTime ?? getLocalTimeStamp(startedAt),
      startTime: startedAt.toISOString(),
      stopTime: undefined,
    });
  };
  const stop = () => {
    if (!entry?.startTime) return;
    const next = stopDurationRecord(entry, new Date(), showMilliseconds);
    if (next) onChange(next);
  };
  const reset = () => {
    if (!entry) return;
    setNotice('');
    patchEntry({
      startTime: undefined,
      stopTime: undefined,
      durationMs: 0,
      durationMsExact: 0,
      durationRuns: [],
      value: 0,
    });
  };
  const split = () => {
    if (!entry?.startTime) return;
    stop();
    onAddEntry({ startTime: new Date().toISOString() });
  };
  const bankedMs = (entry?.durationRuns ?? []).reduce(
    (sum, run) => sum + run.durationMs,
    0,
  );
  const lapMs = running ? now - Date.parse(entry?.startTime ?? '') : 0;
  const totalMs = bankedMs + lapMs;
  const lastRunMs = entry?.durationRuns?.length
    ? entry.durationRuns[entry.durationRuns.length - 1].durationMs
    : 0;
  const secondaryMs = running ? lapMs : lastRunMs;
  const editTimestamp = (field: 'startTime' | 'stopTime', value: Date) => {
    if (!entry) return;
    const startMs =
      field === 'startTime'
        ? value.getTime()
        : entry.startTime
          ? Date.parse(entry.startTime)
          : null;
    const stopMs =
      field === 'stopTime'
        ? value.getTime()
        : entry.stopTime
          ? Date.parse(entry.stopTime)
          : null;
    if (startMs !== null && stopMs !== null && stopMs < startMs) {
      setNotice(
        field === 'startTime'
          ? 'Start time cannot be later than the stop time.'
          : 'Stop time cannot be earlier than the start time.',
      );
      return;
    }
    setNotice('');
    if (field === 'stopTime') {
      const next = editDurationStopTime(entry, value, showMilliseconds);
      if (next) onChange(next);
      return;
    }
    const next = { ...entry, [field]: value.toISOString() };
    const exact =
      startMs !== null && stopMs !== null
        ? stopMs - startMs
        : (entry.durationMsExact ?? entry.durationMs ?? 0);
    onChange({
      ...next,
      durationMsExact: exact,
      durationMs: applyDurationPrecision(exact, showMilliseconds),
      value: applyDurationPrecision(exact, showMilliseconds),
    });
  };
  const showLap =
    category.duration.splitEnabled &&
    secondaryMs > 0 &&
    secondaryMs !== totalMs;
  return (
    <View>
      <View style={styles.primaryValueRow}>
        <Text style={styles.durationValue}>
          {formatDuration(
            applyDurationPrecision(totalMs, showMilliseconds),
            showMilliseconds,
          )}
        </Text>
        {showLap ? (
          <Text style={styles.secondaryValue}>
            (
            {formatDuration(
              applyDurationPrecision(secondaryMs, showMilliseconds),
              showMilliseconds,
            )}
            )
          </Text>
        ) : null}
      </View>
      <View style={styles.durationButtons}>
        <Pressable
          disabled={running || blocked}
          onPress={start}
          style={[
            styles.actionButton,
            (running || blocked) && styles.disabledButton,
          ]}
        >
          <Text style={styles.actionText}>Start</Text>
        </Pressable>
        <Pressable
          disabled={!running || blocked}
          onPress={stop}
          style={[
            styles.actionButton,
            (!running || blocked) && styles.disabledButton,
          ]}
        >
          <Text style={styles.actionText}>Stop</Text>
        </Pressable>
        {category.duration.splitEnabled && isLast ? (
          <Pressable
            disabled={!running || blocked}
            onPress={split}
            style={[
              styles.actionButton,
              (!running || blocked) && styles.disabledButton,
            ]}
          >
            <Text style={styles.actionText}>Split</Text>
          </Pressable>
        ) : null}
        {category.duration.resetEnabled && isLast ? (
          <Pressable
            disabled={blocked}
            onPress={reset}
            style={[styles.resetButton, blocked && styles.disabledButton]}
          >
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {entry?.startTime ? (
        <View style={styles.timeFields}>
          <TimeEditor
            label="Start time"
            timestamp={entry.startTime}
            showMilliseconds={showMilliseconds}
            maxTimestamp={entry.stopTime}
            onChange={(value) => editTimestamp('startTime', value)}
            onReject={setNotice}
            rejectMessage="Start time cannot be later than the stop time."
            disabled={blocked}
          />
          <TimeEditor
            label="Stop time"
            timestamp={entry.stopTime}
            showMilliseconds={showMilliseconds}
            minTimestamp={entry.startTime}
            onChange={(value) => editTimestamp('stopTime', value)}
            onReject={setNotice}
            rejectMessage="Stop time cannot be earlier than the start time."
            disabled={blocked}
          />
        </View>
      ) : null}
    </View>
  );
};

const CounterInput = ({
  category,
  entry,
  entries,
  index,
  dateKey,
  isLast,
  onChange,
  onAddEntry,
}: {
  category: Extract<CategoryDefinition, { kind: 'counter' }>;
  entry: CategorySelectionRecord | null;
  entries: CategorySelectionRecord[];
  index: number;
  dateKey: string;
  isLast: boolean;
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
}) => {
  const value = entry?.value ?? 0;
  const [draft, setDraft] = useState<string | null>(null);
  const update = (next: number) => {
    setDraft(null);
    onChange(buildEntry(category, entry, index, dateKey, { value: next }));
  };
  const reset = () =>
    confirmAction(
      'Reset counter?',
      'Set this counter back to zero?',
      'Reset',
      () => update(0),
    );
  const cumulative = entries.reduce(
    (sum, candidate) => sum + candidate.value,
    0,
  );
  const showCumulative = isLast && entries.length > 1;
  return (
    <View>
      <View style={styles.primaryValueRow}>
        {category.counter.editable ? (
          <TextInput
            accessibilityLabel={`${category.name} value`}
            value={draft ?? `${showCumulative ? cumulative : value}`}
            keyboardType="numbers-and-punctuation"
            onChangeText={(text) => {
              setDraft(text);
              const parsed = Number(text);
              if (text.trim() && Number.isFinite(parsed)) update(parsed);
            }}
            onBlur={() => setDraft(null)}
            style={styles.counterValueInput}
          />
        ) : (
          <Text style={styles.counterValue}>
            {showCumulative ? cumulative : value}
          </Text>
        )}
        {showCumulative ? (
          <Text style={styles.secondaryValue}>({value})</Text>
        ) : null}
      </View>
      <View style={styles.counterButtons}>
        {category.counter.steps.map((step) => (
          <Pressable
            key={step}
            onPress={() => update(value + step)}
            style={styles.actionButton}
          >
            <Text style={styles.actionText}>
              {step > 0 ? `+${step}` : step}
            </Text>
          </Pressable>
        ))}
        {category.counter.resetEnabled && isLast ? (
          <Pressable onPress={reset} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
        {category.counter.splitEnabled && isLast ? (
          <Pressable onPress={() => onAddEntry()} style={styles.actionButton}>
            <Text style={styles.actionText}>Split</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const TimeEditor = ({
  label,
  timestamp,
  showMilliseconds,
  minTimestamp,
  maxTimestamp,
  rejectMessage,
  onChange,
  onReject,
  disabled = false,
}: {
  label: string;
  timestamp?: string;
  showMilliseconds: boolean;
  minTimestamp?: string;
  maxTimestamp?: string;
  rejectMessage: string;
  onChange: (value: Date) => void;
  onReject: (message: string) => void;
  disabled?: boolean;
}) => {
  const initialDate = timestamp ? new Date(timestamp) : new Date();
  const [hours, setHours] = useState(initialDate.getHours());
  const [minutes, setMinutes] = useState(initialDate.getMinutes());
  const [seconds, setSeconds] = useState(initialDate.getSeconds());
  const [milliseconds, setMilliseconds] = useState(
    initialDate.getMilliseconds(),
  );
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatStartedAt = useRef(0);
  useEffect(
    () => () => {
      if (repeatTimer.current) clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    },
    [],
  );
  const [text, setText] = useState(
    formatTime(hours, minutes, seconds, milliseconds, showMilliseconds),
  );

  useEffect(() => {
    const date = timestamp ? new Date(timestamp) : new Date();
    const nextText = formatTime(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
      showMilliseconds,
    );
    setHours(date.getHours());
    setMinutes(date.getMinutes());
    setSeconds(date.getSeconds());
    setMilliseconds(date.getMilliseconds());
    setText(nextText);
  }, [showMilliseconds, timestamp]);

  const withinBounds = (candidate: Date): boolean => {
    const time = candidate.getTime();
    if (minTimestamp && time < Date.parse(minTimestamp)) return false;
    if (maxTimestamp && time > Date.parse(maxTimestamp)) return false;
    return true;
  };
  const commit = (
    nextHours: number,
    nextMinutes: number,
    nextSeconds: number,
    nextMilliseconds: number,
  ) => {
    const date = timestamp ? new Date(timestamp) : new Date();
    date.setHours(nextHours, nextMinutes, nextSeconds, nextMilliseconds);
    if (!withinBounds(date)) {
      onReject(rejectMessage);
      return;
    }
    onReject('');
    setText(
      formatTime(
        nextHours,
        nextMinutes,
        nextSeconds,
        nextMilliseconds,
        showMilliseconds,
      ),
    );
    onChange(date);
  };
  const candidateFor = (
    field: 'hours' | 'minutes' | 'seconds' | 'milliseconds',
    delta: number,
  ): Date => {
    const date = timestamp ? new Date(timestamp) : new Date();
    date.setHours(hours, minutes, seconds, milliseconds);
    const amount =
      field === 'hours'
        ? delta * 3600000
        : field === 'minutes'
          ? delta * 60000
          : field === 'seconds'
            ? delta * 1000
            : delta;
    date.setTime(date.getTime() + amount);
    return date;
  };
  const adjust = (
    field: 'hours' | 'minutes' | 'seconds' | 'milliseconds',
    delta: number,
  ) => {
    const date = candidateFor(field, delta);
    commit(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    );
  };
  const stopRepeating = () => {
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatTimer.current = null;
  };
  const startRepeating = (
    field: 'hours' | 'minutes' | 'seconds' | 'milliseconds',
    delta: number,
  ) => {
    stopRepeating();
    repeatStartedAt.current = Date.now();
    repeatTimer.current = setInterval(() => {
      const elapsed = Date.now() - repeatStartedAt.current;
      const multiplier =
        elapsed > 4000 ? 10 : elapsed > 2000 ? 5 : elapsed > 800 ? 2 : 1;
      adjust(field, delta * multiplier);
    }, 180);
  };
  const parseText = (value: string) => {
    setText(value);
    const match = value.match(
      /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/,
    );
    if (!match) return;
    const nextHours = Math.min(23, Number(match[1]));
    const nextMinutes = Math.min(59, Number(match[2]));
    const nextSeconds = Math.min(59, Number(match[3] ?? 0));
    const nextMilliseconds = Number((match[4] ?? '0').padEnd(3, '0'));
    setHours(nextHours);
    setMinutes(nextMinutes);
    setSeconds(nextSeconds);
    setMilliseconds(nextMilliseconds);
    commit(nextHours, nextMinutes, nextSeconds, nextMilliseconds);
  };
  const fields: Array<'hours' | 'minutes' | 'seconds' | 'milliseconds'> = [
    'hours',
    'minutes',
    'seconds',
    ...(showMilliseconds ? (['milliseconds'] as const) : []),
  ];
  return (
    <View style={styles.timeEditor}>
      <Text style={styles.help}>{label}</Text>
      <TextInput
        editable={!disabled}
        value={text}
        onChangeText={parseText}
        placeholder={showMilliseconds ? 'HH:MM:SS.mmm' : 'HH:MM:SS'}
        placeholderTextColor={colors.placeholder}
        style={styles.timeInput}
      />
      <View style={styles.stepperRow}>
        {fields.map((field) => {
          const canIncrease = withinBounds(candidateFor(field, 1));
          const canDecrease = withinBounds(candidateFor(field, -1));
          return (
            <View key={field} style={styles.stepper}>
              <Pressable
                accessibilityLabel={`Increase ${label} ${stepLabels[field]}`}
                disabled={disabled || !canIncrease}
                onPress={() => adjust(field, 1)}
                onPressIn={() => canIncrease && startRepeating(field, 1)}
                onPressOut={stopRepeating}
                style={[
                  styles.stepButton,
                  (disabled || !canIncrease) && styles.stepBlocked,
                ]}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
              <Text style={styles.stepValue}>
                {field === 'hours'
                  ? hours
                  : field === 'minutes'
                    ? minutes
                    : field === 'seconds'
                      ? seconds
                      : milliseconds}
              </Text>
              <Pressable
                accessibilityLabel={`Decrease ${label} ${stepLabels[field]}`}
                disabled={disabled || !canDecrease}
                onPress={() => adjust(field, -1)}
                onPressIn={() => canDecrease && startRepeating(field, -1)}
                onPressOut={stopRepeating}
                style={[
                  styles.stepButton,
                  (disabled || !canDecrease) && styles.stepBlocked,
                ]}
              >
                <Text style={styles.stepText}>-</Text>
              </Pressable>
              <Text style={styles.stepLabel}>{stepLabels[field]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const stepLabels = {
  hours: 'HOUR',
  minutes: 'MIN',
  seconds: 'SEC',
  milliseconds: 'MS',
} as const;

const formatTime = (
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
  showMilliseconds: boolean,
): string => {
  const base = [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
  return showMilliseconds
    ? `${base}.${milliseconds.toString().padStart(3, '0')}`
    : base;
};

const formatDuration = (
  milliseconds: number,
  showMilliseconds: boolean,
): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return showMilliseconds
    ? `${base}.${(milliseconds % 1000).toString().padStart(3, '0')}`
    : base;
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  help: { color: colors.muted, fontSize: 13, marginTop: 3 },
  entryBlock: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
  },
  options: { flexDirection: 'row', gap: 8, marginTop: 12 },
  optionsStacked: { flexDirection: 'column' },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionStacked: { flexShrink: 1, width: '100%' },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  optionLabelSelected: { color: '#ffffff' },
  optionValue: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sliderArea: { marginTop: 10 },
  value: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  range: { flexDirection: 'row', justifyContent: 'space-between' },
  primaryValueRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  secondaryValue: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  notice: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  durationValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  durationButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  disabledButton: { backgroundColor: colors.border },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  counterValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  counterValueInput: {
    borderColor: 'transparent',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderWidth: 1,
    color: colors.primary,
    fontSize: 28,
    fontWeight: '700',
    minWidth: 96,
    paddingVertical: 2,
    textAlign: 'center',
  },
  counterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
  },
  resetButton: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  resetText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  addEntry: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    marginTop: 10,
    width: 32,
  },
  addEntryText: { color: colors.primary, fontSize: 22, lineHeight: 25 },
  removeEntryButton: { alignSelf: 'flex-end' },
  removeEntry: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    textAlign: 'right',
  },
  timeFields: { flexDirection: 'row', gap: 12, marginTop: 10 },
  timeInput: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    padding: 6,
    textAlign: 'center',
  },
  timeEditor: { flex: 1, marginTop: 8 },
  stepperRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  stepper: { alignItems: 'center', flex: 1, minWidth: 0 },
  stepBlocked: { backgroundColor: colors.border, borderColor: colors.border },
  stepButton: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 5,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: '100%',
  },
  stepText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  stepValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 4,
  },
  stepLabel: { color: colors.muted, fontSize: 9, textTransform: 'uppercase' },
  noteField: { marginTop: 2 },
  sentimentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    minHeight: 20,
  },
  sentimentLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sentimentScore: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sentimentLegend: { color: colors.muted, fontSize: 11 },
  notesInput: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    color: colors.text,
    marginTop: 10,
    minHeight: 72,
    padding: 10,
    textAlignVertical: 'top',
  },
});
