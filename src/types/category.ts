export type CategoryKind =
  | 'multiple-choice'
  | 'number'
  | 'duration'
  | 'counter'
  | 'notes';

export type SummaryVerb =
  | 'count'
  | 'sum'
  | 'mean'
  | 'median'
  | 'min'
  | 'max'
  | 'product';

export type VirtualSeriesField =
  | 'value'
  | 'startTime'
  | 'stopTime'
  | 'durationMs'
  | 'noteText';

export type VirtualSeriesTransform = 'sentimentScore' | 'inverse';

export interface VirtualSeriesDefinition {
  id: string;
  name: string;
  sourceCategoryId: string;
  field: VirtualSeriesField;
  aggregation: SummaryVerb;
  enabled?: boolean;
  transform?: VirtualSeriesTransform;
  perInstance?: boolean;
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: number;
}

export interface NumericRangeConfig {
  min: number;
  max: number;
  step: number;
}

export interface NotificationTime {
  id: string;
  hour: number;
  minute: number;
}

export interface NotificationSchedule {
  enabled: boolean;
  weekdays: number[];
  times: NotificationTime[];
}

export interface BaseCategory {
  id: string;
  name: string;
  nameSequence: number;
  kind: CategoryKind;
  enabled: boolean;
  notesEnabled: boolean;
  sentimentEnabled: boolean;
  correlateWithinGroup: boolean;
  allowMultiplePerDay: boolean;
  mainAggregation: SummaryVerb;
  virtualSeries: VirtualSeriesDefinition[];
  notificationSchedule?: NotificationSchedule;
  savedTypeSettings?: Partial<Record<CategoryKind, CategoryDefinition>>;
}

export interface CategoryGroup {
  id: string;
  name: string;
  categoryIds: string[];
  expanded: boolean;
}

export interface ChoiceCategory extends BaseCategory {
  kind: 'multiple-choice';
  multiSelect: boolean;
  weeklyEffectEnabled: boolean;
  options: ChoiceOption[];
}

export interface NumericCategory extends BaseCategory {
  kind: 'number';
  weeklyEffectEnabled: boolean;
  range: NumericRangeConfig;
}

export interface DurationCategory extends BaseCategory {
  kind: 'duration';
  duration: {
    splitEnabled: boolean;
    showMilliseconds: boolean;
    resetEnabled: boolean;
    cumulative: boolean;
    animate: boolean;
  };
}

export interface CounterCategory extends BaseCategory {
  kind: 'counter';
  counter: {
    steps: number[];
    resetEnabled: boolean;
    editable: boolean;
    splitEnabled: boolean;
  };
}

export interface NotesCategory extends BaseCategory {
  kind: 'notes';
  notes: { sentimentEnabled: boolean };
}

export type CategoryDefinition =
  | ChoiceCategory
  | NumericCategory
  | DurationCategory
  | CounterCategory
  | NotesCategory;

export interface CategorySelectionRecord {
  key: string;
  categoryId: string;
  dateKey: string;
  ordinal: number;
  localTime: string;
  value: number;
  selectedValues?: number[];
  instanceId?: string;
  startTime?: string;
  stopTime?: string;
  durationMs?: number;
  // Full precision is kept here while durationMs/value follow the display precision.
  durationMsExact?: number;
  durationRuns?: Array<{
    startTime: string;
    stopTime: string;
    durationMs: number;
  }>;
  noteText?: string;
  sentimentScore?: number;
}
