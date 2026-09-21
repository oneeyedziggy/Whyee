import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  editDurationStopTime,
  getDurationIntervals,
  stopDurationRecord,
} from '../lib/durationTimers';
import { getLocalDateKey, getLocalTimeStamp } from '../lib/dates';
import { colors } from '../theme/tokens';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';

interface CarryoverTimerSectionProps {
  records: CategorySelectionRecord[];
  categories: CategoryDefinition[];
  oldestRunningByCategory: Map<string, CategorySelectionRecord>;
  onChange: (record: CategorySelectionRecord) => void;
}

export const CarryoverTimerSection = ({
  records,
  categories,
  oldestRunningByCategory,
  onChange,
}: CarryoverTimerSectionProps) => {
  const [expanded, setExpanded] = useState(true);
  if (!records.length) return null;
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.header}
      >
        <Text style={styles.title}>Carried-over timers ({records.length})</Text>
        <Text style={styles.chevron}>{expanded ? '\u2212' : '+'}</Text>
      </Pressable>
      {expanded
        ? records.map((record) => {
            const category = categoriesById.get(record.categoryId);
            if (!category || category.kind !== 'duration') return null;
            const blocker = oldestRunningByCategory.get(record.categoryId);
            const actionable = Boolean(
              record.stopTime || !blocker || blocker.key === record.key,
            );
            return (
              <CarryoverTimerRow
                key={record.key}
                category={category}
                record={record}
                actionable={actionable}
                onChange={onChange}
              />
            );
          })
        : null}
    </View>
  );
};

const CarryoverTimerRow = ({
  category,
  record,
  actionable,
  onChange,
}: {
  category: Extract<CategoryDefinition, { kind: 'duration' }>;
  record: CategorySelectionRecord;
  actionable: boolean;
  onChange: (record: CategorySelectionRecord) => void;
}) => {
  const running = Boolean(record.startTime && !record.stopTime);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!running || !category.duration.animate) return undefined;
    const timer = setInterval(
      () => setNow(Date.now()),
      category.duration.showMilliseconds ? 37 : 1000,
    );
    return () => clearInterval(timer);
  }, [category.duration.animate, category.duration.showMilliseconds, running]);
  const elapsed = getDurationIntervals(record, now).reduce(
    (sum, interval) => sum + interval.durationMs,
    0,
  );
  const stop = () => {
    const next = stopDurationRecord(
      record,
      new Date(),
      category.duration.showMilliseconds,
    );
    if (next) onChange(next);
  };
  const editStop = (value: Date) => {
    const next = editDurationStopTime(
      record,
      value,
      category.duration.showMilliseconds,
    );
    if (!next) {
      setNotice('Stop date and time cannot be earlier than the start.');
      return;
    }
    setNotice('');
    onChange(next);
  };
  const startedAt = record.startTime ? new Date(record.startTime) : null;
  return (
    <View style={styles.row}>
      <View style={styles.summary}>
        <View>
          <Text style={styles.name}>{category.name}</Text>
          <Text style={styles.meta}>
            Started {startedAt ? startedAt.toLocaleString() : 'unknown'}
          </Text>
        </View>
        <View style={styles.statusBlock}>
          <Text style={styles.elapsed}>
            {formatDuration(elapsed, category.duration.showMilliseconds)}
          </Text>
          <Text style={styles.status}>{running ? 'Running' : 'Stopped'}</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityLabel={`Stop ${category.name} timer`}
          disabled={!running || !actionable}
          onPress={stop}
          style={[
            styles.stopButton,
            (!running || !actionable) && styles.disabled,
          ]}
        >
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
        <StopDateTimeEditor
          timestamp={record.stopTime}
          fallbackTimestamp={running ? now : undefined}
          disabled={!actionable}
          showMilliseconds={category.duration.showMilliseconds}
          onChange={editStop}
          onReject={setNotice}
        />
      </View>
      {!actionable ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          Stop the older {category.name} timer first.
        </Text>
      ) : notice ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
};

const StopDateTimeEditor = ({
  timestamp,
  fallbackTimestamp,
  disabled,
  showMilliseconds,
  onChange,
  onReject,
}: {
  timestamp?: string;
  fallbackTimestamp?: number;
  disabled: boolean;
  showMilliseconds: boolean;
  onChange: (value: Date) => void;
  onReject: (message: string) => void;
}) => {
  const initial = timestamp
    ? new Date(timestamp)
    : new Date(fallbackTimestamp ?? Date.now());
  const [dateText, setDateText] = useState(getLocalDateKey(initial));
  const [timeText, setTimeText] = useState(getLocalTimeStamp(initial));
  useEffect(() => {
    if (!timestamp) return;
    const value = new Date(timestamp);
    setDateText(getLocalDateKey(value));
    setTimeText(
      `${getLocalTimeStamp(value)}${
        showMilliseconds
          ? `.${value.getMilliseconds().toString().padStart(3, '0')}`
          : ''
      }`,
    );
  }, [showMilliseconds, timestamp]);
  const commit = () => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
    const timeMatch = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(
      timeText,
    );
    if (!dateMatch || !timeMatch) {
      onReject('Enter a valid stop date and time.');
      return;
    }
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const seconds = Number(timeMatch[3]);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hours > 23 ||
      minutes > 59 ||
      seconds > 59
    ) {
      onReject('Enter a valid stop date and time.');
      return;
    }
    const value = new Date(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds,
      Number((timeMatch[4] ?? '0').padEnd(3, '0')),
    );
    if (
      value.getFullYear() !== year ||
      value.getMonth() !== month - 1 ||
      value.getDate() !== day
    ) {
      onReject('Enter a valid stop date and time.');
      return;
    }
    onReject('');
    onChange(value);
  };
  return (
    <View style={styles.editor}>
      <Text style={styles.meta}>Stop date and time</Text>
      <View style={styles.editorFields}>
        <TextInput
          accessibilityLabel="Stop date"
          editable={!disabled}
          onBlur={commit}
          onChangeText={setDateText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, disabled && styles.inputDisabled]}
          value={dateText}
        />
        <TextInput
          accessibilityLabel="Stop time"
          editable={!disabled}
          onBlur={commit}
          onChangeText={setTimeText}
          placeholder={showMilliseconds ? 'HH:MM:SS.mmm' : 'HH:MM:SS'}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, disabled && styles.inputDisabled]}
          value={timeText}
        />
      </View>
    </View>
  );
};

const formatDuration = (
  milliseconds: number,
  showMilliseconds: boolean,
): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return showMilliseconds
    ? `${base}.${Math.floor(milliseconds % 1000)
        .toString()
        .padStart(3, '0')}`
    : base;
};

const styles = StyleSheet.create({
  section: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    marginBottom: 14,
    paddingBottom: 10,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chevron: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  row: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 12,
  },
  summary: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  statusBlock: { alignItems: 'flex-end' },
  elapsed: { color: colors.text, fontSize: 16, fontWeight: '700' },
  status: { color: colors.muted, fontSize: 12 },
  controls: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  stopButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stopText: { color: colors.surface, fontWeight: '700', textAlign: 'center' },
  disabled: { backgroundColor: colors.border },
  editor: { flex: 1, minWidth: 230 },
  editorFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    flexGrow: 1,
    minWidth: 104,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  inputDisabled: { color: colors.muted },
  notice: { color: colors.danger, fontSize: 12, marginTop: 8 },
});