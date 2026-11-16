export interface ChartCategorySelection {
  enabled: boolean;
  selectedSeriesIds: string[];
  showInverses?: boolean;
}

export interface ChartSelection {
  categories: Record<string, ChartCategorySelection>;
}

export interface ChartPoint {
  key: string;
  timestamp: number;
  value: number | null;
  normalized: number | null;
}

export interface ChartSeries {
  id: string;
  name: string;
  label: string;
  color: string;
  raw: boolean;
  durationValue?: boolean;
  showMilliseconds?: boolean;
  points: ChartPoint[];
}

export interface ChartCategory {
  id: string;
  name: string;
  series: ChartSeries[];
  defaultSeriesId: string;
}
