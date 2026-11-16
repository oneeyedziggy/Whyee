import { Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { ChartsPanel } from './ChartsPanel';
import { CorrelationPanel } from './CorrelationPanel';
import { Panel } from './Panel';
import { SummaryPanel } from './SummaryPanel';
import { TopCorrelationsPanel } from './TopCorrelationsPanel';
import { styles } from '../appStyles';
import { isStatisticEnabled } from '../lib/statistics';
import type { StatisticsSettings } from '../lib/statistics';
import type { CategoryDefinition } from '../types/category';
import type { CorrelationRow } from '../types/correlation';
import type { ChartSelection } from '../types/charts';

interface StatsPanelProps {
  workspaceId: string;
  chartSelection?: ChartSelection;
  chartSelectionHydrated: boolean;
  onChartSelectionChange: (selection: ChartSelection) => void;
  statsRenderStage: number;
  statisticsSettings: StatisticsSettings;
  enabledCategories: CategoryDefinition[];
  records: Record<string, any>;
  safeSummaryLookback: number;
  orderedRows: CorrelationRow[];
  loading: boolean;
  offsets: number[];
  safeCorrelationOffset: number;
  safeTopCorrelationThreshold: number;
  setTopCorrelationThreshold: (value: number) => void;
  setCorrelationOffset: (value: number) => void;
  setStatisticsSettingsOpen: (value: boolean) => void;
}

export const StatsPanel = ({
  workspaceId,
  chartSelection,
  chartSelectionHydrated,
  onChartSelectionChange,
  statsRenderStage,
  statisticsSettings,
  enabledCategories,
  records,
  safeSummaryLookback,
  orderedRows,
  loading,
  offsets,
  safeCorrelationOffset,
  safeTopCorrelationThreshold,
  setTopCorrelationThreshold,
  setCorrelationOffset,
  setStatisticsSettingsOpen,
}: StatsPanelProps) => (
  <View style={styles.statistics}>
    <View style={styles.statisticsHeader}>
      <Text style={styles.statisticsTitle}>Statistics</Text>
      <AppButton
        title="Settings"
        onPress={() => setStatisticsSettingsOpen(true)}
      />
    </View>
    {statsRenderStage >= 1 &&
    isStatisticEnabled(statisticsSettings, 'chart.section') ? (
      <ChartsPanel
        key={workspaceId}
        categories={enabledCategories}
        records={records}
        selection={chartSelection}
        selectionHydrated={chartSelectionHydrated}
        onSelectionChange={onChartSelectionChange}
      />
    ) : null}
    {statsRenderStage >= 2 &&
    isStatisticEnabled(statisticsSettings, 'chart.section') &&
    isStatisticEnabled(statisticsSettings, 'correlation.section') ? (
      <View style={styles.sectionGap} />
    ) : null}
    {statsRenderStage >= 2 &&
    isStatisticEnabled(statisticsSettings, 'summary.section') ? (
      <SummaryPanel
        categories={enabledCategories}
        records={records}
        recentDays={safeSummaryLookback}
        settings={statisticsSettings}
      />
    ) : null}
    {statsRenderStage >= 3 &&
    isStatisticEnabled(statisticsSettings, 'summary.section') &&
    isStatisticEnabled(statisticsSettings, 'correlation.section') ? (
      <View style={styles.sectionGap} />
    ) : null}
    {statsRenderStage >= 4 &&
    isStatisticEnabled(statisticsSettings, 'correlation.top-matches') ? (
      <TopCorrelationsPanel
        rows={orderedRows}
        threshold={safeTopCorrelationThreshold}
        onThresholdChange={setTopCorrelationThreshold}
      />
    ) : null}
    {statsRenderStage >= 5 &&
    isStatisticEnabled(statisticsSettings, 'correlation.top-matches') &&
    isStatisticEnabled(statisticsSettings, 'correlation.section') ? (
      <View style={styles.sectionGap} />
    ) : null}
    {statsRenderStage >= 5 &&
    isStatisticEnabled(statisticsSettings, 'correlation.section') ? (
      <CorrelationPanel
        rows={orderedRows}
        loading={loading}
        offsets={offsets}
        offset={safeCorrelationOffset}
        onOffsetChange={(value) =>
          setCorrelationOffset(Math.min(366, Math.max(0, Math.round(value))))
        }
      />
    ) : null}
    {!isStatisticEnabled(statisticsSettings, 'chart.section') &&
    !isStatisticEnabled(statisticsSettings, 'summary.section') &&
    !isStatisticEnabled(statisticsSettings, 'correlation.section') &&
    !isStatisticEnabled(statisticsSettings, 'correlation.top-matches') ? (
      <Panel
        title="Statistics paused"
        subtitle="Enable a statistics section to calculate and view results."
        infoSection="statistics"
      >
        <AppButton
          title="Open statistics settings"
          onPress={() => setStatisticsSettingsOpen(true)}
        />
      </Panel>
    ) : null}
  </View>
);
