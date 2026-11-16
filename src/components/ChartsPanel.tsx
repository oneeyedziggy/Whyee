import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import type { ChartSelection } from '../types/charts';
import { buildChartCategories } from '../lib/chartSeries';
import {
  initializeChartSelection,
  setChartCategoryEnabled,
  setChartInversesShown,
  toggleChartSeries,
} from '../lib/chartSelection';
import { HoverTitle } from './HoverTitle';
import { colors, shadows } from '../theme/tokens';
import { CompactSwitch } from './CategoryEditorControls';
import { HistoricalChart } from './HistoricalChart';
import { Panel } from './Panel';

interface ChartsPanelProps {
  categories: CategoryDefinition[];
  records: Record<string, CategorySelectionRecord>;
  selection?: ChartSelection;
  onSelectionChange: (selection: ChartSelection) => void;
  selectionHydrated: boolean;
}

export const ChartsPanel = ({
  categories,
  records,
  selection,
  onSelectionChange,
  selectionHydrated,
}: ChartsPanelProps) => {
  const projectionSignature = JSON.stringify(
    Object.entries(selection?.categories ?? {})
      .map(
        ([id, choice]) =>
          [
            id,
            choice.selectedSeriesIds
              .filter((seriesId) => /:ordinal:\d+(:inverse)?$/.test(seriesId))
              .sort(),
            choice.showInverses === true,
          ] as const,
      )
      .filter(([, ids, showInverses]) => ids.length > 0 || showInverses)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const chartCategories = useMemo(() => {
    const choices: Array<[string, string[], boolean]> =
      JSON.parse(projectionSignature);
    return buildChartCategories(categories, records, {
      categories: Object.fromEntries(
        choices.map(([id, selectedSeriesIds, showInverses]) => [
          id,
          { enabled: false, selectedSeriesIds, showInverses },
        ]),
      ),
    });
  }, [categories, records, projectionSignature]);
  const hasData = chartCategories.some((category) =>
    category.series.some((series) =>
      series.points.some((point) => point.value !== null),
    ),
  );
  const initialized = useRef(false);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    if (
      selectionHydrated &&
      selection === undefined &&
      hasData &&
      !initialized.current
    ) {
      initialized.current = true;
      onSelectionChange(initializeChartSelection(chartCategories));
    }
  }, [
    selectionHydrated,
    selection,
    hasData,
    chartCategories,
    onSelectionChange,
  ]);

  const currentSelection = selection ?? { categories: {} };
  const active = chartCategories.filter(
    (category) => currentSelection.categories[category.id]?.enabled,
  );
  const inactive = chartCategories.filter(
    (category) => !currentSelection.categories[category.id]?.enabled,
  );
  const visibleSeries = useMemo(
    () =>
      chartCategories.flatMap((category) => {
        const choice = selection?.categories[category.id];
        return choice?.enabled
          ? category.series.filter((series) =>
              choice.selectedSeriesIds.includes(series.id),
            )
          : [];
      }),
    [chartCategories, selection],
  );
  const enableCategory = (
    category: (typeof chartCategories)[number],
    enabled: boolean,
  ) => {
    if (enabled)
      setExpandedCategories((current) => ({ ...current, [category.id]: true }));
    onSelectionChange(
      setChartCategoryEnabled(currentSelection, category, enabled),
    );
  };

  return (
    <Panel
      title="Historical charts"
      subtitle="Each series is normalized to its own observed range."
      infoSection="statistics"
    >
      {active.map((category) => {
        const expanded = expandedCategories[category.id] === true;
        const showInverses =
          currentSelection.categories[category.id]?.showInverses === true;
        const Disclosure = expanded ? ChevronDown : ChevronRight;
        return (
          <View key={category.id} style={styles.category}>
            <View style={styles.header}>
              <HoverTitle
                grow
                text={`${expanded ? 'Collapse' : 'Expand'} ${category.name} chart series`}
              >
                <Pressable
                  accessibilityLabel={`${category.name} chart series`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() =>
                    setExpandedCategories((current) => ({
                      ...current,
                      [category.id]: !expanded,
                    }))
                  }
                  style={styles.disclosure}
                >
                  <Disclosure size={18} color={colors.muted} />
                  <Text style={styles.categoryName}>{category.name}</Text>
                </Pressable>
              </HoverTitle>
              <View style={styles.inverseToggle}>
                <Text style={styles.inverseLabel}>Inverses</Text>
                <CompactSwitch
                  accessibilityLabel={`Enable ${category.name} inverse chart series`}
                  value={showInverses}
                  disabled={!selectionHydrated}
                  onChange={(shown) =>
                    onSelectionChange(
                      setChartInversesShown(currentSelection, category, shown),
                    )
                  }
                />
              </View>
              <CompactSwitch
                accessibilityLabel={`Enable ${category.name} chart`}
                value
                disabled={!selectionHydrated}
                onChange={(enabled) => enableCategory(category, enabled)}
              />
            </View>
            {expanded ? (
              <View style={styles.chips}>
                {category.series.map((series) => {
                  // `active` only holds categories with an enabled choice.
                  const checked = currentSelection.categories[
                    category.id
                  ].selectedSeriesIds.includes(series.id);
                  return (
                    <Pressable
                      key={series.id}
                      accessibilityLabel={`${category.name}: ${series.label}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked,
                        disabled: !selectionHydrated,
                      }}
                      disabled={!selectionHydrated}
                      onPress={() =>
                        onSelectionChange(
                          toggleChartSeries(
                            currentSelection,
                            category.id,
                            series.id,
                          ),
                        )
                      }
                      style={[
                        styles.chip,
                        { borderColor: series.color },
                        checked && styles.chipSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: series.color },
                        ]}
                      />
                      <Text style={styles.chipText}>{series.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={styles.chips}>
        {inactive.map((category) => (
          <HoverTitle key={category.id} text={`Enable ${category.name} chart`}>
            <Pressable
              accessibilityLabel={`Enable ${category.name} chart`}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: false,
                disabled: !selectionHydrated,
              }}
              disabled={!selectionHydrated}
              onPress={() => enableCategory(category, true)}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{category.name}</Text>
            </Pressable>
          </HoverTitle>
        ))}
      </View>
      {!hasData ? (
        <Text style={styles.empty}>
          Add daily values to populate the chart.
        </Text>
      ) : !visibleSeries.length ? (
        <Text style={styles.empty}>No series selected.</Text>
      ) : (
        <HistoricalChart series={visibleSeries} />
      )}
    </Panel>
  );
};

const styles = StyleSheet.create({
  category: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inverseToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inverseLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  disclosure: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryName: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  chip: {
    boxShadow: shadows.soft,
    minHeight: 44,
    minWidth: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipSelected: { backgroundColor: colors.primarySoft },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  empty: { color: colors.muted, fontSize: 13 },
});
