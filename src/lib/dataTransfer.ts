import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { makeRecordKey } from './dates';
import type {
  ExportLayout,
  ExportSelection,
  ConflictResolution,
  GlobalTransferSnapshot,
  ImportConflict,
  ImportMode,
  ImportPlan,
  ParsedTransferArchive,
  TransferArchive,
  TransferWorkspaceSection,
  WhyeeTransferBundle,
  WorkspaceTransferSnapshot,
} from '../types/dataTransfer';
import {
  WHYYEE_TRANSFER_FORMAT,
  WHYYEE_TRANSFER_VERSION,
} from '../types/dataTransfer';

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const combinedJsonName = 'Whyee.config.json';
const manifestName = 'manifest.json';
const validFileName = /^Whyee(?:\.[A-Za-z0-9_-]+)*\.config\.(?:json|zip)$/;
const safeWorkspaceId = /^[A-Za-z0-9_-]+$/;

interface ArchiveManifest {
  format: typeof WHYYEE_TRANSFER_FORMAT;
  version: typeof WHYYEE_TRANSFER_VERSION;
  exportedAt: string;
  layout: ExportLayout;
}

const jsonBytes = (value: unknown): Uint8Array =>
  strToU8(`${JSON.stringify(value, null, 2)}\n`);

const parseJson = (bytes: Uint8Array, label: string): unknown => {
  try {
    return JSON.parse(strFromU8(bytes)) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
};

export const createTransferBundle = (
  workspaces: WorkspaceTransferSnapshot[],
  globals: GlobalTransferSnapshot,
  selection: ExportSelection,
  exportedAt = new Date().toISOString(),
): WhyeeTransferBundle => ({
  format: WHYYEE_TRANSFER_FORMAT,
  version: WHYYEE_TRANSFER_VERSION,
  exportedAt,
  workspaces: workspaces.flatMap((workspace) => {
    const selected = selection.workspaces[workspace.id];
    if (!selected?.categoriesAndGroups && !selected?.loggedData) return [];
    return [
      {
        id: workspace.id,
        name: workspace.name,
        ...(workspace.notes ? { notes: workspace.notes } : {}),
        ...(workspace.hidden ? { hidden: true } : {}),
        ...(selected.categoriesAndGroups
          ? { categories: workspace.categories, groups: workspace.groups }
          : {}),
        ...(selected.loggedData ? { records: workspace.records } : {}),
      },
    ];
  }),
  globals: {
    ...(selection.analysisSettings
      ? { analysisSettings: globals.analysisSettings }
      : {}),
    ...(selection.appPreferences
      ? { appPreferences: globals.appPreferences }
      : {}),
  },
});

const createIndividualFiles = (bundle: WhyeeTransferBundle): Zippable => {
  const files: Zippable = {};
  for (const workspace of bundle.workspaces) {
    if (workspace.categories || workspace.groups) {
      files[`workspaces/${workspace.id}/categories-groups.json`] = jsonBytes({
        id: workspace.id,
        name: workspace.name,
        ...(workspace.notes ? { notes: workspace.notes } : {}),
        ...(workspace.hidden ? { hidden: true } : {}),
        categories: workspace.categories,
        groups: workspace.groups,
      });
    }
    if (workspace.records) {
      files[`workspaces/${workspace.id}/logged-data.json`] = jsonBytes({
        id: workspace.id,
        name: workspace.name,
        ...(workspace.notes ? { notes: workspace.notes } : {}),
        ...(workspace.hidden ? { hidden: true } : {}),
        records: workspace.records,
      });
    }
  }
  if (bundle.globals.analysisSettings) {
    files['globals/analysis-settings.json'] = jsonBytes(
      bundle.globals.analysisSettings,
    );
  }
  if (bundle.globals.appPreferences) {
    files['globals/app-preferences.json'] = jsonBytes(
      bundle.globals.appPreferences,
    );
  }
  return files;
};

export const createTransferArchives = (
  bundle: WhyeeTransferBundle,
  layout: ExportLayout = 'combined',
  zipped = true,
): TransferArchive[] => {
  validateTransferBundle(bundle);
  if (zipped) {
    const manifest: ArchiveManifest = {
      format: WHYYEE_TRANSFER_FORMAT,
      version: WHYYEE_TRANSFER_VERSION,
      exportedAt: bundle.exportedAt,
      layout,
    };
    const files: Zippable = {
      [manifestName]: jsonBytes(manifest),
      ...(layout === 'combined'
        ? { [combinedJsonName]: jsonBytes(bundle) }
        : createIndividualFiles(bundle)),
    };
    return [
      {
        fileName: 'Whyee.config.zip',
        mimeType: 'application/zip',
        bytes: zipSync(files, { level: 6 }),
      },
    ];
  }

  if (layout === 'combined') {
    return [
      {
        fileName: combinedJsonName,
        mimeType: 'application/json',
        bytes: jsonBytes(bundle),
      },
    ];
  }

  const archives: TransferArchive[] = [];
  for (const workspace of bundle.workspaces) {
    if (workspace.categories || workspace.groups) {
      archives.push({
        fileName: `Whyee.${workspace.id}.categories-groups.config.json`,
        mimeType: 'application/json',
        bytes: jsonBytes({
          ...bundle,
          workspaces: [
            {
              id: workspace.id,
              name: workspace.name,
              ...(workspace.notes ? { notes: workspace.notes } : {}),
              ...(workspace.hidden ? { hidden: true } : {}),
              categories: workspace.categories,
              groups: workspace.groups,
            },
          ],
          globals: {},
        }),
      });
    }
    if (workspace.records) {
      archives.push({
        fileName: `Whyee.${workspace.id}.logged-data.config.json`,
        mimeType: 'application/json',
        bytes: jsonBytes({
          ...bundle,
          workspaces: [
            {
              id: workspace.id,
              name: workspace.name,
              ...(workspace.notes ? { notes: workspace.notes } : {}),
              ...(workspace.hidden ? { hidden: true } : {}),
              records: workspace.records,
            },
          ],
          globals: {},
        }),
      });
    }
  }
  if (bundle.globals.analysisSettings) {
    archives.push({
      fileName: 'Whyee.analysis-settings.config.json',
      mimeType: 'application/json',
      bytes: jsonBytes({
        ...bundle,
        workspaces: [],
        globals: { analysisSettings: bundle.globals.analysisSettings },
      }),
    });
  }
  if (bundle.globals.appPreferences) {
    archives.push({
      fileName: 'Whyee.app-preferences.config.json',
      mimeType: 'application/json',
      bytes: jsonBytes({
        ...bundle,
        workspaces: [],
        globals: { appPreferences: bundle.globals.appPreferences },
      }),
    });
  }
  return archives;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireBundleShape = (value: unknown): WhyeeTransferBundle => {
  if (!isObject(value) || value.format !== WHYYEE_TRANSFER_FORMAT) {
    throw new Error('This is not a Whyee configuration export.');
  }
  if (value.version !== WHYYEE_TRANSFER_VERSION) {
    throw new Error(
      `Unsupported Whyee configuration version: ${String(value.version)}.`,
    );
  }
  if (
    typeof value.exportedAt !== 'string' ||
    !Array.isArray(value.workspaces) ||
    !isObject(value.globals)
  ) {
    throw new Error('The Whyee configuration manifest is incomplete.');
  }
  return value as unknown as WhyeeTransferBundle;
};

const parseIndividualFiles = (
  files: Record<string, Uint8Array>,
  manifest: ArchiveManifest,
): WhyeeTransferBundle => {
  const workspaces = new Map<string, TransferWorkspaceSection>();
  const globals: WhyeeTransferBundle['globals'] = {};
  for (const [path, bytes] of Object.entries(files)) {
    if (path === manifestName) continue;
    if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
      throw new Error('The archive contains an unsafe file path.');
    }
    const workspaceMatch = path.match(
      /^workspaces\/([A-Za-z0-9_-]+)\/(categories-groups|logged-data)\.json$/,
    );
    if (workspaceMatch) {
      const [, id, section] = workspaceMatch;
      const value = parseJson(bytes, path);
      if (
        !isObject(value) ||
        value.id !== id ||
        typeof value.name !== 'string'
      ) {
        throw new Error(`${path} does not match its workspace manifest.`);
      }
      const current = workspaces.get(id) ?? { id, name: value.name };
      if (typeof value.notes === 'string') current.notes = value.notes;
      if (value.hidden === true) current.hidden = true;
      if (section === 'categories-groups') {
        if (!Array.isArray(value.categories) || !Array.isArray(value.groups)) {
          throw new Error(`${path} is missing categories or groups.`);
        }
        current.categories = value.categories as never[];
        current.groups = value.groups as never[];
      } else {
        if (!isObject(value.records))
          throw new Error(`${path} is missing records.`);
        current.records = value.records as never;
      }
      workspaces.set(id, current);
      continue;
    }
    if (path === 'globals/analysis-settings.json') {
      globals.analysisSettings = parseJson(bytes, path) as never;
      continue;
    }
    if (path === 'globals/app-preferences.json') {
      globals.appPreferences = parseJson(bytes, path) as never;
      continue;
    }
    throw new Error(`Unexpected file in Whyee archive: ${path}.`);
  }
  return {
    format: WHYYEE_TRANSFER_FORMAT,
    version: WHYYEE_TRANSFER_VERSION,
    exportedAt: manifest.exportedAt,
    workspaces: [...workspaces.values()],
    globals,
  };
};

export const parseTransferArchive = (
  fileName: string,
  bytes: Uint8Array,
): ParsedTransferArchive => {
  if (!validFileName.test(fileName)) {
    throw new Error(
      'Select a file named Whyee.*.config.json or Whyee.*.config.zip.',
    );
  }
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) {
    throw new Error('The selected configuration file is empty or too large.');
  }
  let bundle: WhyeeTransferBundle;
  if (fileName.endsWith('.json')) {
    bundle = requireBundleShape(parseJson(bytes, fileName));
  } else {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error('The selected ZIP archive is corrupt or unsupported.');
    }
    const expandedSize = Object.values(files).reduce(
      (total, file) => total + file.byteLength,
      0,
    );
    if (expandedSize > MAX_EXPANDED_BYTES) {
      throw new Error(
        'The selected ZIP archive expands beyond the supported size.',
      );
    }
    const rawManifest = files[manifestName];
    if (!rawManifest) throw new Error('The ZIP archive has no Whyee manifest.');
    const manifest = parseJson(rawManifest, manifestName);
    if (
      !isObject(manifest) ||
      manifest.format !== WHYYEE_TRANSFER_FORMAT ||
      manifest.version !== WHYYEE_TRANSFER_VERSION ||
      typeof manifest.exportedAt !== 'string' ||
      (manifest.layout !== 'combined' && manifest.layout !== 'individual')
    ) {
      throw new Error('The ZIP archive has an invalid Whyee manifest.');
    }
    bundle =
      manifest.layout === 'combined'
        ? requireBundleShape(
            parseJson(
              files[combinedJsonName] ?? new Uint8Array(),
              combinedJsonName,
            ),
          )
        : parseIndividualFiles(files, manifest as unknown as ArchiveManifest);
  }
  validateTransferBundle(bundle);
  return { bundle, fileName };
};

