export type CategoryKind =
  | 'multiple-choice'
  | 'number'
  | 'duration'
  | 'counter'
  | 'notes'
  | 'event-time';

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
  | 'noteText'
  | 'optionSelected'
  | 'noteWordCount'
  | 'noteLength'
  | 'noteAverageWordLength'
  | 'noteDistinctWords'
  | 'eventMinuteOfDay'
  | 'eventHourOfDay'
  | 'eventDaypart'
  | 'timeSinceCategory';

// 'inverse' only appears on legacy standalone series; current series use `inverseEnabled`.
export type VirtualSeriesTransform = 'sentimentScore' | 'inverse';

export interface VirtualSeriesDefinition {
  id: string;
  name: string;
  sourceCategoryId: string;
  field: VirtualSeriesField;
  aggregation: SummaryVerb;
  enabled?: boolean;
  inverseEnabled?: boolean;
  // Editor heading for multiple-per-day summary sets; absent for single-entry series.
  group?: string;
  transform?: VirtualSeriesTransform;
  perInstance?: boolean;
  // Only set (and used) when field is 'optionSelected'; the ChoiceOption value this series tracks.
  // For 'eventHourOfDay' it is the hour (0-23) and for 'eventDaypart' the daypart index (0-3).
  optionValue?: number;
  // Only set (and used) when field is 'timeSinceCategory'; the category whose latest prior entry
  // this series measures the elapsed minutes from.
  timeSinceCategoryId?: string;
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
  weekdays: number[];
}

export interface NotificationSchedule {
  enabled: boolean;
  times: NotificationTime[];
}

/** Legacy on-disk shape (pre per-time weekdays) kept only for migration in normalizeNotificationSchedule. */
export interface LegacyNotificationSchedule {
  enabled: boolean;
  weekdays: number[];
  times: Array<{ id: string; hour: number; minute: number }>;
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
  // Legacy setting; only read to pick which daily summary series starts enabled.
  mainAggregation?: SummaryVerb;
  virtualSeries: VirtualSeriesDefinition[];
  notificationSchedule?: NotificationSchedule;
  savedTypeSettings?: Partial<Record<CategoryKind, CategoryDefinition>>;
}

export interface CategoryGroup {
  id: string;
  name: string;
  categoryIds: string[];
  expanded: boolean;
  // Absent means enabled. While disabled, `suspendedCategoryIds` remembers which members were
  // already individually disabled so re-enabling restores their own states rather than all-on.
  enabled?: boolean;
  suspendedCategoryIds?: string[];
}

export interface ChoiceCategory extends BaseCategory {
  kind: 'multiple-choice';
  multiSelect: boolean;
  weeklyEffectEnabled: boolean;
  weeklyEffectInverseEnabled?: boolean;
  showOptionValues?: boolean;
  options: ChoiceOption[];
  // 'intensity': one aggregated numeric series. 'items': one binary series per option.
  optionSeriesMode: 'intensity' | 'items';
  // How same-day repeats combine per option in 'items' mode: total count vs. clamped to 0/1.
  optionOccurrenceMode: 'sum' | 'capped';
}

export interface NumericCategory extends BaseCategory {
  kind: 'number';
  weeklyEffectEnabled: boolean;
  weeklyEffectInverseEnabled?: boolean;
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
    // true (default) shows 24h clock times; false shows 12h times with AM/PM.
    use24HourClock: boolean;
    // Source categories whose latest prior entry each recorded period measures elapsed
    // minutes from (anchored at the period's start time).
    timeSinceCategoryIds: string[];
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

export interface EventTimeCategory extends BaseCategory {
  kind: 'event-time';
  eventTime: {
    // true (default) shows 24h clock times; false shows 12h times with AM/PM.
    use24HourClock: boolean;
    // Source categories whose latest prior entry each event measures elapsed minutes from.
    timeSinceCategoryIds: string[];
  };
}

export type CategoryDefinition =
  | ChoiceCategory
  | NumericCategory
  | DurationCategory
  | CounterCategory
  | NotesCategory
  | EventTimeCategory;

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
  // Set once the stop date is picked by hand; disables next-day rollover until Stop is pressed again.
  stopDateManual?: boolean;
  noteText?: string;
  sentimentScore?: number;
}
