export interface CorrelationCell {
  offset: number;
  value: number | null;
}

export interface CorrelationInputCategory {
  id: string;
  name: string;
  groupId?: string;
  scopeGroupId?: string;
  global?: boolean;
}

export interface CorrelationRow {
  label: string;
  leftCategoryId: string;
  rightCategoryId: string;
  cells: CorrelationCell[];
}

export interface CorrelationCacheEntry {
  inputHash: string;
  rows: CorrelationRow[];
  updatedAt: string;
}

export interface CorrelationRequest {
  categories: CorrelationInputCategory[];
  records: Array<{ categoryId: string; dateKey: string; value: number }>;
  offsets: number[];
}

export interface CorrelationCancellation {
  cancelled: boolean;
}

export interface CorrelationTask {
  promise: Promise<CorrelationRow[]>;
  cancel: () => void;
}

export interface CorrelationCellResult {
  leftCategoryId: string;
  rightCategoryId: string;
  offset: number;
  value: number | null;
}

export interface CorrelationResultBatch {
  cells: CorrelationCellResult[];
  completed: number;
  total: number;
}

export type CorrelationBatchListener = (batch: CorrelationResultBatch) => void;