export const validateTransferBundle = (bundle: WhyeeTransferBundle): void => {
  requireBundleShape(bundle);
  const workspaceIds = new Set<string>();
  for (const workspace of bundle.workspaces) {
    if (!safeWorkspaceId.test(workspace.id) || !workspace.name.trim()) {
      throw new Error('Every workspace must have a safe ID and a name.');
    }
    if (
      (workspace.notes !== undefined && typeof workspace.notes !== 'string') ||
      (workspace.hidden !== undefined && typeof workspace.hidden !== 'boolean')
    ) {
      throw new Error(`${workspace.name} has invalid workspace details.`);
    }
    if (workspaceIds.has(workspace.id)) {
      throw new Error(`Duplicate workspace ID: ${workspace.id}.`);
    }
    workspaceIds.add(workspace.id);
    if (
      (workspace.categories === undefined) !==
      (workspace.groups === undefined)
    ) {
      throw new Error(
        `${workspace.name} must include categories and groups together.`,
      );
    }
    const categoryIds = new Set<string>();
    for (const category of workspace.categories ?? []) {
      if (!category?.id || categoryIds.has(category.id)) {
        throw new Error(
          `${workspace.name} contains a missing or duplicate category ID.`,
        );
      }
      categoryIds.add(category.id);
      for (const series of category.virtualSeries ?? []) {
        if (series.sourceCategoryId !== category.id) {
          throw new Error(
            `${category.name} contains an invalid virtual-series reference.`,
          );
        }
      }
    }
    const groupIds = new Set<string>();
    for (const group of workspace.groups ?? []) {
      if (!group?.id || groupIds.has(group.id)) {
        throw new Error(
          `${workspace.name} contains a missing or duplicate group ID.`,
        );
      }
      groupIds.add(group.id);
      if (group.categoryIds.some((id) => !categoryIds.has(id))) {
        throw new Error(
          `${group.name} references a category not included in ${workspace.name}.`,
        );
      }
    }
    for (const [key, record] of Object.entries(workspace.records ?? {})) {
      if (
        record.key !== key ||
        key !== makeRecordKey(record.dateKey, record.ordinal, record.categoryId)
      ) {
        throw new Error(
          `${workspace.name} contains an invalid logged-data key.`,
        );
      }
      if (workspace.categories && !categoryIds.has(record.categoryId)) {
        throw new Error(
          `${workspace.name} contains logged data for an unknown category.`,
        );
      }
    }
  }
  const settings = bundle.globals.analysisSettings;
  if (
    settings &&
    (!Number.isFinite(settings.correlationOffset) ||
      settings.correlationOffset < 0 ||
      settings.correlationOffset > 366 ||
      !Number.isFinite(settings.topCorrelationThreshold) ||
      settings.topCorrelationThreshold < 0 ||
      settings.topCorrelationThreshold > 1 ||
      !Number.isFinite(settings.summaryLookback) ||
      settings.summaryLookback < 1 ||
      settings.summaryLookback > 366)
  ) {
    throw new Error(
      'The archive contains analysis settings outside supported ranges.',
    );
  }
  const preferences = bundle.globals.appPreferences;
  if (
    preferences &&
    (typeof preferences.activeWorkspaceId !== 'string' ||
      !preferences.activeWorkspaceId ||
      typeof preferences.categoryIndexExpanded !== 'boolean')
  ) {
    throw new Error('The archive contains invalid app preferences.');
  }
};

