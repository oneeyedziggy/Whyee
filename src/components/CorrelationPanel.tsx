import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import type { CorrelationRow } from '../types/correlation';
import {
  compareValues,
  nextSortDirection,
  type SortDirection,
} from '../lib/sort';
import { colors, shadows } from '../theme/tokens';
import { Panel } from './Panel';
import { HoverTitle } from './HoverTitle';
import { SortHeader } from './SortHeader';

const rowBatchSize = 24;

// Hover shows the full pair on web; tapping expands it everywhere else.
const PairLabel = ({ label }: { label: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <HoverTitle text={label}>
      <Pressable
        accessibilityHint="Shows the full pair name"
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.pair}
      >
        <Text numberOfLines={expanded ? 0 : 1} style={styles.pairText}>
          {label}
        </Text>
      </Pressable>
    </HoverTitle>
  );
};

export const CorrelationPanel = ({
  rows,
  loading,
  offsets,
  offset,
  onOffsetChange,
}: {
  rows: CorrelationRow[];
  loading: boolean;
  offsets: number[];
  offset: number;
  onOffsetChange: (value: number) => void;
}) => {
  const deferredRows = useDeferredValue(rows);
  const [min, max] = useMemo(() => {
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
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('default');
  const [visibleRowCount, setVisibleRowCount] = useState(rowBatchSize);
  const selectSortColumn = (column: string) => {
    if (column !== sortColumn) {
      setSortColumn(column);
      setSortDirection('asc');
      return;
    }
    setSortDirection((current) => nextSortDirection(current));
  };
  const sortedRows = useMemo(
    () =>
      [...deferredRows].sort((left, right) => {
        if (sortDirection === 'default' || !sortColumn) return 0;
        const leftValue =
          sortColumn === 'pair'
            ? left.label
            : (left.cells.find((cell) => `${cell.offset}` === sortColumn)
                ?.value ?? null);
        const rightValue =
          sortColumn === 'pair'
            ? right.label
            : (right.cells.find((cell) => `${cell.offset}` === sortColumn)
                ?.value ?? null);
        return compareValues(leftValue, rightValue, sortDirection);
      }),
    [deferredRows, sortColumn, sortDirection],
  );
  const cellColor = (value: number | null) => {
    if (value === null) return '#f8fafc';
    const fraction = max === min ? 0.5 : (value - min) / (max - min);
    return `hsl(${Math.round(fraction * 120)}, 65%, 87%)`;
  };
  return (
    <Panel
      title="Correlation matrix"
      subtitle="Compare lagged daily value patterns across every pair."
      infoSection="correlation"
    >
      <View style={styles.offsetControl}>
        <Text style={styles.offsetLabel}>Forward days</Text>
        <TextInput
          accessibilityLabel="Correlation forward days"
          value={`${offset}`}
          keyboardType="number-pad"
          onChangeText={(value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) onOffsetChange(parsed);
          }}
          style={styles.offsetInput}
        />
      </View>
      {loading && !deferredRows.length ? (
        <Text style={styles.empty}>Updating correlations...</Text>
      ) : deferredRows.length ? (
        <View style={styles.table}>
          <ScrollView horizontal contentContainerStyle={styles.tableInner}>
            <View style={styles.header}>
              <SortHeader
                label="Pair"
                direction={sortColumn === 'pair' ? sortDirection : 'default'}
                onPress={() => selectSortColumn('pair')}
                style={styles.pair}
              />
              {offsets.map((offset, index) => (
                <SortHeader
                  key={offset}
                  label={`${offset}`}
                  direction={
                    sortColumn === `${offset}` ? sortDirection : 'default'
                  }
                  onPress={() => selectSortColumn(`${offset}`)}
                  style={[
                    styles.cell,
                    index === offsets.length - 1 && styles.lastHeaderCell,
                  ]}
                />
              ))}
            </View>
            <View>
              {sortedRows.slice(0, visibleRowCount).map((row) => (
                <View
                  key={`${row.leftCategoryId}:${row.rightCategoryId}`}
                  style={styles.row}
                >
                  <PairLabel label={row.label} />
                  {offsets.map((offset) => {
                    const value =
                      row.cells.find((cell) => cell.offset === offset)?.value ??
                      null;
                    return (
                      <Text
                        key={offset}
                        accessibilityLabel={`${row.label}, ${offset} forward days, correlation ${value === null ? 'not available' : value.toFixed(2)}`}
                        style={[
                          styles.cell,
                          { backgroundColor: cellColor(value) },
                        ]}
                      >
                        {value === null ? '--' : value.toFixed(2)}
                      </Text>
                    );
                  })}
                </View>
              ))}
              {visibleRowCount < sortedRows.length ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setVisibleRowCount((current) => current + rowBatchSize)
                  }
                  style={styles.showMore}
                >
                  <Text style={styles.showMoreText}>
                    Show more pairs ({sortedRows.length - visibleRowCount}{' '}
                    remaining)
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      ) : (
        <Text style={styles.empty}>Add data to view correlation results.</Text>
      )}
    </Panel>
  );
};

const styles = StyleSheet.create({
  offsetControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  offsetLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  offsetInput: {
    boxShadow: shadows.soft,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.text,
    minWidth: 58,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
  },
  header: { flexDirection: 'row', backgroundColor: '#eef3f8' },
  showMore: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  showMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  table: {
    boxShadow: shadows.soft,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableInner: {
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: '100%',
  },
  row: {
    flexDirection: 'row',
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  pair: {
    width: 150,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    padding: 8,
    alignSelf: 'center',
  },
  pairText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  cell: {
    flexBasis: 52,
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 52,
    color: colors.text,
    fontSize: 11,
    padding: 8,
    textAlign: 'center',
  },
  lastHeaderCell: {
    // A lip past the last column so the body's vertical scrollbar has room
    // without shrinking (and misaligning) every other header/body cell.
    flexBasis: 52 + 14,
    minWidth: 52 + 14,
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
  empty: { color: colors.muted, fontSize: 13 },
});
