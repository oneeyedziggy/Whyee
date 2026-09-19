import Slider from '@react-native-community/slider';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import type { CorrelationRow } from '../types/correlation';
import { nextSortDirection, type SortDirection } from '../lib/sort';
import { colors } from '../theme/tokens';
import { Panel } from './Panel';
import { SortHeader } from './SortHeader';

interface TopCorrelationsPanelProps {
  rows: CorrelationRow[];
  threshold: number;
  onThresholdChange: (value: number) => void;
}

interface TopMatch {
  key: string;
  first: string;
  second: string;
  lag: number;
  value: number;
}

const cellColor = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return '#f8fafc';
  const fraction = max === min ? 0.5 : (value - min) / (max - min);
  return `hsl(${Math.round(fraction * 120)}, 65%, 87%)`;
};

export const TopCorrelationsPanel = ({
  rows,
  threshold,
  onThresholdChange,
}: TopCorrelationsPanelProps) => {
  const [sortColumn, setSortColumn] = useState<
    'first' | 'second' | 'lag' | 'value'
  >('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const deferredRows = useDeferredValue(rows);
  const [minValue, maxValue] = useMemo(() => {
    const values = deferredRows.flatMap((row) =>
      row.cells
        .map((cell) => cell.value)
        .filter((value): value is number => value !== null),
    );
    return [
      values.length ? Math.min(...values) : 0,
      values.length ? Math.max(...values) : 1,
    ];
  }, [deferredRows]);

  const matches: TopMatch[] = useMemo(
    () =>
      deferredRows
        .flatMap((row) => {
          const pair = row.label.split(/\s*x\s*/i);
          const first = pair[0]?.trim() || row.label;
          const second = pair[1]?.trim() || row.label;
          return row.cells
            .filter(
              (cell): cell is { offset: number; value: number } =>
                cell.value !== null && Math.abs(cell.value) >= threshold,
            )
            .map((cell) => ({
              key: `${row.leftCategoryId}:${row.rightCategoryId}:${cell.offset}`,
              first,
              second,
              lag: cell.offset,
              value: cell.value,
            }));
        })
        .sort((left, right) => right.value - left.value),
    [deferredRows, threshold],
  );

  const selectSortColumn = (column: 'first' | 'second' | 'lag' | 'value') => {
    if (column !== sortColumn) {
      setSortColumn(column);
      setSortDirection(column === 'value' || column === 'lag' ? 'desc' : 'asc');
      return;
    }
    setSortDirection((current) => nextSortDirection(current));
  };

  const sortedMatches = useMemo(() => {
    const sorted = [...matches];
    if (sortDirection === 'default') return sorted;
    sorted.sort((left, right) => {
      const leftValue =
        sortColumn === 'first'
          ? left.first
          : sortColumn === 'second'
            ? left.second
            : sortColumn === 'lag'
              ? left.lag
              : left.value;
      const rightValue =
        sortColumn === 'first'
          ? right.first
          : sortColumn === 'second'
            ? right.second
            : sortColumn === 'lag'
              ? right.lag
              : right.value;
      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        const comparison = leftValue.localeCompare(rightValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      const comparison = Number(leftValue) - Number(rightValue);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [matches, sortColumn, sortDirection]);

  return (
    <Panel
      title="Top correlations"
      subtitle="Strongest lagged relationships across every pair, above your threshold."
      infoSection="correlation"
    >
      <View style={styles.thresholdRow}>
        <Text style={styles.thresholdLabel}>
          Threshold |r| ≥ {threshold.toFixed(2)}
        </Text>
        <Slider
          accessibilityLabel="Correlation strength threshold"
          accessibilityValue={{
            min: 0,
            max: 1,
            now: threshold,
            text: threshold.toFixed(2),
          }}
          value={threshold}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          onValueChange={onThresholdChange}
          style={styles.slider}
        />
      </View>
      {deferredRows.length === 0 ? (
        <Text style={styles.empty}>
          Enable the correlation matrix to see top correlations.
        </Text>
      ) : sortedMatches.length === 0 ? (
        <Text style={styles.empty}>No pairs currently meet the threshold.</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <SortHeader
              label="First"
              direction={sortColumn === 'first' ? sortDirection : 'default'}
              onPress={() => selectSortColumn('first')}
              style={styles.tableHeader}
            />
            <SortHeader
              label="Second"
              direction={sortColumn === 'second' ? sortDirection : 'default'}
              onPress={() => selectSortColumn('second')}
              style={styles.tableHeader}
            />
            <SortHeader
              label="Lag"
              direction={sortColumn === 'lag' ? sortDirection : 'default'}
              onPress={() => selectSortColumn('lag')}
              style={styles.tableHeader}
            />
            <SortHeader
              label="Value"
              direction={sortColumn === 'value' ? sortDirection : 'default'}
              onPress={() => selectSortColumn('value')}
              style={[styles.tableHeader, styles.tableHeaderLast]}
            />
          </View>
          <ScrollView style={styles.tableBody} nestedScrollEnabled>
            {sortedMatches.map((match) => (
              <View
                key={match.key}
                style={styles.tableRow}
                testID="top-correlation-row"
              >
                <Text style={styles.tableCell}>{match.first}</Text>
                <Text style={styles.tableCell}>{match.second}</Text>
                <Text style={styles.tableCell}>{match.lag}</Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.valueCell,
                    {
                      backgroundColor: cellColor(
                        match.value,
                        minValue,
                        maxValue,
                      ),
                    },
                  ]}
                >
                  {match.value.toFixed(2)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </Panel>
  );
};

const styles = StyleSheet.create({
  thresholdRow: { marginBottom: 12 },
  thresholdLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  slider: { marginTop: 4 },
  table: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  tableBody: {
    maxHeight: 320,
  },
  tableHeader: {
    alignItems: 'center',
    backgroundColor: '#eef3f8',
    borderRightColor: colors.border,
    borderRightWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tableHeaderLast: {
    borderRightWidth: 0,
  },
  sortGlyphs: {
    alignItems: 'center',
    flexDirection: 'column',
    marginLeft: 6,
  },
  sortGlyph: {
    fontSize: 10,
    lineHeight: 10,
  },
  sortGlyphIdle: { color: '#b9c3cf' },
  sortGlyphActive: { color: colors.text },
  tableCell: {
    alignItems: 'center',
    borderRightColor: colors.border,
    borderRightWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: 'center',
  },
  valueCell: {
    fontWeight: '700',
  },
  empty: { color: colors.muted, fontSize: 13 },
});