const equal = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const changedFields = (
  localValue: unknown,
  importedValue: unknown,
): string[] => {
  if (!isObject(localValue) || !isObject(importedValue)) return ['value'];
  return [
    ...new Set([...Object.keys(localValue), ...Object.keys(importedValue)]),
  ]
    .filter((key) => !equal(localValue[key], importedValue[key]))
    .sort();
};

const chooseConflict = <T>(
  conflict: ImportConflict,
  localValue: T,
  importedValue: T,
  conflicts: ImportConflict[],
  defaultResolution: ConflictResolution,
  decisions: Record<string, ConflictResolution>,
): T => {
  conflicts.push(conflict);
  return (decisions[conflict.id] ?? defaultResolution) === 'imported'
    ? importedValue
    : localValue;
};

const mergeItems = <T extends { id: string; name?: string }>(
  workspaceId: string,
  section: 'category' | 'group',
  localItems: T[],
  importedItems: T[],
  conflicts: ImportConflict[],
  defaultResolution: ConflictResolution,
  decisions: Record<string, ConflictResolution>,
): T[] => {
  const importedById = new Map(importedItems.map((item) => [item.id, item]));
  const merged = localItems.map((localItem) => {
    const importedItem = importedById.get(localItem.id);
    if (!importedItem) return localItem;
    importedById.delete(localItem.id);
    if (equal(localItem, importedItem)) return localItem;
    const conflict: ImportConflict = {
      id: `${workspaceId}:${section}:${localItem.id}`,
      workspaceId,
      section,
      label: importedItem.name || localItem.name || localItem.id,
      changedFields: changedFields(localItem, importedItem),
      localValue: localItem,
      importedValue: importedItem,
    };
    return chooseConflict(
      conflict,
      localItem,
      importedItem,
      conflicts,
      defaultResolution,
      decisions,
    );
  });
  return [...merged, ...importedById.values()];
};

