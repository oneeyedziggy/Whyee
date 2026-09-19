import { createDefaultStatisticsSettings } from '../src/lib/statistics';
import type { WorkspaceTransferSnapshot } from '../src/types/dataTransfer';

export const transferWorkspace: WorkspaceTransferSnapshot = {
  id: 'user',
  name: 'User',
  categories: [
    {
      id: 'category-mood',
      name: 'Mood',
      nameSequence: 1,
      kind: 'number',
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: false,
      correlateWithinGroup: false,
      allowMultiplePerDay: false,
      mainAggregation: 'mean',
      virtualSeries: [],
      weeklyEffectEnabled: false,
      range: { min: 0, max: 10, step: 1 },
    },
  ],
  groups: [
    {
      id: 'default-group',
      name: 'General',
      categoryIds: ['category-mood'],
      expanded: true,
    },
  ],
  records: {},
};

export const transferGlobals = {
  analysisSettings: {
    correlationOffset: 7,
    topCorrelationThreshold: 0.7,
    summaryLookback: 7,
    statisticsSettings: createDefaultStatisticsSettings(),
  },
  appPreferences: { activeWorkspaceId: 'user', categoryIndexExpanded: true },
};
