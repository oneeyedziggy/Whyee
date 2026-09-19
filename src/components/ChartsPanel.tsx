import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import { seriesColors, colors } from '../theme/tokens';
import { summarize } from '../lib/virtualSeries';
import { Panel } from './Panel';

interface ChartsPanelProps {
  categories: CategoryDefinition[];
  records: Record<string, CategorySelectionRecord>;
}

export const ChartsPanel = ({ categories, records }: ChartsPanelProps) => {
  const dates = useMemo(
    () =>
      [
        ...new Set(Object.values(records).map((record) => record.dateKey)),
      ].sort(),
    [records],
  );
  const series = useMemo(() => {
    return categories
      .map((category, index) => {
        // Notes carry no numeric entry of their own, so sentiment is their value.
        const readValue = (record: CategorySelectionRecord) =>
          category.kind === 'notes'
            ? (record.sentimentScore ?? null)
            : record.value;
        const byDate = new Map<string, number[]>();
        Object.values(records)
          .filter((record) => record.categoryId === category.id)
          .forEach((record) => {
            const value = readValue(record);
            if (value === null) return;
            byDate.set(record.dateKey, [
              ...(byDate.get(record.dateKey) ?? []),
              value,
            ]);
          });
        const values = dates.map((date) => {
          const entries = byDate.get(date);
          return entries?.length
            ? summarize(entries, category.mainAggregation)
            : null;
        });
        const present = values.filter(
          (value): value is number => value !== null,
        );
        if (!present.length) return null;
        const min = Math.min(...present);
        const max = Math.max(...present);
        const range = max - min;
        return {
          id: category.id,
          name: category.name,
          color: seriesColors[index % seriesColors.length],
          values: values.map((value) =>
            value === null ? null : range === 0 ? 0.5 : (value - min) / range,
          ),
          rawValues: values,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [categories, dates, records]);
  const [visible, setVisible] = useState<string[]>([]);
  const seriesSignature = series.map((item) => item.id).join('|');
  useEffect(() => {
    setVisible((current) => {
      const next = current.length
        ? current.filter((id) => series.some((item) => item.id === id))
        : series.slice(0, 2).map((item) => item.id);
      return next.length === current.length &&
        next.every((id, index) => id === current[index])
        ? current
        : next;
    });
  }, [seriesSignature]);
  return (
    <Panel
      title="Historical charts"
      subtitle="Each series is normalized to its own observed range."
      infoSection="statistics"
    >
      <View style={styles.chips}>
        {series.map((item) => (
          <Pressable
            key={item.id}
            accessibilityLabel={`${item.name} series`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: visible.includes(item.id) }}
            onPress={() =>
              setVisible((current) =>
                current.includes(item.id)
                  ? current.filter((id) => id !== item.id)
                  : [...current, item.id],
              )
            }
            style={[
              styles.chip,
              {
                borderColor: item.color,
                backgroundColor: visible.includes(item.id)
                  ? item.color
                  : '#fff',
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                visible.includes(item.id) && styles.chipSelected,
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {series.length ? (
        <Chart
          dates={dates}
          series={series.filter((item) => visible.includes(item.id))}
        />
      ) : (
        <Text style={styles.empty}>
          Add daily values to populate the chart.
        </Text>
      )}
    </Panel>
  );
};

const Chart = ({
  dates,
  series,
}: {
  dates: string[];
  series: Array<{
    id: string;
    name: string;
    color: string;
    values: Array<number | null>;
    rawValues: Array<number | null>;
  }>;
}) => {
  const width = 560;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 42, left: 28 };
  const longest = Math.max(...series.map((item) => item.values.length), 2);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const xAt = (index: number) =>
    padding.left + (index / (longest - 1)) * chartWidth;
  const yAt = (value: number) => padding.top + (1 - value) * chartHeight;
  const labelStep = Math.max(1, Math.ceil(dates.length / 7));
  const labelIndexes = dates
    .map((_, index) => index)
    .filter(
      (index) =>
        index === 0 || index === dates.length - 1 || index % labelStep === 0,
    );
  const selectNearestPoint = (locationX: number) => {
    const nearest = Math.round(
      ((locationX - padding.left) / chartWidth) * (longest - 1),
    );
    setSelectedIndex(Math.max(0, Math.min(longest - 1, nearest)));
  };
  // Web has a real cursor, so hover (not click) drives the tooltip; touch keeps using the responder drag below.
  const handleHoverMove = (event: {
    currentTarget: { getBoundingClientRect?: () => { left: number } };
    clientX?: number;
    nativeEvent?: { clientX?: number };
  }) => {
    const rect = event.currentTarget.getBoundingClientRect?.();
    if (!rect) return;
    const clientX = event.nativeEvent?.clientX ?? event.clientX ?? 0;
    selectNearestPoint(clientX - rect.left);
  };
  const formatDateLabel = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };
  const path = (values: Array<number | null>) =>
    values.reduce<{ text: string; started: boolean }>(
      (accumulator, value, index) => {
        if (value === null) return { ...accumulator, started: false };
        const x = xAt(index);
        const y = yAt(value);
        return {
          text: `${accumulator.text}${accumulator.started ? ' L' : 'M'} ${x} ${y}`,
          started: true,
        };
      },
      { text: '', started: false },
    ).text;
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          accessible
          accessibilityLabel={`Historical chart with ${series.map((item) => item.name).join(', ')} across ${dates.length} dates. Touch or drag the chart to inspect values.`}
          accessibilityHint="Select a date to hear the values for each visible series."
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) =>
            selectNearestPoint(event.nativeEvent.locationX)
          }
          onResponderMove={(event) =>
            selectNearestPoint(event.nativeEvent.locationX)
          }
          onResponderRelease={(event) =>
            selectNearestPoint(event.nativeEvent.locationX)
          }
          {...(Platform.OS === 'web'
            ? {
                onMouseMove: handleHoverMove,
                onMouseLeave: () => setSelectedIndex(null),
              }
            : {})}
        >
          <Svg width={width} height={height} style={styles.chart}>
            <Line
              x1={padding.left}
              y1={height - padding.bottom}
              x2={width - padding.right}
              y2={height - padding.bottom}
              stroke={colors.border}
            />
            <Line
              x1={padding.left}
              y1={padding.top}
              x2={padding.left}
              y2={height - padding.bottom}
              stroke={colors.border}
            />
            {labelIndexes.map((index) => (
              <SvgText
                key={dates[index]}
                x={xAt(index)}
                y={height - 16}
                fill={colors.muted}
                fontSize="10"
                textAnchor="middle"
              >
                {formatDateLabel(dates[index])}
              </SvgText>
            ))}
            {series.map((item) => (
              <Path
                key={item.id}
                d={path(item.values)}
                stroke={item.color}
                strokeWidth={3}
                fill="none"
              />
            ))}
            {selectedIndex !== null ? (
              <>
                <Line
                  x1={xAt(selectedIndex)}
                  y1={padding.top}
                  x2={xAt(selectedIndex)}
                  y2={height - padding.bottom}
                  stroke={colors.muted}
                  strokeDasharray="4 4"
                />
                {series.map((item) => {
                  const value = item.values[selectedIndex];
                  return value === null ? null : (
                    <Circle
                      key={item.id}
                      cx={xAt(selectedIndex)}
                      cy={yAt(value)}
                      r="5"
                      fill={colors.surface}
                      stroke={item.color}
                      strokeWidth="3"
                    />
                  );
                })}
              </>
            ) : null}
          </Svg>
        </View>
      </ScrollView>
      {selectedIndex !== null && dates[selectedIndex] ? (
        <View accessibilityLiveRegion="polite" style={styles.pointDetails}>
          <Text style={styles.pointDate}>
            {formatDateLabel(dates[selectedIndex])}
          </Text>
          {series.map((item) => {
            const value = item.rawValues[selectedIndex];
            return value === null ? null : (
              <Text
                key={item.id}
                style={[styles.pointValue, { color: item.color }]}
              >
                {item.name}: {value.toFixed(2)}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  chip: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chipSelected: { color: '#fff' },
  chart: { backgroundColor: '#fbfcfe', borderRadius: 6 },
  pointDetails: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    marginTop: 8,
    padding: 10,
  },
  pointDate: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  pointValue: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  empty: { color: colors.muted, fontSize: 13 },
});