const mergeRecords = (
  workspaceId: string,
  localRecords: WorkspaceTransferSnapshot['records'],
  importedRecords: WorkspaceTransferSnapshot['records'],
  conflicts: ImportConflict[],
  defaultResolution: ConflictResolution,
  decisions: Record<string, ConflictResolution>,
): WorkspaceTransferSnapshot['records'] => {
  const merged = { ...localRecords };
  for (const [key, importedRecord] of Object.entries(importedRecords)) {
    const localRecord = localRecords[key];
    if (!localRecord || equal(localRecord, importedRecord)) {
      merged[key] = importedRecord;
      continue;
    }
    const conflict: ImportConflict = {
      id: `${workspaceId}:record:${key}`,
      workspaceId,
      section: 'record',
      label: `${importedRecord.dateKey} at ${importedRecord.localTime}`,
      changedFields: changedFields(localRecord, importedRecord),
      localValue: localRecord,
      importedValue: importedRecord,
    };
    merged[key] = chooseConflict(
      conflict,
      localRecord,
      importedRecord,
      conflicts,
      defaultResolution,
      decisions,
    );
  }
  return merged;
};

const mergeObject = <T extends Record<string, unknown>>(
  section: 'analysisSettings' | 'appPreferences',
  localValue: T,
  importedValue: Partial<T>,
  conflicts: ImportConflict[],
  defaultResolution: ConflictResolution,
  decisions: Record<string, ConflictResolution>,
): T => {
  const merged = { ...localValue };
  for (const key of Object.keys(importedValue) as Array<keyof T>) {
    const importedEntry = importedValue[key];
    const localEntry = localValue[key];
    if (equal(localEntry, importedEntry)) continue;
    const conflict: ImportConflict = {
      id: `global:${section}:${String(key)}`,
      section,
      label: String(key),
      changedFields: changedFields(localEntry, importedEntry),
      localValue: localEntry,
      importedValue: importedEntry,
    };
    merged[key] = chooseConflict(
      conflict,
      localEntry,
      importedEntry,
      conflicts,
      defaultResolution,
      decisions,
    ) as T[keyof T];
  }
  return merged;
};

