import type {
  CategoryDefinition,
  CategoryGroup,
  CategorySelectionRecord,
} from './category';
import type { StatisticsSettings } from '../lib/statistics';

export const WHYYEE_TRANSFER_FORMAT = 'whyee-config' as const;
export const WHYYEE_TRANSFER_VERSION = 1 as const;

export interface WorkspaceTransferSnapshot {
  id: string;
  name: string;
  notes?: string;
  hidden?: boolean;
  categories: CategoryDefinition[];
  groups: CategoryGroup[];
  records: Record<string, CategorySelectionRecord>;
}

export interface AnalysisSettingsSnapshot {
  correlationOffset: number;
  topCorrelationThreshold: number;
  summaryLookback: number;
  statisticsSettings: StatisticsSettings;
}

export interface AppPreferencesSnapshot {
  activeWorkspaceId: string;
  categoryIndexExpanded: boolean;
}

export interface GlobalTransferSnapshot {
  analysisSettings: AnalysisSettingsSnapshot;
  appPreferences: AppPreferencesSnapshot;
}

export interface WorkspaceExportSelection {
  categoriesAndGroups: boolean;
  loggedData: boolean;
}

export interface ExportSelection {
  workspaces: Record<string, WorkspaceExportSelection>;
  analysisSettings: boolean;
  appPreferences: boolean;
}

export interface TransferWorkspaceSection {
  id: string;
  name: string;
  notes?: string;
  hidden?: boolean;
  categories?: CategoryDefinition[];
  groups?: CategoryGroup[];
  records?: Record<string, CategorySelectionRecord>;
}

export interface WhyeeTransferBundle {
  format: typeof WHYYEE_TRANSFER_FORMAT;
  version: typeof WHYYEE_TRANSFER_VERSION;
  exportedAt: string;
  workspaces: TransferWorkspaceSection[];
  globals: Partial<GlobalTransferSnapshot>;
}

export type ExportLayout = 'combined' | 'individual';

export interface TransferArchive {
  fileName: string;
  mimeType: 'application/json' | 'application/zip';
  bytes: Uint8Array;
}

export interface ParsedTransferArchive {
  bundle: WhyeeTransferBundle;
  fileName: string;
}

export type ImportMode = 'merge' | 'overwrite';
export type ConflictResolution = 'local' | 'imported';

export interface ImportConflict {
  id: string;
  workspaceId?: string;
  section:
    | 'category'
    | 'group'
    | 'record'
    | 'analysisSettings'
    | 'appPreferences';
  label: string;
  changedFields: string[];
  localValue: unknown;
  importedValue: unknown;
}

export interface ImportPlan {
  workspaces: WorkspaceTransferSnapshot[];
  globals: GlobalTransferSnapshot;
  conflicts: ImportConflict[];
}
