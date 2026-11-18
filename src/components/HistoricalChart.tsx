import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { ChartSeries } from '../types/charts';
import { colors, shadows } from '../theme/tokens';
import { formatDurationValue, formatMinutesOfDay } from '../lib/durationFormat';

const minimumWidth = 560;
const height = 260;
const padding = { top: 16, right: 16, bottom: 42, left: 28 };
const chartHeight = height - padding.top - padding.bottom;
const yAt = (value: number) => padding.top + (1 - value) * chartHeight;
const dateLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

export const HistoricalChart = ({ series }: { series: ChartSeries[] }) => {
  const desktop = useWindowDimensions().width >= 900;
  const [containerWidth, setContainerWidth] = useState(0);
  const width = desktop
    ? Math.max(minimumWidth, Math.floor(containerWidth))
    : minimumWidth;
  const chartWidth = width - padding.left - padding.right;
  const timestamps = useMemo(
    () =>
      [
        ...new Set(
          series.flatMap((item) =>
            item.points
              .filter(
                (point) =>
                  point.value !== null &&
                  point.normalized !== null &&
                  Number.isFinite(point.timestamp) &&
                  Number.isFinite(point.normalized),
              )
              .map((point) => point.timestamp),
          ),
        ),
      ].sort((left, right) => left - right),
    [series],
  );
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(
    null,
  );
  useEffect(() => setSelectedTimestamp(null), [series]);
  const minimum = timestamps[0] ?? 0;
  const maximum = timestamps[timestamps.length - 1] ?? minimum;
  const xAt = (timestamp: number) =>
    padding.left +
    (maximum === minimum
      ? chartWidth / 2
      : ((timestamp - minimum) / (maximum - minimum)) * chartWidth);
  const selectNearestPoint = (locationX: number) => {
    if (!timestamps.length || !Number.isFinite(locationX)) return;
    const target =
      minimum + ((locationX - padding.left) / chartWidth) * (maximum - minimum);
    setSelectedTimestamp(
      timestamps.reduce((nearest, timestamp) =>
        Math.abs(timestamp - target) < Math.abs(nearest - target)
          ? timestamp
          : nearest,
      ),
    );
  };
  const handleHoverMove = (event: {
    currentTarget: { getBoundingClientRect?: () => { left: number } };
    clientX?: number;
    nativeEvent?: { clientX?: number };
  }) => {
    const rect = event.currentTarget.getBoundingClientRect?.();
    const clientX = event.nativeEvent?.clientX ?? event.clientX;
    if (rect && clientX !== undefined) selectNearestPoint(clientX - rect.left);
  };
  const path = (item: ChartSeries) => {
    let started = false;
    return item.points
      .map((point) => {
        if (
          point.normalized === null ||
          !Number.isFinite(point.normalized) ||
          !Number.isFinite(point.timestamp)
        ) {
          started = false;
          return '';
        }
        const segment = `${started ? 'L' : 'M'} ${xAt(point.timestamp)} ${yAt(point.normalized)}`;
        started = true;
        return segment;
      })
      .join(' ');
  };
  const labels =
    maximum === minimum
      ? [minimum]
      : Array.from(
          { length: 6 },
          (_, index) => minimum + ((maximum - minimum) * index) / 5,
        );
  const sameDay =
    new Date(minimum).toDateString() === new Date(maximum).toDateString();
  const selected =
    selectedTimestamp !== null && timestamps.includes(selectedTimestamp)
      ? selectedTimestamp
      : null;

  if (!timestamps.length)
    return <Text style={styles.empty}>No data for the selected series.</Text>;
  return (
    <View
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          accessible
          testID="historical-chart"
          style={[styles.frame, { width }]}
          accessibilityLabel={`Historical chart with ${series.map((item) => item.name).join(', ')} across ${timestamps.length} timestamps.`}
          accessibilityHint="Touch or drag to inspect the values at a timestamp."
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
                onMouseLeave: () => setSelectedTimestamp(null),
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
            {labels.map((timestamp) => (
              <SvgText
                key={timestamp}
                x={xAt(timestamp)}
                y={height - 16}
                fill={colors.muted}
                fontSize="10"
                textAnchor="middle"
              >
                {sameDay && maximum !== minimum
                  ? new Date(timestamp).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : dateLabel(timestamp)}
              </SvgText>
            ))}
            {series.map((item) => (
              <Path
                key={item.id}
                d={path(item)}
                stroke={item.color}
                strokeWidth={3}
                fill="none"
              />
            ))}
            {selected !== null ? (
              <Line
                x1={xAt(selected)}
                y1={padding.top}
                x2={xAt(selected)}
                y2={height - padding.bottom}
                stroke={colors.muted}
                strokeDasharray="4 4"
              />
            ) : null}
            {series.flatMap((item) =>
              item.points.map((point) =>
                point.normalized === null ||
                !Number.isFinite(point.normalized) ||
                !Number.isFinite(point.timestamp) ? null : (
                  <Circle
                    key={`${item.id}:${point.key}`}
                    cx={xAt(point.timestamp)}
                    cy={yAt(point.normalized)}
                    r={point.timestamp === selected ? 5 : 3}
                    fill={
                      point.timestamp === selected ? colors.surface : item.color
                    }
                    stroke={item.color}
                    strokeWidth={point.timestamp === selected ? 3 : 1}
                  />
                ),
              ),
            )}
          </Svg>
        </View>
      </ScrollView>
      {selected !== null ? (
        <View accessibilityLiveRegion="polite" style={styles.pointDetails}>
          <Text style={styles.pointDate}>
            {new Date(selected).toLocaleString()}
          </Text>
          {series.flatMap((item) =>
            item.points
              .filter(
                (point) => point.timestamp === selected && point.value !== null,
              )
              .map((point) => (
                <Text
                  key={`${item.id}:${point.key}`}
                  style={[styles.pointValue, { color: item.color }]}
                >
                  {item.name}:{' '}
                  {item.durationValue
                    ? formatDurationValue(
                        point.value!,
                        item.showMilliseconds ?? false,
                      )
                    : item.timeOfDayValue
                      ? formatMinutesOfDay(
                          point.value!,
                          item.use24HourClock !== false,
                        )
                      : point.value?.toFixed(2)}
                  {item.raw
                    ? ` (${new Date(point.timestamp).toLocaleTimeString()})`
                    : ''}
                </Text>
              )),
          )}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: { height, boxShadow: shadows.soft },
  chart: { backgroundColor: '#fbfcfe', borderRadius: 6 },
  pointDetails: { marginTop: 8, paddingVertical: 10 },
  pointDate: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  pointValue: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  empty: { color: colors.muted, fontSize: 13 },
});