/**
 * Default import target for one imported workspace: matches an existing
 * local workspace by id first, then by case-insensitive name, else 'new'.
 */
export const resolveDefaultImportTarget = (
  imported: TransferWorkspaceSection,
  localWorkspaces: WorkspaceTransferSnapshot[],
): string => {
  if (localWorkspaces.some((local) => local.id === imported.id))
    return imported.id;
  const nameMatch = localWorkspaces.find(
    (local) => local.name.toLowerCase() === imported.name.toLowerCase(),
  );
  return nameMatch ? nameMatch.id : 'new';
};

/**
 * Rewrites each imported workspace's id/name to the user-chosen target
 * before handing the bundle to buildImportPlan, which merges by id.
 */
export const remapImportedWorkspaces = (
  bundle: WhyeeTransferBundle,
  targets: Record<string, string>,
  localWorkspaces: WorkspaceTransferSnapshot[],
): WhyeeTransferBundle => {
  const localById = new Map(localWorkspaces.map((local) => [local.id, local]));
  const usedNewIds = new Set(localWorkspaces.map((local) => local.id));
  const workspaces = bundle.workspaces.map((workspace) => {
    const target = targets[workspace.id] ?? 'new';
    if (target !== 'new') {
      const local = localById.get(target);
      if (!local) return workspace;
      return { ...workspace, id: local.id, name: local.name };
    }
    let id = workspace.id;
    let suffix = 2;
    while (usedNewIds.has(id)) id = `${workspace.id}-${suffix++}`;
    usedNewIds.add(id);
    return { ...workspace, id };
  });
  return { ...bundle, workspaces };
};

