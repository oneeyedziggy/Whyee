import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import { isStatisticEnabled, type StatisticsSettings } from '../lib/statistics';
import {
  autocorrelation,
  daysAgo,
  mean,
  median,
  mode,
  slope,
} from '../lib/summaryStats';
import {
  compareValues,
  nextSortDirection,
  type SortDirection,
} from '../lib/sort';
import { colors } from '../theme/tokens';
import { Panel } from './Panel';
import { SortHeader } from './SortHeader';
import type { WeeklyEffectResult } from '../lib/weeklyEffects';

// Rough bold-11px glyph width; wide enough for headers to avoid wrapping while
// still shrinking short labels (e.g. "Mean") well below long ones (e.g. "Autocorrelation").
const estimateColumnWidth = (label: string) =>
  Math.max(56, Math.ceil(label.length * 6.2) + 28);

interface SummaryPanelProps {
  categories: CategoryDefinition[];
  records: Record<string, CategorySelectionRecord>;
  recentDays: number;
  settings: StatisticsSettings;
  weeklyEffects: WeeklyEffectResult[];
}

export const SummaryPanel = ({
  categories,
  records,
  recentDays,
  settings,
  weeklyEffects,
}: SummaryPanelProps) => {
  const needsAllTimeValues = [
    'summary.mean.all',
    'summary.median.all',
    'summary.mode.all',
    'summary.slope.all',
    'summary.autocorrelation',
  ].some((id) => isStatisticEnabled(settings, id as keyof typeof settings));
  const needsRecentValues = [
    'summary.mean.recent',
    'summary.median.recent',
    'summary.mode.recent',
    'summary.slope.recent',
  ].some((id) => isStatisticEnabled(settings, id as keyof typeof settings));
  const rows = useMemo(
    () =>
      categories.map((category) => {
        const categoryRecords = Object.values(records)
          .filter((record) => record.categoryId === category.id)
          .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
        const values = needsAllTimeValues
          ? categoryRecords.map((record) => record.value)
          : [];
        const recentValues = needsRecentValues
          ? categoryRecords
              .filter(
                (record) => daysAgo(record.dateKey, new Date()) < recentDays,
              )
              .map((record) => record.value)
          : [];
        return { category, values, recentValues };
      }),
    [categories, needsAllTimeValues, needsRecentValues, records, recentDays],
  );
  const columns = [
    [
      'summary.mean.all',
      'Mean',
      (row: (typeof rows)[number]) => mean(row.values),
      'Average of every logged value for this category.',
    ],
    [
      'summary.mean.recent',
      `Mean ${recentDays}d`,
      (row: (typeof rows)[number]) => mean(row.recentValues),
      `Average of only the last ${recentDays} days of entries, instead of the full history.`,
    ],
    [
      'summary.median.all',
      'Median',
      (row: (typeof rows)[number]) => median(row.values),
      'The middle value when every entry is sorted low to high.',
    ],
    [
      'summary.median.recent',
      `Median ${recentDays}d`,
      (row: (typeof rows)[number]) => median(row.recentValues),
      `The middle value among only the last ${recentDays} days of entries.`,
    ],
    [
      'summary.mode.all',
      'Mode',
      (row: (typeof rows)[number]) => mode(row.values),
      'The most frequently logged value across every entry.',
    ],
    [
      'summary.mode.recent',
      `Mode ${recentDays}d`,
      (row: (typeof rows)[number]) => mode(row.recentValues),
      `The most frequently logged value in the last ${recentDays} days.`,
    ],
    [
      'summary.slope.all',
      'Slope',
      (row: (typeof rows)[number]) => slope(row.values),
      'Trend direction and steepness across every entry: positive means values are rising over time, negative means falling.',
    ],
    [
      'summary.slope.recent',
      `Slope ${recentDays}d`,
      (row: (typeof rows)[number]) => slope(row.recentValues),
      `Trend direction and steepness over just the last ${recentDays} days.`,
    ],
    [
      'summary.autocorrelation',
      'Autocorrelation',
      (row: (typeof rows)[number]) => autocorrelation(row.values, recentDays),
      `How strongly a value on one day predicts the value ${recentDays} days later, from -1 (opposite) to 1 (matching); near 0 means no relationship.`,
    ],
    [
      'summary.weekly-effect',
      'Weekly',
      (row: (typeof rows)[number]) =>
        weeklyEffects.find((effect) => effect.categoryId === row.category.id)
          ?.score ?? null,
      'Strength of a repeating weekly pattern in this category, from 0 (none) to 1 (strong).',
    ],
    [
      'summary.weekly-phase',
      'Weekday',
      (row: (typeof rows)[number]) =>
        weeklyEffects.find((effect) => effect.categoryId === row.category.id)
          ?.weekday ?? null,
      'The day of week the weekly pattern is centered on.',
    ],
    [
      'summary.weekly-offset',
      'Weekly +d',
      (row: (typeof rows)[number]) =>
        weeklyEffects.find((effect) => effect.categoryId === row.category.id)
          ?.offset ?? null,
      'How many days after that weekday the pattern peaks.',
    ],
  ] as const;
  const enabledColumns = columns.filter(([id]) =>
    isStatisticEnabled(settings, id),
  );
  // Size each column to its own header label instead of the widest column overall.
  const columnWidths = useMemo(
    () =>
      Object.fromEntries(
        enabledColumns.map(([id, label]) => [id, estimateColumnWidth(label)]),
      ),
    [enabledColumns],
  );
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('default');
  const selectSortColumn = (column: string) => {
    if (column !== sortColumn) {
      setSortColumn(column);
      setSortDirection('asc');
      return;
    }
    setSortDirection((current) => nextSortDirection(current));
  };
  const sortedRows = useMemo(() => {
    if (sortDirection === 'default' || !sortColumn) return rows;
    const column = enabledColumns.find(([id]) => id === sortColumn);
    return [...rows].sort((left, right) => {
      const leftValue =
        sortColumn === 'category'
          ? left.category.name
          : (column?.[2](left) ?? null);
      const rightValue =
        sortColumn === 'category'
          ? right.category.name
          : (column?.[2](right) ?? null);
      return (
        compareValues(leftValue, rightValue) *
        (sortDirection === 'asc' ? 1 : -1)
      );
    });
  }, [enabledColumns, rows, sortColumn, sortDirection]);
  return (
    <Panel
      title="Category statistics"
      subtitle="Summary values for enabled categories and their observed numeric values."
      infoSection="statistics"
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.header}>
            <SortHeader
              label="Category"
              direction={sortColumn === 'category' ? sortDirection : 'default'}
              onPress={() => selectSortColumn('category')}
              style={styles.category}
            />
            {enabledColumns.map(([id, label, , hint]) => (
              <SortHeader
                key={id}
                label={label}
                hint={hint}
                direction={sortColumn === id ? sortDirection : 'default'}
                onPress={() => selectSortColumn(id)}
                style={[styles.value, { width: columnWidths[id] }]}
              />
            ))}
          </View>
          <ScrollView style={styles.body} nestedScrollEnabled>
            {sortedRows.map((row) => (
              <View key={row.category.id} style={styles.row}>
                <Text style={styles.category} numberOfLines={1}>
                  {row.category.name}
                </Text>
                {enabledColumns.map(([id, , calculate]) => {
                  const value = calculate(row);
                  return (
                    <Text
                      key={id}
                      style={[styles.value, { width: columnWidths[id] }]}
                    >
                      {value === null ? '--' : value.toFixed(2)}
                    </Text>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </Panel>
  );
};

const styles = StyleSheet.create({
  header: { backgroundColor: '#eef3f8', flexDirection: 'row' },
  body: {
    maxHeight: 320,
  },
  row: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  category: { color: colors.text, fontSize: 12, padding: 8, width: 150 },
  value: {
    color: colors.text,
    fontSize: 11,
    padding: 8,
    textAlign: 'center',
  },
  sortHeaderContent: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sortGlyphs: {
    alignItems: 'center',
    flexDirection: 'column',
    marginLeft: 4,
  },
  sortGlyph: {
    color: '#b9c3cf',
    fontSize: 9,
    lineHeight: 9,
  },
  sortGlyphIdle: { color: '#b9c3cf' },
  sortGlyphActive: { color: colors.text },
  headerText: { color: colors.text, fontSize: 11, fontWeight: '700' },
});
