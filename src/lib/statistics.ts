export type StatisticsSectionId =
  | 'chart'
  | 'summary'
  | 'correlation'
  | 'virtual-series'
  | 'calendar';

export type StatisticsItemId =
  | 'chart.section'
  | 'summary.section'
  | 'summary.mean.all'
  | 'summary.mean.recent'
  | 'summary.median.all'
  | 'summary.median.recent'
  | 'summary.mode.all'
  | 'summary.mode.recent'
  | 'summary.slope.all'
  | 'summary.slope.recent'
  | 'summary.autocorrelation'
  | 'correlation.section'
  | 'correlation.top-matches'
  | 'virtual-series.section'
  | 'calendar.section';

export interface StatisticsItemDefinition {
  id: StatisticsItemId;
  section: StatisticsSectionId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  documentationSection:
    | 'statistics'
    | 'correlation'
    | 'virtual-series';
}

export const statisticsRegistry: StatisticsItemDefinition[] = [
  {
    id: 'chart.section',
    section: 'chart',
    label: 'Historical chart',
    description: 'Plot enabled numeric series over time.',
    defaultEnabled: true,
    documentationSection: 'statistics',
  },
  {
    id: 'summary.section',
    section: 'summary',
    label: 'Category summary table',
    description: 'Show the configured summary statistics for each category.',
    defaultEnabled: true,
    documentationSection: 'statistics',
  },
  ...[
    [
      'mean.all',
      'All-time mean',
      'Average across the complete observed history.',
    ],
    [
      'mean.recent',
      'Recent mean',
      'Average across the separate recent lookback window.',
    ],
    [
      'median.all',
      'All-time median',
      'Middle observed value across all history.',
    ],
    [
      'median.recent',
      'Recent median',
      'Middle observed value in the recent window.',
    ],
    [
      'mode.all',
      'All-time mode',
      'Most frequent numeric value across all history.',
    ],
    [
      'mode.recent',
      'Recent mode',
      'Most frequent numeric value in the recent window.',
    ],
    [
      'slope.all',
      'All-time slope',
      'Linear-regression change per day across all history.',
    ],
    [
      'slope.recent',
      'Recent slope',
      'Linear-regression change per day in the recent window.',
    ],
    [
      'autocorrelation',
      'Autocorrelation',
      'Correlation between a series and its configured forward offset.',
    ],
  ].map(([suffix, label, description]) => ({
    id: `summary.${suffix}` as StatisticsItemId,
    section: 'summary' as StatisticsSectionId,
    label,
    description,
    defaultEnabled: true,
    documentationSection: 'statistics' as const,
  })),
  {
    id: 'correlation.section',
    section: 'correlation',
    label: 'Correlation matrix',
    description: 'Compare enabled virtual series at forward date offsets.',
    defaultEnabled: true,
    documentationSection: 'correlation',
  },
  {
    id: 'correlation.top-matches',
    section: 'correlation',
    label: 'Top correlations',
    description:
      'List the strongest lagged correlations above a threshold, independent of the full matrix.',
    defaultEnabled: true,
    documentationSection: 'correlation',
  },
  {
    id: 'virtual-series.section',
    section: 'virtual-series',
    label: 'Virtual-series details',
    description: 'Show the generated series used by statistics.',
    defaultEnabled: true,
    documentationSection: 'virtual-series',
  },
  {
    id: 'calendar.section',
    section: 'calendar',
    label: 'Calendar statistics',
    description: 'Show read-only weekday and day-of-month derived data.',
    defaultEnabled: false,
    documentationSection: 'statistics',
  },
];

export type StatisticsSettings = Partial<Record<StatisticsItemId, boolean>>;

export const createDefaultStatisticsSettings = (): Record<
  StatisticsItemId,
  boolean
> =>
  Object.fromEntries(
    statisticsRegistry.map((item) => [item.id, item.defaultEnabled]),
  ) as Record<StatisticsItemId, boolean>;

export const isStatisticEnabled = (
  settings: StatisticsSettings,
  id: StatisticsItemId,
): boolean =>
  settings[id] ??
  statisticsRegistry.find((item) => item.id === id)?.defaultEnabled ??
  false;