export const buildImportPlan = (
  localWorkspaces: WorkspaceTransferSnapshot[],
  localGlobals: GlobalTransferSnapshot,
  imported: WhyeeTransferBundle,
  mode: ImportMode,
  defaultResolution: ConflictResolution = 'local',
  decisions: Record<string, ConflictResolution> = {},
): ImportPlan => {
  validateTransferBundle(imported);
  const conflicts: ImportConflict[] = [];
  const importedById = new Map(
    imported.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const workspaces = localWorkspaces.map((localWorkspace) => {
    const incoming = importedById.get(localWorkspace.id);
    if (!incoming) return localWorkspace;
    importedById.delete(localWorkspace.id);
    if (mode === 'overwrite') {
      return {
        ...localWorkspace,
        name: incoming.name,
        ...(incoming.notes === undefined ? {} : { notes: incoming.notes }),
        ...(incoming.hidden === undefined ? {} : { hidden: incoming.hidden }),
        ...(incoming.categories && incoming.groups
          ? { categories: incoming.categories, groups: incoming.groups }
          : {}),
        ...(incoming.records ? { records: incoming.records } : {}),
      };
    }
    const categories = incoming.categories
      ? mergeItems(
          localWorkspace.id,
          'category',
          localWorkspace.categories,
          incoming.categories,
          conflicts,
          defaultResolution,
          decisions,
        )
      : localWorkspace.categories;
    const groups = incoming.groups
      ? mergeItems(
          localWorkspace.id,
          'group',
          localWorkspace.groups,
          incoming.groups,
          conflicts,
          defaultResolution,
          decisions,
        )
      : localWorkspace.groups;
    const records = incoming.records
      ? mergeRecords(
          localWorkspace.id,
          localWorkspace.records,
          incoming.records,
          conflicts,
          defaultResolution,
          decisions,
        )
      : localWorkspace.records;
    return { ...localWorkspace, categories, groups, records };
  });

  for (const incoming of importedById.values()) {
    if (!incoming.categories || !incoming.groups || !incoming.records) {
      throw new Error(
        `Cannot create unknown workspace ${incoming.name} from a partial export.`,
      );
    }
    workspaces.push({
      id: incoming.id,
      name: incoming.name,
      notes: incoming.notes ?? '',
      hidden: incoming.hidden ?? false,
      categories: incoming.categories,
      groups: incoming.groups,
      records: incoming.records,
    });
  }

  let globals = localGlobals;
  if (imported.globals.analysisSettings) {
    globals = {
      ...globals,
      analysisSettings:
        mode === 'overwrite'
          ? imported.globals.analysisSettings
          : (mergeObject(
              'analysisSettings',
              globals.analysisSettings as unknown as Record<string, unknown>,
              imported.globals.analysisSettings as unknown as Record<
                string,
                unknown
              >,
              conflicts,
              defaultResolution,
              decisions,
            ) as unknown as GlobalTransferSnapshot['analysisSettings']),
    };
  }
  if (imported.globals.appPreferences) {
    globals = {
      ...globals,
      appPreferences:
        mode === 'overwrite'
          ? imported.globals.appPreferences
          : (mergeObject(
              'appPreferences',
              globals.appPreferences as unknown as Record<string, unknown>,
              imported.globals.appPreferences as unknown as Record<
                string,
                unknown
              >,
              conflicts,
              defaultResolution,
              decisions,
            ) as unknown as GlobalTransferSnapshot['appPreferences']),
    };
  }

  validateTransferBundle({
    format: WHYYEE_TRANSFER_FORMAT,
    version: WHYYEE_TRANSFER_VERSION,
    exportedAt: imported.exportedAt,
    workspaces,
    globals,
  });
  return { workspaces, globals, conflicts };
};
