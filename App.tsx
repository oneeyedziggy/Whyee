import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react-native';
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  Button,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CategoryEditor } from './src/components/CategoryEditor';
import { CategoryInputCard } from './src/components/CategoryInputCard';
import { ChartsPanel } from './src/components/ChartsPanel';
import { CorrelationPanel } from './src/components/CorrelationPanel';
import { TopCorrelationsPanel } from './src/components/TopCorrelationsPanel';
import { SummaryPanel } from './src/components/SummaryPanel';
import { Panel } from './src/components/Panel';
import { InfoLink } from './src/components/InfoLink';
import { StatisticsSettings } from './src/components/StatisticsSettings';
import { SettingsDrawer } from './src/components/SettingsDrawer';
import { ExportDataModal } from './src/components/ExportDataModal';
import { ImportDataModal } from './src/components/ImportDataModal';
import {
  createDefaultCategory,
  getNextCategoryNameSequence,
} from './src/lib/category';
import { createDefaultGroup, normalizeGroups } from './src/lib/groups';
import {
  getLocalDateKey,
  getLocalTimeStamp,
  makeRecordKey,
} from './src/lib/dates';
import { createCorrelationInputHash } from './src/lib/hash';
import { createBuiltInTestDataset } from './src/lib/testDataset';
import { createVirtualCorrelationInput } from './src/lib/virtualSeries';
import {
  persistentStatePrefix,
  usePersistentState,
} from './src/hooks/usePersistentState';
import { WorkspacePicker } from './src/components/WorkspacePicker';
import { WorkspaceManagerModal } from './src/components/WorkspaceManagerModal';
import { DatePickerModal } from './src/components/DatePickerModal';
import { SystemScreen } from './src/components/SystemScreen';
import { confirmAction } from './src/lib/confirm';
import {
  createWorkspaceId,
  moveWorkspace,
  normalizeWorkspace,
  visibleWorkspaces,
} from './src/lib/workspaces';
import { colors } from './src/theme/tokens';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
  CategoryGroup,
} from './src/types/category';
import type { WorkspaceMeta } from './src/types/workspace';
import type {
  CorrelationCacheEntry,
  CorrelationRow,
} from './src/types/correlation';
import {
  createDefaultStatisticsSettings,
  isStatisticEnabled,
  type StatisticsSettings as StatisticsSettingsState,
} from './src/lib/statistics';
import { runCorrelation } from './src/workers/correlationRunner';
import {
  calculateWeeklyEffects,
  type WeeklyEffectResult,
} from './src/lib/weeklyEffects';
import type {
  GlobalTransferSnapshot,
  ImportPlan,
  WorkspaceTransferSnapshot,
} from './src/types/dataTransfer';

const createOffsets = (maximum: number): number[] =>
  Array.from({ length: maximum + 1 }, (_, index) => index);
const cachePrefix = 'correlation.mobile.v5.cache.';
const correlationPublishIntervalMs = 120;
type MobilePage = 'daily' | 'stats';

const initialCategories = (): CategoryDefinition[] => [
  createDefaultCategory('multiple-choice', 0, 'Mood', 1),
  createDefaultCategory('number', 1, 'Energy', 1),
];

