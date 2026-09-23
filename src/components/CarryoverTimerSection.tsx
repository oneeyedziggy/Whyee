import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DurationInput } from './CategoryInputCard';
import { calendarDayDiff, formatHumanDate } from '../lib/dates';
import { colors } from '../theme/tokens';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';

interface CarryoverTimerSectionProps {
  records: CategorySelectionRecord[];
  categories: CategoryDefinition[];
  oldestRunningByCategory: Map<string, CategorySelectionRecord>;
  viewedDateKey: string;
  onChange: (record: CategorySelectionRecord) => void;
}

export const CarryoverTimerSection = ({
  records,
  categories,
  oldestRunningByCategory,
  viewedDateKey,
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
                viewedDateKey={viewedDateKey}
                onChange={onChange}
              />
            );
          })
        : null}
    </View>
  );
};

const formatOffset = (days: number): string =>
  `${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'}`;

const CarryoverTimerRow = ({
  category,
  record,
  actionable,
  viewedDateKey,
  onChange,
}: {
  category: Extract<CategoryDefinition, { kind: 'duration' }>;
  record: CategorySelectionRecord;
  actionable: boolean;
  viewedDateKey: string;
  onChange: (record: CategorySelectionRecord) => void;
}) => {
  const running = Boolean(record.startTime && !record.stopTime);
  const viewedDate = new Date(`${viewedDateKey}T00:00:00`);
  const startDate = record.startTime ? new Date(record.startTime) : null;
  // Start is always in the past relative to a carryover's viewed date, so its offset is negative;
  // the end (stop, or "still running" as of now) offset is only shown when it's NOT this same date.
  const startOffset = startDate ? calendarDayDiff(viewedDate, startDate) : 0;
  const endDate = record.stopTime ? new Date(record.stopTime) : new Date();
  const endOffset = calendarDayDiff(viewedDate, endDate);
  return (
    <View style={styles.row}>
      <Text style={styles.name}>{category.name}</Text>
      {startDate ? (
        <Text style={styles.meta}>
          Started {formatOffset(startOffset)} ({formatHumanDate(startDate)})
        </Text>
      ) : null}
      {endOffset !== 0 ? (
        <Text style={styles.meta}>
          {running ? 'Still running' : 'Stopped'} {formatOffset(endOffset)} (
          {formatHumanDate(endDate)})
        </Text>
      ) : null}
      <DurationInput
        category={category}
        entry={record}
        entries={[record]}
        index={0}
        dateKey={record.dateKey}
        isLast
        onChange={onChange}
        onAddEntry={() => {}}
        blocked={!actionable}
        carryoverMode
      />
      {!actionable ? (
        <Text accessibilityRole="alert" style={styles.notice}>
          Stop the older {category.name} timer first.
        </Text>
      ) : null}
    </View>
  );
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
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  notice: { color: colors.danger, fontSize: 12, marginTop: 8 },
});
