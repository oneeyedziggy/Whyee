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
import { formatDurationValue } from '../lib/durationFormat';
import {
  compareValues,
  nextSortDirection,
  type SortDirection,
} from '../lib/sort';
import { colors } from '../theme/tokens';
import { Panel } from './Panel';
import { SortHeader } from './SortHeader';

// Bold 11px label plus the sort glyph and the cell's 8px side padding.
const estimateColumnWidth = (label: string) =>
  Math.max(64, Math.ceil(label.length * 7.2) + 44);

const estimateCellWidth = (text: string) => Math.ceil(text.length * 6.1) + 18;

// Columns whose value is in the category's own units, so duration categories report milliseconds.
const durationStatIds = new Set<string>([
  'summary.mean.all',
  'summary.mean.recent',
  'summary.median.all',
  'summary.median.recent',
  'summary.mode.all',
  'summary.mode.recent',
  'summary.slope.all',
  'summary.slope.recent',
]);

const formatStat = (
  category: CategoryDefinition,
  id: string,
  value: number | null,
): string => {
  if (value === null) return '--';
  if (category.kind === 'duration' && durationStatIds.has(id))
    return formatDurationValue(value, category.duration.showMilliseconds);
  return value.toFixed(2);
};

interface SummaryPanelProps {
  categories: CategoryDefinition[];
  records: Record<string, CategorySelectionRecord>;
  recentDays: number;
  settings: StatisticsSettings;
}

export const SummaryPanel = ({
  categories,
  records,
  recentDays,
  settings,
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
  ] as const;
  const enabledColumns = columns.filter(([id]) =>
    isStatisticEnabled(settings, id),
  );
  // Size each column to its own header label instead of the widest column overall.
  const columnWidths = useMemo(
    () =>
      Object.fromEntries(
        enabledColumns.map(([id, label, calculate]) => [
          id,
          Math.max(
            estimateColumnWidth(label),
            ...rows.map((row) =>
              estimateCellWidth(formatStat(row.category, id, calculate(row))),
            ),
          ),
        ]),
      ),
    [enabledColumns, rows],
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
      return compareValues(leftValue, rightValue, sortDirection);
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
                {enabledColumns.map(([id, , calculate]) => (
                  <Text
                    key={id}
                    style={[styles.value, { width: columnWidths[id] }]}
                  >
                    {formatStat(row.category, id, calculate(row))}
                  </Text>
                ))}
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