const App = () => {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [editorOpen, setEditorOpen] = useState(false);
  const [statisticsSettingsOpen, setStatisticsSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [workspaceManagerOpen, setWorkspaceManagerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [page, setPage] = useState<MobilePage>('daily');
  const [statsRenderStage, setStatsRenderStage] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('default-group');
  const [workspaceList, setWorkspaceList, workspaceListHydrated] =
    usePersistentState<WorkspaceMeta[]>('workspaces.v1', []);
  const [
    categoriesByWorkspace,
    setCategoriesByWorkspace,
    categoriesByWorkspaceHydrated,
  ] = usePersistentState<Record<string, CategoryDefinition[]>>(
    'categoriesByWorkspace.v1',
    {},
  );
  const [groupsByWorkspace, setGroupsByWorkspace, groupsByWorkspaceHydrated] =
    usePersistentState<Record<string, CategoryGroup[]>>(
      'groupsByWorkspace.v1',
      {},
    );
  const [
    recordsByWorkspace,
    setRecordsByWorkspace,
    recordsByWorkspaceHydrated,
  ] = usePersistentState<
    Record<string, Record<string, CategorySelectionRecord>>
  >('recordsByWorkspace.v1', {});
  const [activeWorkspaceId, setActiveWorkspaceId, activeWorkspaceIdHydrated] =
    usePersistentState<string>('activeWorkspaceId.v1', 'user');
  const [migrated, setMigrated] = useState(false);
  const migrationChecked = useRef(false);
  const [correlationOffset, setCorrelationOffset, correlationOffsetHydrated] =
    usePersistentState<number>('correlation.offset.v1', 7);
  const [
    topCorrelationThreshold,
    setTopCorrelationThreshold,
    topCorrelationThresholdHydrated,
  ] = usePersistentState<number>('correlation.topThreshold.v1', 0.7);
  const [summaryLookback, setSummaryLookback, summaryLookbackHydrated] =
    usePersistentState<number>('statistics.summaryLookback.v1', 7);
  const [
    statisticsSettings,
    setStatisticsSettings,
    statisticsSettingsHydrated,
  ] = usePersistentState<StatisticsSettingsState>(
    'statistics.settings.v2',
    createDefaultStatisticsSettings,
  );
  const [rows, setRows] = useState<CorrelationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [weeklyEffects, setWeeklyEffects] = useState<WeeklyEffectResult[]>([]);
  const testDatasetMigrationChecked = useRef(false);

  const hydrated =
    workspaceListHydrated &&
    categoriesByWorkspaceHydrated &&
    groupsByWorkspaceHydrated &&
    recordsByWorkspaceHydrated &&
    activeWorkspaceIdHydrated &&
    migrated &&
    topCorrelationThresholdHydrated &&
    statisticsSettingsHydrated &&
    correlationOffsetHydrated &&
    summaryLookbackHydrated;
  const safeCorrelationOffset = Math.min(
    366,
    Math.max(0, Math.round(correlationOffset)),
  );
  const safeTopCorrelationThreshold = Math.min(
    1,
    Math.max(0, topCorrelationThreshold),
  );
  const safeSummaryLookback = Math.min(
    366,
    Math.max(1, Math.round(summaryLookback)),
  );
  const statsVisible = desktop || page === 'stats';

  useEffect(() => {
    if (!statsVisible) {
      setStatsRenderStage(0);
      return undefined;
    }
    let active = true;
    let frame = requestAnimationFrame(function revealNextSection() {
      if (!active) return;
      setStatsRenderStage((current) => {
        if (current >= 5) return current;
        frame = requestAnimationFrame(revealNextSection);
        return current + 1;
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [activeWorkspaceId, statsVisible]);
  const offsets = useMemo(
    () => createOffsets(safeCorrelationOffset),
    [safeCorrelationOffset],
  );
  const categories = useMemo(
    () =>
      (categoriesByWorkspace[activeWorkspaceId] ?? []).map(
        (category, index, source) => ({
          ...category,
          nameSequence:
            category.nameSequence ??
            source
              .slice(0, index + 1)
              .filter((candidate) => candidate.kind === category.kind).length,
          ...(category.kind === 'duration'
            ? {
                duration: {
                  ...category.duration,
                  resetEnabled: category.duration.resetEnabled ?? true,
                  cumulative: category.duration.cumulative ?? false,
                  animate: category.duration.animate ?? true,
                },
              }
            : {}),
          enabled: category.enabled ?? true,
          notesEnabled: category.notesEnabled ?? false,
          sentimentEnabled: category.sentimentEnabled ?? false,
          correlateWithinGroup: category.correlateWithinGroup ?? false,
          allowMultiplePerDay: category.allowMultiplePerDay ?? false,
          mainAggregation: category.mainAggregation ?? 'mean',
          virtualSeries: category.virtualSeries ?? [],
        }),
      ) as CategoryDefinition[],
    [activeWorkspaceId, categoriesByWorkspace],
  );
  const groups = useMemo(
    () => normalizeGroups(groupsByWorkspace[activeWorkspaceId], categories),
    [activeWorkspaceId, categories, groupsByWorkspace],
  );
  const records = recordsByWorkspace[activeWorkspaceId] ?? {};
  const enabledCategories = useMemo(
    () => categories.filter((category) => category.enabled),
    [categories],
  );
  const dailySections = useMemo(() => {
    const byId = new Map(
      enabledCategories.map((category) => [category.id, category]),
    );
    const grouped = groups.map((group) => ({
      id: group.id,
      name: group.name,
      categories: group.categoryIds
        .map((id) => byId.get(id))
        .filter((category): category is CategoryDefinition =>
          Boolean(category),
        ),
    }));
    const assigned = new Set(
      grouped.flatMap((group) => group.categories.map((c) => c.id)),
    );
    const ungrouped = enabledCategories.filter(
      (category) => !assigned.has(category.id),
    );
    return [
      ...grouped,
      ...(ungrouped.length
        ? [{ id: 'ungrouped', name: 'Ungrouped', categories: ungrouped }]
        : []),
    ].filter((group) => group.categories.length > 0);
  }, [enabledCategories, groups]);
  const correlationCategories = useMemo(() => {
    const byId = new Map(
      enabledCategories.map((category) => [category.id, category]),
    );
    const ordered = groups.flatMap((group) =>
      group.categoryIds
        .map((categoryId) => byId.get(categoryId))
        .filter((category): category is CategoryDefinition =>
          Boolean(category),
        ),
    );
    const included = new Set(ordered.map((category) => category.id));
    return [
      ...ordered,
      ...enabledCategories.filter((category) => !included.has(category.id)),
    ];
  }, [enabledCategories, groups]);
  // Correlation results are cached independently of category order, so display
  // order is re-applied here. Virtual-series ids are `${categoryId}:...` and
  // category ids never contain a colon.
  const orderedRows = useMemo(() => {
    const order = new Map(
      correlationCategories.map((category, index) => [category.id, index]),
    );
    const rank = (seriesId: string) =>
      order.get(seriesId.split(':')[0]) ?? Number.MAX_SAFE_INTEGER;
    return [...rows].sort((left, right) => {
      const leftPair = [
        rank(left.leftCategoryId),
        rank(left.rightCategoryId),
      ].sort((first, second) => first - second);
      const rightPair = [
        rank(right.leftCategoryId),
        rank(right.rightCategoryId),
      ].sort((first, second) => first - second);
      return (
        leftPair[0] - rightPair[0] ||
        leftPair[1] - rightPair[1] ||
        rank(left.leftCategoryId) - rank(right.leftCategoryId)
      );
    });
  }, [correlationCategories, rows]);
  const [collapsedDailyGroups, setCollapsedDailyGroups] = useState<
    Record<string, boolean>
  >({});
  const [categoryIndexExpanded, setCategoryIndexExpanded] =
    usePersistentState<boolean>('daily.categoryIndexExpanded.v1', true);
  const transferWorkspaces = useMemo<WorkspaceTransferSnapshot[]>(
    () =>
      workspaceList.map((workspace) => ({
        ...normalizeWorkspace(workspace),
        categories: categoriesByWorkspace[workspace.id] ?? [],
        groups: groupsByWorkspace[workspace.id] ?? [],
        records: recordsByWorkspace[workspace.id] ?? {},
      })),
    [
      categoriesByWorkspace,
      groupsByWorkspace,
      recordsByWorkspace,
      workspaceList,
    ],
  );
  const transferGlobals = useMemo<GlobalTransferSnapshot>(
    () => ({
      analysisSettings: {
        correlationOffset: safeCorrelationOffset,
        topCorrelationThreshold: safeTopCorrelationThreshold,
        summaryLookback: safeSummaryLookback,
        statisticsSettings,
      },
      appPreferences: { activeWorkspaceId, categoryIndexExpanded },
    }),
    [
      activeWorkspaceId,
      categoryIndexExpanded,
      safeCorrelationOffset,
      safeSummaryLookback,
      safeTopCorrelationThreshold,
      statisticsSettings,
    ],
  );
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const categoryAnchors = useRef<Record<string, View | null>>({});
  const scrollToCategory = (categoryId: string) => {
    const anchor = categoryAnchors.current[categoryId];
    const scroller = scrollRef.current;
    if (!anchor || !scroller) return;
    anchor.measureInWindow((_x, anchorY) => {
      (scroller as unknown as View).measureInWindow((_scrollX, scrollY) => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollOffset.current + anchorY - scrollY - 8),
          animated: true,
        });
      });
    });
  };
  const selectedDateKey = getLocalDateKey(selectedDate);
  const todayKey = getLocalDateKey();
  const selectedDateLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const applyUpdater = <T,>(updater: SetStateAction<T>, current: T): T =>
    typeof updater === 'function'
      ? (updater as (prev: T) => T)(current)
      : updater;
  const setCategories = (updater: SetStateAction<CategoryDefinition[]>) =>
    setCategoriesByWorkspace((current) => ({
      ...current,
      [activeWorkspaceId]: applyUpdater(
        updater,
        current[activeWorkspaceId] ?? [],
      ),
    }));
  const setGroups = (updater: SetStateAction<CategoryGroup[]>) =>
    setGroupsByWorkspace((current) => ({
      ...current,
      [activeWorkspaceId]: applyUpdater(
        updater,
        current[activeWorkspaceId] ?? [],
      ),
    }));
  const setRecords = (
    updater: SetStateAction<Record<string, CategorySelectionRecord>>,
  ) =>
    setRecordsByWorkspace((current) => ({
      ...current,
      [activeWorkspaceId]: applyUpdater(
        updater,
        current[activeWorkspaceId] ?? {},
      ),
    }));

  const workspaces = useMemo(
    () => workspaceList.map(normalizeWorkspace),
    [workspaceList],
  );
  const pickableWorkspaces = useMemo(
    () => visibleWorkspaces(workspaces),
    [workspaces],
  );
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const addWorkspace = (name: string, notes: string) => {
    const id = createWorkspaceId(
      name,
      workspaces.map((workspace) => workspace.id),
    );
    const seedCategories = initialCategories();
    setWorkspaceList((current) => [
      ...current,
      { id, name, notes, hidden: false },
    ]);
    setCategoriesByWorkspace((current) => ({
      ...current,
      [id]: seedCategories,
    }));
    setGroupsByWorkspace((current) => ({
      ...current,
      [id]: [createDefaultGroup(seedCategories)],
    }));
    setRecordsByWorkspace((current) => ({ ...current, [id]: {} }));
    setActiveWorkspaceId(id);
  };
  const updateWorkspace = (id: string, patch: Partial<WorkspaceMeta>) =>
    setWorkspaceList((current) =>
      current.map((workspace) =>
        workspace.id === id ? { ...workspace, ...patch } : workspace,
      ),
    );
  const reorderWorkspaces = (from: number, to: number) =>
    setWorkspaceList((current) => moveWorkspace(current, from, to));
  const deleteWorkspace = (id: string) => {
    const workspace = workspaces.find((candidate) => candidate.id === id);
    if (!workspace || workspaces.length < 2) return;
    confirmAction(
      `Delete ${workspace.name}?`,
      'Its categories and logged data are removed from this device.',
      'Delete',
      () => {
        const drop = <T,>(current: Record<string, T>): Record<string, T> => {
          const next = { ...current };
          delete next[id];
          return next;
        };
        setWorkspaceList((current) =>
          current.filter((candidate) => candidate.id !== id),
        );
        setCategoriesByWorkspace(drop);
        setGroupsByWorkspace(drop);
        setRecordsByWorkspace(drop);
        AsyncStorage.removeItem(`${cachePrefix}${id}`).catch(() => undefined);
      },
    );
  };

  // Keep the active workspace on something the picker can actually show.
  useEffect(() => {
    if (!migrated || !workspaceList.length) return;
    if (pickableWorkspaces.some((w) => w.id === activeWorkspaceId)) return;
    const fallback = pickableWorkspaces[0] ?? workspaces[0];
    if (fallback && fallback.id !== activeWorkspaceId)
      setActiveWorkspaceId(fallback.id);
  }, [
    activeWorkspaceId,
    migrated,
    pickableWorkspaces,
    setActiveWorkspaceId,
    workspaceList.length,
    workspaces,
  ]);

  useEffect(() => {
    if (
      !selectedCategoryId ||
      !categories.some((category) => category.id === selectedCategoryId)
    )
      setSelectedCategoryId(categories[0]?.id ?? '');
  }, [categories, selectedCategoryId]);

  // One-time migration from the old fixed user/test storage keys into the
  // dynamic per-workspace maps; skipped once a workspace list already exists.
  useEffect(() => {
    if (
      migrationChecked.current ||
      !workspaceListHydrated ||
      !categoriesByWorkspaceHydrated ||
      !groupsByWorkspaceHydrated ||
      !recordsByWorkspaceHydrated
    )
      return;
    migrationChecked.current = true;
    if (workspaceList.length) {
      setMigrated(true);
      return;
    }
    const readLegacy = async <T,>(key: string): Promise<T | null> => {
      try {
        const raw = await AsyncStorage.getItem(
          `${persistentStatePrefix}${key}`,
        );
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    };
    (async () => {
      const legacyUserCategories =
        (await readLegacy<CategoryDefinition[]>('categories.v4')) ??
        initialCategories();
      const legacyUserGroups = (await readLegacy<CategoryGroup[]>(
        'groups.v4',
      )) ?? [createDefaultGroup(legacyUserCategories)];
      const legacyUserRecords =
        (await readLegacy<Record<string, CategorySelectionRecord>>(
          'records.v4',
        )) ?? {};
      const testDataset = createBuiltInTestDataset();
      const legacyTestCategories =
        (await readLegacy<CategoryDefinition[]>('testCategories.v10')) ??
        testDataset.categories;
      const legacyTestGroups = (await readLegacy<CategoryGroup[]>(
        'testGroups.v4',
      )) ?? [createDefaultGroup(legacyTestCategories)];
      const legacyTestRecords =
        (await readLegacy<Record<string, CategorySelectionRecord>>(
          'testRecords.v10',
        )) ?? testDataset.records;
      setWorkspaceList([
        { id: 'user', name: 'User', notes: '', hidden: false },
        { id: 'test', name: 'Test', notes: '', hidden: false },
      ]);
      setCategoriesByWorkspace({
        user: legacyUserCategories,
        test: legacyTestCategories,
      });
      setGroupsByWorkspace({
        user: legacyUserGroups,
        test: legacyTestGroups,
      });
      setRecordsByWorkspace({
        user: legacyUserRecords,
        test: legacyTestRecords,
      });
      setMigrated(true);
    })();
  }, [
    categoriesByWorkspaceHydrated,
    groupsByWorkspaceHydrated,
    recordsByWorkspaceHydrated,
    setCategoriesByWorkspace,
    setGroupsByWorkspace,
    setRecordsByWorkspace,
    setWorkspaceList,
    workspaceList.length,
    workspaceListHydrated,
  ]);

  useEffect(() => {
    if (!migrated || testDatasetMigrationChecked.current) return;
    testDatasetMigrationChecked.current = true;
    if ((categoriesByWorkspace.test ?? []).length === 25) return;

    const testDataset = createBuiltInTestDataset();
    setCategoriesByWorkspace((current) => ({
      ...current,
      test: testDataset.categories,
    }));
    setRecordsByWorkspace((current) => ({
      ...current,
      test: testDataset.records,
    }));
  }, [
    categoriesByWorkspace.test,
    migrated,
    setCategoriesByWorkspace,
    setRecordsByWorkspace,
  ]);

  useEffect(() => {
    if (!hydrated || !statsVisible) {
      setLoading(false);
      return;
    }
    if (
      !isStatisticEnabled(statisticsSettings, 'correlation.section') &&
      !isStatisticEnabled(statisticsSettings, 'correlation.top-matches')
    ) {
      setRows([]);
      setLoading(false);
      return;
    }
    const includeCalendar = isStatisticEnabled(
      statisticsSettings,
      'calendar.section',
    );
    const inputHash = createCorrelationInputHash(
      correlationCategories,
      records,
      offsets,
      includeCalendar,
      groups,
    );
    const cacheKey = `${cachePrefix}${activeWorkspaceId}`;
    let active = true;
    let correlationTask: ReturnType<typeof runCorrelation> | null = null;
    let publicationTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    AsyncStorage.getItem(cacheKey)
      .then((raw) => {
        if (!active) return null;
        const cached = raw ? (JSON.parse(raw) as CorrelationCacheEntry) : null;
        if (cached?.inputHash === inputHash) return cached.rows;
        const request = createVirtualCorrelationInput(
          correlationCategories,
          records,
          offsets,
          includeCalendar,
          groups,
        );
        setRows([]);
        const categoryById = new Map(
          request.categories.map((category, index) => [
            category.id,
            { category, index },
          ]),
        );
        const accumulatedRows = new Map<
          string,
          {
            row: Omit<CorrelationRow, 'cells'>;
            cellsByOffset: Map<number, CorrelationRow['cells'][number]>;
          }
        >();
        const publishAccumulatedRows = () => {
          publicationTimer = null;
          if (!active) return;
          const nextRows = [...accumulatedRows.values()]
            .sort((first, second) => {
              const firstLeft = categoryById.get(
                first.row.leftCategoryId,
              )!.index;
              const firstRight = categoryById.get(
                first.row.rightCategoryId,
              )!.index;
              const secondLeft = categoryById.get(
                second.row.leftCategoryId,
              )!.index;
              const secondRight = categoryById.get(
                second.row.rightCategoryId,
              )!.index;
              const firstPair = [
                Math.min(firstLeft, firstRight),
                Math.max(firstLeft, firstRight),
              ];
              const secondPair = [
                Math.min(secondLeft, secondRight),
                Math.max(secondLeft, secondRight),
              ];
              return (
                firstPair[0] - secondPair[0] ||
                firstPair[1] - secondPair[1] ||
                firstLeft - secondLeft
              );
            })
            .map(({ row, cellsByOffset }) => ({
              ...row,
              cells: [...cellsByOffset.values()].sort(
                (first, second) => first.offset - second.offset,
              ),
            }));
          startTransition(() => setRows(nextRows));
        };
        correlationTask = runCorrelation(request, (batch) => {
          if (!active) return;
          for (const cell of batch.cells) {
            const left = categoryById.get(cell.leftCategoryId)?.category;
            const right = categoryById.get(cell.rightCategoryId)?.category;
            if (!left || !right) continue;
            const key = `${left.id}:${right.id}`;
            const accumulated = accumulatedRows.get(key) ?? {
              row: {
                label: `${left.name} x ${right.name}`,
                leftCategoryId: left.id,
                rightCategoryId: right.id,
              },
              cellsByOffset: new Map(),
            };
            accumulated.cellsByOffset.set(cell.offset, {
              offset: cell.offset,
              value: cell.value,
            });
            accumulatedRows.set(key, accumulated);
          }
          if (!publicationTimer)
            publicationTimer = setTimeout(
              publishAccumulatedRows,
              correlationPublishIntervalMs,
            );
        });
        return correlationTask.promise.then((nextRows) => {
          if (!active) return null;
          if (publicationTimer) {
            clearTimeout(publicationTimer);
            publicationTimer = null;
          }
          const entry: CorrelationCacheEntry = {
            inputHash,
            rows: nextRows,
            updatedAt: new Date().toISOString(),
          };
          return AsyncStorage.setItem(cacheKey, JSON.stringify(entry)).then(
            () => nextRows,
          );
        });
      })
      .then((nextRows) => {
        if (active && nextRows) setRows(nextRows);
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (publicationTimer) clearTimeout(publicationTimer);
      correlationTask?.cancel();
    };
  }, [
    activeWorkspaceId,
    correlationCategories,
    groups,
    hydrated,
    offsets,
    records,
    statisticsSettings,
    statsVisible,
  ]);

  useEffect(() => {
    const needsWeeklyEffects =
      isStatisticEnabled(statisticsSettings, 'weekly.section') ||
      isStatisticEnabled(statisticsSettings, 'summary.weekly-effect') ||
      isStatisticEnabled(statisticsSettings, 'summary.weekly-phase') ||
      isStatisticEnabled(statisticsSettings, 'summary.weekly-offset');
    if (!hydrated || !statsVisible || !needsWeeklyEffects) {
      setWeeklyEffects([]);
      return;
    }
    setWeeklyEffects(
      calculateWeeklyEffects(enabledCategories, records, offsets),
    );
  }, [
    enabledCategories,
    hydrated,
    offsets,
    records,
    statisticsSettings,
    statsVisible,
  ]);

  const changeDay = (offset: number) =>
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + offset);
      return next;
    });
  const updateValue = (categoryId: string, value: number) => {
    const key = makeRecordKey(selectedDateKey, 0, categoryId);
    setRecords((current) => ({
      ...current,
      [key]: {
        key,
        categoryId,
        dateKey: selectedDateKey,
        ordinal: 0,
        localTime: getLocalTimeStamp(),
        value,
      },
    }));
  };
  const addCategory = (kind: CategoryDefinition['kind']) =>
    setCategories((current) => {
      const sequence = getNextCategoryNameSequence(current, kind);
      const category = createDefaultCategory(
        kind,
        current.length,
        undefined,
        sequence,
      );
      setSelectedCategoryId(category.id);
      return [...current, category];
    });
  const addCategoryToGroup = (groupId: string) => {
    const sequence = getNextCategoryNameSequence(categories, 'multiple-choice');
    const category = createDefaultCategory(
      'multiple-choice',
      categories.length,
      undefined,
      sequence,
    );
    setCategories((current) => [...current, category]);
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              categoryIds: [...group.categoryIds, category.id],
              expanded: true,
            }
          : group,
      ),
    );
    setSelectedCategoryId(category.id);
    setSelectedGroupId('');
  };
  const addGroup = () =>
    setGroups((current) => [
      ...current,
      {
        id: `group-${Date.now()}`,
        name: `Group ${current.length + 1}`,
        categoryIds: [],
        expanded: true,
      },
    ]);
  const updateGroup = (nextGroup: CategoryGroup) =>
    setGroups((current) =>
      current.map((group) => (group.id === nextGroup.id ? nextGroup : group)),
    );
  const restoreDefaults = () => {
    if (activeWorkspaceId !== 'user') return;
    const defaultCategories = initialCategories();
    const missingDefaults = defaultCategories.filter(
      (category) =>
        !categories.some((existing) => existing.name === category.name),
    );
    if (!missingDefaults.length) return;
    setCategories((current) => {
      return [...current, ...missingDefaults];
    });
    setGroups((current) => {
      const defaultGroup =
        current.find((group) => group.id === 'default-group') ?? current[0];
      if (!defaultGroup) return [createDefaultGroup(defaultCategories)];
      const missing = missingDefaults.map((category) => category.id);
      return current.map((group) =>
        group.id === defaultGroup.id
          ? {
              ...group,
              categoryIds: [
                ...group.categoryIds,
                ...missing.filter((id) => !group.categoryIds.includes(id)),
              ],
            }
          : group,
      );
    });
  };
  const deleteGroup = (groupId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    if (!group.categoryIds.length) {
      setGroups((current) =>
        current.filter((candidate) => candidate.id !== groupId),
      );
      return;
    }
    Alert.alert(
      `Delete ${group.name}?`,
      'Choose what should happen to its categories.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete categories',
          style: 'destructive',
          onPress: () => {
            setGroups((current) =>
              current.filter((candidate) => candidate.id !== groupId),
            );
            setCategories((current) =>
              current.filter(
                (category) => !group.categoryIds.includes(category.id),
              ),
            );
          },
        },
        {
          text: 'Move to General',
          onPress: () => {
            setGroups((current) => {
              const remaining = current.filter(
                (candidate) => candidate.id !== groupId,
              );
              const destination =
                remaining.find(
                  (candidate) => candidate.id === 'default-group',
                ) ?? remaining[0];
              if (!destination) return remaining;
              return remaining.map((candidate) =>
                candidate.id === destination.id
                  ? {
                      ...candidate,
                      categoryIds: [
                        ...candidate.categoryIds,
                        ...group.categoryIds.filter(
                          (id) => !candidate.categoryIds.includes(id),
                        ),
                      ],
                    }
                  : candidate,
              );
            });
          },
        },
      ],
    );
  };
  const updateCategory = (next: CategoryDefinition) =>
    setCategories((current) =>
      current.map((category) => {
        if (category.id !== next.id) return category;
        const { savedTypeSettings: ignored, ...activeSettings } = next;
        return {
          ...next,
          savedTypeSettings: {
            ...(next.savedTypeSettings ?? {}),
            [next.kind]: activeSettings,
          },
        };
      }),
    );
  const deleteCategory = (id: string) =>
    setCategories((current) =>
      current.filter((category) => category.id !== id),
    );
  const entriesForCategory = (categoryId: string) =>
    Object.values(records)
      .filter(
        (record) =>
          record.categoryId === categoryId &&
          record.dateKey === selectedDateKey,
      )
      .sort((left, right) => left.ordinal - right.ordinal);
  const updateEntry = (entry: CategorySelectionRecord) =>
    setRecords((current) => ({ ...current, [entry.key]: entry }));
  const addEntry = (
    categoryId: string,
    initial: Partial<CategorySelectionRecord> = {},
  ) =>
    setRecords((current) => {
      const existing = Object.values(current).filter(
        (record) =>
          record.categoryId === categoryId &&
          record.dateKey === selectedDateKey,
      );
      const ordinal =
        existing.reduce(
          (highest, record) => Math.max(highest, record.ordinal),
          -1,
        ) + 1;
      const key = makeRecordKey(selectedDateKey, ordinal, categoryId);
      return {
        ...current,
        [key]: {
          key,
          categoryId,
          dateKey: selectedDateKey,
          ordinal,
          localTime: getLocalTimeStamp(),
          value: 0,
          instanceId: `${categoryId}:${ordinal}`,
          ...initial,
        },
      };
    });
  const deleteEntry = (entry: CategorySelectionRecord) =>
    setRecords((current) => {
      const next = { ...current };
      delete next[entry.key];
      return next;
    });

  const applyImportPlan = (plan: ImportPlan) => {
    if (!plan.workspaces.length)
      throw new Error('The import plan is missing a workspace.');
    const nextCategoriesByWorkspace: Record<string, CategoryDefinition[]> = {};
    const nextGroupsByWorkspace: Record<string, CategoryGroup[]> = {};
    const nextRecordsByWorkspace: Record<
      string,
      Record<string, CategorySelectionRecord>
    > = {};
    for (const workspace of plan.workspaces) {
      nextCategoriesByWorkspace[workspace.id] = workspace.categories;
      nextGroupsByWorkspace[workspace.id] = workspace.groups;
      nextRecordsByWorkspace[workspace.id] = workspace.records;
    }
    const nextActiveWorkspaceId =
      plan.workspaces.find(
        (workspace) =>
          workspace.id === plan.globals.appPreferences.activeWorkspaceId &&
          !workspace.hidden,
      )?.id ??
      plan.workspaces.find((workspace) => !workspace.hidden)?.id ??
      plan.workspaces[0].id;

    setWorkspaceList(
      plan.workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        notes:
          workspace.notes ??
          workspaces.find((candidate) => candidate.id === workspace.id)
            ?.notes ??
          '',
        hidden:
          workspace.hidden ??
          workspaces.find((candidate) => candidate.id === workspace.id)
            ?.hidden ??
          false,
      })),
    );
    setCategoriesByWorkspace(nextCategoriesByWorkspace);
    setGroupsByWorkspace(nextGroupsByWorkspace);
    setRecordsByWorkspace(nextRecordsByWorkspace);
    setCorrelationOffset(plan.globals.analysisSettings.correlationOffset);
    setTopCorrelationThreshold(
      plan.globals.analysisSettings.topCorrelationThreshold,
    );
    setSummaryLookback(plan.globals.analysisSettings.summaryLookback);
    setStatisticsSettings(plan.globals.analysisSettings.statisticsSettings);
    setActiveWorkspaceId(nextActiveWorkspaceId);
    setCategoryIndexExpanded(plan.globals.appPreferences.categoryIndexExpanded);
  };

  const moveCategory = (
    categoryId: string,
    targetGroupId: string,
    targetIndex: number,
  ) =>
    setGroups((current) =>
      current.map((group) => {
        const without = group.categoryIds.filter((id) => id !== categoryId);
        if (group.id !== targetGroupId)
          return { ...group, categoryIds: without };
        const insertAt = Math.max(0, Math.min(targetIndex, without.length));
        return {
          ...group,
          categoryIds: [
            ...without.slice(0, insertAt),
            categoryId,
            ...without.slice(insertAt),
          ],
        };
      }),
    );

  const dailyPanel = (
    <View style={styles.dailyPage}>
      {!desktop ? (
        <Pressable
          accessibilityLabel="Open category editor"
          accessibilityRole="button"
          onPress={() => setEditorOpen(true)}
          style={styles.dailyEditButton}
        >
          <Text style={styles.dailyEditButtonText}>Edit categories</Text>
        </Pressable>
      ) : null}
      <Panel
        title="Daily entry"
        subtitle="Select a value for each category."
        infoSection="daily-input"
      >
      <View style={styles.categoryIndex}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: categoryIndexExpanded }}
          onPress={() => setCategoryIndexExpanded(!categoryIndexExpanded)}
          style={styles.dailyGroupHeader}
        >
          <Text style={styles.dailyGroupTitle}>Categories</Text>
          <Text style={styles.dailyGroupChevron}>
            {categoryIndexExpanded ? '\u2212' : '+'}
          </Text>
        </Pressable>
        {categoryIndexExpanded ? (
          <>
            <View style={styles.categoryNames}>
              {enabledCategories.map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="link"
                  accessibilityLabel={`Jump to ${category.name}`}
                  onPress={() => scrollToCategory(category.id)}
                  style={styles.categoryChip}
                >
                  <Text style={styles.categoryChipText}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
      {enabledCategories.length ? (
        dailySections.map((section) => {
          const expanded = collapsedDailyGroups[section.id] !== true;
          return (
            <View key={section.id} style={styles.dailyGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() =>
                  setCollapsedDailyGroups((current) => ({
                    ...current,
                    [section.id]: expanded,
                  }))
                }
                style={styles.dailyGroupHeader}
              >
                <Text style={styles.dailyGroupTitle}>{section.name}</Text>
                <Text style={styles.dailyGroupChevron}>
                  {expanded ? '\u2212' : '+'}
                </Text>
              </Pressable>
              {expanded
                ? section.categories.map((category) => (
                    <View
                      key={category.id}
                      ref={(node) => {
                        categoryAnchors.current[category.id] = node;
                      }}
                      collapsable={false}
                    >
                      <CategoryInputCard
                        category={category}
                        entries={entriesForCategory(category.id)}
                        dateKey={selectedDateKey}
                        onChange={updateEntry}
                        onAddEntry={(initial) => addEntry(category.id, initial)}
                        onDeleteEntry={deleteEntry}
                      />
                    </View>
                  ))
                : null}
            </View>
          );
        })
      ) : (
        <Text style={styles.empty}>
          Open the category editor to add your first category.
        </Text>
      )}
      </Panel>
    </View>
  );
  const statisticsPanel = (
    <View style={styles.statistics}>
      <View style={styles.statisticsHeader}>
        <Text style={styles.statisticsTitle}>Statistics</Text>
        <Button
          title="Settings"
          onPress={() => setStatisticsSettingsOpen(true)}
        />
      </View>
      {statsRenderStage >= 1 &&
      isStatisticEnabled(statisticsSettings, 'chart.section') ? (
        <ChartsPanel categories={enabledCategories} records={records} />
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
          weeklyEffects={weeklyEffects}
        />
      ) : null}
      {statsRenderStage >= 3 &&
      isStatisticEnabled(statisticsSettings, 'summary.section') &&
      isStatisticEnabled(statisticsSettings, 'correlation.section') ? (
        <View style={styles.sectionGap} />
      ) : null}
      {statsRenderStage >= 3 &&
      isStatisticEnabled(statisticsSettings, 'weekly.section') &&
      weeklyEffects.length ? (
        <Panel
          title="Weekly effects"
          subtitle="Cyclic weekday alignment after forward offsets."
          infoSection="weekly-effects"
        >
          {weeklyEffects.map((effect) => (
            <View key={effect.categoryId} style={styles.weeklyRow}>
              <Text style={styles.weeklyName}>{effect.categoryName}</Text>
              <Text style={styles.weeklyValue}>
                {effect.score === null
                  ? '--'
                  : `${(effect.score * 100).toFixed(0)}%`}
              </Text>
              <Text style={styles.weeklyMeta}>
                {effect.weekday === null
                  ? 'No phase'
                  : `Weekday ${effect.weekday}`}{' '}
                · {effect.offset === null ? '--' : `+${effect.offset}d`}
              </Text>
            </View>
          ))}
        </Panel>
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
          <Button
            title="Open statistics settings"
            onPress={() => setStatisticsSettingsOpen(true)}
          />
        </Panel>
      ) : null}
    </View>
  );

  const editCategoriesControl = (
    <Pressable
      accessibilityLabel="Open category editor"
      accessibilityRole="button"
      onPress={() => setEditorOpen(true)}
      style={[styles.menuButton, !desktop && styles.menuButtonMobile]}
    >
      <Text style={[styles.menuText, !desktop && styles.menuTextMobile]}>
        {desktop ? 'Edit categories' : 'Edit\ncategories'}
      </Text>
    </Pressable>
  );
  const dateNavigationControl = (
    <View style={desktop ? styles.titleArea : styles.titleAreaMobile}>
      <View style={styles.dateNavRow}>
        <Pressable
          accessibilityLabel="Previous day"
          accessibilityRole="button"
          onPress={() => changeDay(-1)}
          style={[styles.dateNavButton, !desktop && styles.dateNavButtonMobile]}
        >
          <ChevronLeft color={colors.primary} size={20} />
        </Pressable>
        <Pressable
          accessibilityLabel="Open date picker"
          accessibilityRole="button"
          onPress={() => setDatePickerOpen(true)}
        >
          <Text numberOfLines={1} style={styles.date}>
            {selectedDateLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          disabled={selectedDateKey === todayKey}
          onPress={() => changeDay(1)}
          style={[styles.dateNavButton, !desktop && styles.dateNavButtonMobile]}
        >
          <ChevronRight
            color={selectedDateKey === todayKey ? '#a6b1c0' : colors.primary}
            size={20}
          />
        </Pressable>
      </View>
      {selectedDateKey !== todayKey ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedDate(new Date())}
          style={styles.jumpToTodayButton}
        >
          <Text style={styles.jumpToToday}>Jump to today</Text>
        </Pressable>
      ) : null}
    </View>
  );
  const headerUtilityControls = (
    <View style={styles.headerUtilities}>
      <InfoLink
        compact={!desktop}
        section="categories"
        label="Open category and tracker documentation"
      />
      <Pressable
        accessibilityLabel="Open settings"
        accessibilityRole="button"
        onPress={() => setSettingsOpen(true)}
        style={[styles.settingsButton, !desktop && styles.settingsButtonMobile]}
      >
        <Settings color={colors.primary} size={20} />
      </Pressable>
    </View>
  );

  if (!hydrated)
    return (
      <SafeAreaProvider>
        <SystemScreen backgroundColor="#eaf0f7" style={styles.loading}>
          <Text style={styles.loadingText}>Loading your tracker...</Text>
        </SystemScreen>
      </SafeAreaProvider>
    );

  return (
    <SafeAreaProvider>
      <SystemScreen backgroundColor="#eaf0f7" style={styles.root}>
        <View style={styles.header}>
          <View style={[styles.headerTop, !desktop && styles.headerTopMobile]}>
            {desktop ? (
              <>
                <View style={styles.headerSide}>{editCategoriesControl}</View>
                {dateNavigationControl}
                <View style={[styles.headerSide, styles.headerSideRight]}>
                  {headerUtilityControls}
                </View>
              </>
            ) : (
              <View style={styles.mobileHeaderRow}>
                {dateNavigationControl}
                <View style={styles.mobileHeaderUtilities}>
                  {headerUtilityControls}
                </View>
              </View>
            )}
          </View>
          <View style={[styles.modeRow, !desktop && styles.modeRowMobile]}>
            <WorkspacePicker
              options={pickableWorkspaces.map((workspace) => ({
                id: workspace.id,
                label: workspace.name,
              }))}
              selectedId={activeWorkspaceId}
              onSelect={setActiveWorkspaceId}
              onManage={() => setWorkspaceManagerOpen(true)}
            />
          </View>
          {activeWorkspace?.notes ? (
            <Text style={styles.workspaceNotes}>{activeWorkspace.notes}</Text>
          ) : null}
        </View>
        {!desktop ? (
          <View style={styles.pageTabs}>
            <PageTab
              label="Daily"
              active={page === 'daily'}
              onPress={() => setPage('daily')}
            />
            <PageTab
              label="Stats"
              active={page === 'stats'}
              onPress={() => setPage('stats')}
            />
          </View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {desktop ? (
            <View style={styles.desktopGrid}>
              <View style={styles.column}>{dailyPanel}</View>
              <View style={styles.column}>{statisticsPanel}</View>
            </View>
          ) : page === 'daily' ? (
            dailyPanel
          ) : (
            statisticsPanel
          )}
        </ScrollView>
        <CategoryEditor
          visible={editorOpen}
          categories={categories}
          groups={groups}
          selectedCategoryId={selectedCategoryId}
          selectedGroupId={selectedGroupId}
          onClose={() => setEditorOpen(false)}
          onSelect={setSelectedCategoryId}
          onAddGroup={addGroup}
          onAddCategoryToGroup={addCategoryToGroup}
          onRestoreDefaults={restoreDefaults}
          onDeleteGroup={deleteGroup}
          onDelete={deleteCategory}
          onMoveCategory={moveCategory}
          onUpdate={updateCategory}
          onSelectGroup={(groupId) => {
            setSelectedGroupId(groupId);
            if (groupId) setSelectedCategoryId('');
          }}
          onUpdateGroup={updateGroup}
        />
        <StatisticsSettings
          visible={statisticsSettingsOpen}
          settings={statisticsSettings}
          onChange={setStatisticsSettings}
          onOpenCategorySettings={() => {
            setStatisticsSettingsOpen(false);
            setEditorOpen(true);
          }}
          onClose={() => setStatisticsSettingsOpen(false)}
        />
        <SettingsDrawer
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={() => {
            setSettingsOpen(false);
            setExportOpen(true);
          }}
          onImport={() => {
            setSettingsOpen(false);
            setImportOpen(true);
          }}
        />
        <ExportDataModal
          visible={exportOpen}
          workspaces={transferWorkspaces}
          globals={transferGlobals}
          onClose={() => setExportOpen(false)}
        />
        <ImportDataModal
          visible={importOpen}
          workspaces={transferWorkspaces}
          globals={transferGlobals}
          onApply={applyImportPlan}
          onClose={() => setImportOpen(false)}
        />
        <WorkspaceManagerModal
          visible={workspaceManagerOpen}
          workspaces={workspaces}
          onAdd={addWorkspace}
          onUpdate={updateWorkspace}
          onReorder={reorderWorkspaces}
          onDelete={deleteWorkspace}
          onClose={() => setWorkspaceManagerOpen(false)}
        />
        <DatePickerModal
          visible={datePickerOpen}
          date={selectedDate}
          onSelect={setSelectedDate}
          onClose={() => setDatePickerOpen(false)}
        />
      </SystemScreen>
    </SafeAreaProvider>
  );
};

const PageTab = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={[styles.pageTab, active && styles.pageTabActive]}
  >
    <Text style={[styles.pageTabText, active && styles.pageTabTextActive]}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  loadingText: { color: colors.muted, fontSize: 15 },
  header: {
    backgroundColor: '#eaf0f7',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  headerTopMobile: { alignItems: 'stretch', flexDirection: 'column' },
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerSideRight: { justifyContent: 'flex-end' },
  mobileHeaderRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    position: 'relative',
  },
  mobileHeaderUtilities: { position: 'absolute', right: 0, top: 2 },
  headerUtilities: { alignItems: 'center', flexDirection: 'row' },
  menuButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 6,
    minWidth: 118,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuButtonMobile: { height: 48, minWidth: 0, width: 112 },
  menuText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  menuTextMobile: { width: 88 },
  titleArea: { alignItems: 'center', flex: 1 },
  titleAreaMobile: {
    alignItems: 'center',
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '72%',
    marginTop: 0,
  },
  dateNavRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  dateNavButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  dateNavButtonMobile: { height: 36, width: 36 },
  date: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  jumpToToday: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  jumpToTodayButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 24,
  },
  settingsButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    marginLeft: 6,
    width: 40,
  },
  settingsButtonMobile: { height: 36, marginLeft: 0, width: 36 },
  modeRow: { alignSelf: 'center', flexDirection: 'row', marginTop: 9 },
  modeRowMobile: { marginTop: 10 },
  workspaceNotes: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  pageTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pageTab: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  pageTabActive: { borderBottomWidth: 3, borderBottomColor: colors.primary },
  pageTabText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  pageTabTextActive: { color: colors.primary },
  content: { padding: 14, paddingBottom: 34 },
  dailyPage: { gap: 12 },
  dailyEditButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
  },
  dailyEditButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  desktopGrid: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  column: { flex: 1, gap: 18 },
  categoryNames: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 14,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#fbfcfe',
  },
  categoryChipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  categoryIndex: { marginBottom: 14 },
  empty: { color: colors.muted, fontSize: 13 },
  dailyGroup: { marginBottom: 12 },
  dailyGroupHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 4,
  },
  dailyGroupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dailyGroupChevron: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  statistics: { flex: 1 },
  statisticsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statisticsTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  weeklyRow: {
    borderTopColor: '#d9e1eb',
    borderTopWidth: 1,
    paddingVertical: 10,
  },
  weeklyName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  weeklyValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  weeklyMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionGap: { height: 18 },
});

export default App;
