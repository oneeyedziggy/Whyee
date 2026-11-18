import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react-native';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CategoryEditor } from './src/components/CategoryEditor';
import { KeyboardProvider } from './src/components/KeyboardProvider';
import { CategoryInputCard } from './src/components/CategoryInputCard';
import { CarryoverTimerSection } from './src/components/CarryoverTimerSection';
import { ConfirmDialog } from './src/components/ConfirmDialog';
import { DailyEntryPane } from './src/components/DailyEntryPane';
import { StatsPanel } from './src/components/StatsPanel';
import { Panel } from './src/components/Panel';
import { InfoLink } from './src/components/InfoLink';
import { StatisticsSettings } from './src/components/StatisticsSettings';
import { SettingsDrawer } from './src/components/SettingsDrawer';
import { ExportDataModal } from './src/components/ExportDataModal';
import { ImportDataModal } from './src/components/ImportDataModal';
import {
  createDefaultCategory,
  getNextCategoryNameSequence,
  recomputeVirtualSeries,
} from './src/lib/category';
import { createDefaultWorkspaceData } from './src/lib/defaultCategories';
import {
  createDefaultGroup,
  isGroupEnabled,
  normalizeGroups,
  setGroupEnabled,
} from './src/lib/groups';
import {
  getLocalDateKey,
  getLocalTimeStamp,
  makeRecordKey,
} from './src/lib/dates';
import {
  findCarryoverTimers,
  getOldestRunningTimerByCategory,
} from './src/lib/durationTimers';
import {
  persistentStatePrefix,
  usePersistentState,
} from './src/hooks/usePersistentState';
import { useNotificationSync } from './src/hooks/useNotificationSync';
import {
  correlationCachePrefix,
  useCorrelationRows,
} from './src/hooks/useCorrelationRows';
import { useSwipePager } from './src/hooks/useSwipePager';
import { WorkspacePicker } from './src/components/WorkspacePicker';
import { WorkspaceManagerModal } from './src/components/WorkspaceManagerModal';
import { DatePickerModal } from './src/components/DatePickerModal';
import { confirmAction } from './src/lib/confirm';
import {
  createWorkspaceId,
  moveWorkspace,
  normalizeWorkspace,
  visibleWorkspaces,
} from './src/lib/workspaces';
import { colors } from './src/theme/tokens';
import { styles } from './src/appStyles';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
  CategoryGroup,
} from './src/types/category';
import type { WorkspaceMeta } from './src/types/workspace';
import type { ChartSelection } from './src/types/charts';
import {
  createDefaultStatisticsSettings,
  type StatisticsSettings as StatisticsSettingsState,
} from './src/lib/statistics';
import type {
  GlobalTransferSnapshot,
  ImportPlan,
  WorkspaceTransferSnapshot,
} from './src/types/dataTransfer';

const createOffsets = (maximum: number): number[] =>
  Array.from({ length: maximum + 1 }, (_, index) => index);

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
  const { page, setPage, statsMounted, swipeGesture, pagerStyle } =
    useSwipePager(desktop, width);
  const [statsRenderStage, setStatsRenderStage] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [editorSelection, setEditorSelection] = useState<
    { kind: 'category' | 'group'; id: string } | undefined
  >({ kind: 'group', id: 'default-group' });
  const selectedCategoryId =
    editorSelection?.kind === 'category' ? editorSelection.id : '';
  const selectedGroupId =
    editorSelection?.kind === 'group' ? editorSelection.id : '';
  const setSelectedCategoryId = (updater: SetStateAction<string>) =>
    setEditorSelection((current) => {
      const previous = current?.kind === 'category' ? current.id : '';
      const id = typeof updater === 'function' ? updater(previous) : updater;
      return id
        ? { kind: 'category', id }
        : current?.kind === 'category'
          ? undefined
          : current;
    });
  const setSelectedGroupId = (id: string) =>
    setEditorSelection((current) =>
      id
        ? { kind: 'group', id }
        : current?.kind === 'group'
          ? undefined
          : current,
    );
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
  const [chartSelections, setChartSelections, chartSelectionsHydrated] =
    usePersistentState<Record<string, ChartSelection>>(
      'chart.selectionByWorkspace.v1',
      {},
    );
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
  // Stats panel now stays mounted (both tabs support drag-following swipe), so heavy
  // computation and the progressive reveal only need to run once it's first mounted, and
  // restart when the workspace changes.
  const statsVisible = statsMounted;
  useEffect(() => {
    setStatsRenderStage(0);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!statsVisible) return undefined;
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
        (category, index, source) => {
          const normalized = {
            ...category,
            nameSequence:
              category.nameSequence ??
              source
                .slice(0, index + 1)
                .filter((candidate) => candidate.kind === category.kind)
                .length,
            ...(category.kind === 'duration'
              ? {
                  duration: {
                    ...category.duration,
                    resetEnabled: category.duration.resetEnabled ?? true,
                    cumulative: category.duration.cumulative ?? false,
                    animate: category.duration.animate ?? true,
                    timeSinceCategoryIds:
                      category.duration.timeSinceCategoryIds ?? [],
                  },
                }
              : {}),
            enabled: category.enabled ?? true,
            notesEnabled: category.notesEnabled ?? false,
            sentimentEnabled: category.sentimentEnabled ?? false,
            correlateWithinGroup: category.correlateWithinGroup ?? false,
            allowMultiplePerDay: category.allowMultiplePerDay ?? false,
            virtualSeries: category.virtualSeries ?? [],
          } as CategoryDefinition;
          return {
            ...normalized,
            virtualSeries: recomputeVirtualSeries(normalized),
          };
        },
      ),
    [activeWorkspaceId, categoriesByWorkspace],
  );
  const groups = useMemo(
    () => normalizeGroups(groupsByWorkspace[activeWorkspaceId], categories),
    [activeWorkspaceId, categories, groupsByWorkspace],
  );
  const records = recordsByWorkspace[activeWorkspaceId] ?? {};
  const entryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of Object.values(records))
      counts[record.categoryId] = (counts[record.categoryId] ?? 0) + 1;
    return counts;
  }, [records]);
  const enabledCategories = useMemo(
    () => categories.filter((category) => category.enabled),
    [categories],
  );
  // normalizeGroups assigns every category to a group, so no "ungrouped" section is needed.
  const dailySections = useMemo(() => {
    const byId = new Map(
      enabledCategories.map((category) => [category.id, category]),
    );
    return groups
      .map((group) => ({
        id: group.id,
        name: group.name,
        categories: group.categoryIds
          .map((id) => byId.get(id))
          .filter((category): category is CategoryDefinition =>
            Boolean(category),
          ),
      }))
      .filter((group) => group.categories.length > 0);
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
  const { orderedRows, loading } = useCorrelationRows({
    activeWorkspaceId,
    correlationCategories,
    groups,
    hydrated,
    offsets,
    records,
    statisticsSettings,
    statsVisible,
  });
  const [collapsedDailyGroups, setCollapsedDailyGroups] = useState<
    Record<string, boolean>
  >({});
  const [categoryIndexExpanded, setCategoryIndexExpanded] =
    usePersistentState<boolean>('daily.categoryIndexExpanded.v1', true);
  const transferWorkspaces = useMemo<WorkspaceTransferSnapshot[]>(
    () =>
      workspaceList
        .filter((workspace) => workspace.id !== 'test')
        .map((workspace) => ({
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
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollOffset = useRef(0);
  const categoryAnchors = useRef<Record<string, ViewInstance | null>>({});
  const scrollToCategory = (categoryId: string) => {
    const anchor = categoryAnchors.current[categoryId];
    const scroller = scrollRef.current;
    if (!anchor || !scroller) return;
    anchor.measureInWindow((_x, anchorY) => {
      scroller.measureInWindow((_scrollX, scrollY) => {
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
  const carryoverTimers = useMemo(
    () => findCarryoverTimers(records, categories, selectedDateKey),
    [records, categories, selectedDateKey],
  );
  const oldestRunningByCategory = useMemo(
    () => getOldestRunningTimerByCategory(records),
    [records],
  );
  useNotificationSync({
    hydrated,
    categoriesByWorkspace,
    recordsByWorkspace,
    setRecordsByWorkspace,
    setActiveWorkspaceId,
    setSelectedDate,
    setSelectedCategoryId,
    setPage,
    scrollToCategory,
    activeWorkspaceId,
    selectedDateKey,
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
    () =>
      workspaceList
        .filter((workspace) => workspace.id !== 'test')
        .map(normalizeWorkspace),
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
      workspaceList.map((workspace) => workspace.id),
    );
    let dataset: import('./src/lib/testDataset').TestDataset | undefined;
    if (__DEV__) {
      const { createTestWorkspaceDataset } =
        require('./src/lib/testDataset') as typeof import('./src/lib/testDataset');
      dataset = createTestWorkspaceDataset(
        name,
        categoriesByWorkspace.test
          ? {
              categories: categoriesByWorkspace.test,
              groups: groupsByWorkspace.test,
              records: recordsByWorkspace.test ?? {},
            }
          : undefined,
      );
    }
    const seed = dataset ?? { ...createDefaultWorkspaceData(), records: {} };
    setWorkspaceList((current) => [
      ...current,
      { id, name, notes, hidden: false },
    ]);
    setCategoriesByWorkspace((current) => ({
      ...current,
      [id]: seed.categories,
    }));
    setGroupsByWorkspace((current) => ({
      ...current,
      [id]: seed.groups ?? [createDefaultGroup(seed.categories)],
    }));
    setRecordsByWorkspace((current) => ({
      ...current,
      [id]: seed.records,
    }));
    setActiveWorkspaceId(id);
  };
  const updateWorkspace = (id: string, patch: Partial<WorkspaceMeta>) =>
    setWorkspaceList((current) =>
      current.map((workspace) =>
        workspace.id === id ? { ...workspace, ...patch } : workspace,
      ),
    );
  const reorderWorkspaces = (from: number, to: number) =>
    setWorkspaceList((current) => [
      ...moveWorkspace(
        current.filter((workspace) => workspace.id !== 'test'),
        from,
        to,
      ),
      ...current.filter((workspace) => workspace.id === 'test'),
    ]);
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
        AsyncStorage.removeItem(`${correlationCachePrefix}${id}`).catch(() => undefined);
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
      selectedCategoryId &&
      !categories.some((category) => category.id === selectedCategoryId)
    )
      setSelectedCategoryId('');
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (
      selectedGroupId &&
      !groups.some((group) => group.id === selectedGroupId)
    )
      setSelectedGroupId('');
  }, [groups, selectedGroupId]);

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
      const defaults = createDefaultWorkspaceData();
      const storedUserCategories = await readLegacy<CategoryDefinition[]>(
        'categories.v4',
      );
      const legacyUserCategories = storedUserCategories ?? defaults.categories;
      const legacyUserGroups =
        (await readLegacy<CategoryGroup[]>('groups.v4')) ??
        (storedUserCategories
          ? [createDefaultGroup(legacyUserCategories)]
          : defaults.groups);
      const legacyUserRecords =
        (await readLegacy<Record<string, CategorySelectionRecord>>(
          'records.v4',
        )) ?? {};
      const legacyTestCategories = await readLegacy<CategoryDefinition[]>(
        'testCategories.v10',
      );
      const legacyTestGroups = (await readLegacy<CategoryGroup[]>(
        'testGroups.v4',
      )) ?? [createDefaultGroup(legacyTestCategories ?? [])];
      const legacyTestRecords =
        (await readLegacy<Record<string, CategorySelectionRecord>>(
          'testRecords.v10',
        )) ?? {};
      const hasLegacyTestData =
        legacyTestCategories !== null ||
        Object.keys(legacyTestRecords).length > 0;
      setWorkspaceList([
        { id: 'user', name: 'User', notes: '', hidden: false },
        ...(hasLegacyTestData
          ? [{ id: 'test', name: 'Test', notes: '', hidden: true }]
          : []),
      ]);
      setCategoriesByWorkspace({
        user: legacyUserCategories,
        ...(hasLegacyTestData ? { test: legacyTestCategories ?? [] } : {}),
      });
      setGroupsByWorkspace({
        user: legacyUserGroups,
        ...(hasLegacyTestData ? { test: legacyTestGroups } : {}),
      });
      setRecordsByWorkspace({
        user: legacyUserRecords,
        ...(hasLegacyTestData ? { test: legacyTestRecords } : {}),
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

  const changeDay = (offset: number) =>
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + offset);
      return next;
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
  const toggleGroupEnabled = (groupId: string, enabled: boolean) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const next = setGroupEnabled(group, categories, enabled);
    setGroups((current) =>
      current.map((candidate) =>
        candidate.id === groupId ? next.group : candidate,
      ),
    );
    setCategories(next.categories);
  };
  const restoreDefaults = () => {
    if (activeWorkspaceId !== 'user') return;
    const defaults = createDefaultWorkspaceData();
    const missingDefaults = defaults.categories.filter(
      (category) =>
        !categories.some((existing) => existing.name === category.name),
    );
    if (!missingDefaults.length) return;
    // Time-since references point at freshly generated ids; swap in the ids of same-named
    // categories that already exist and drop references that resolve to nothing.
    const nameToExistingId = new Map(
      categories.map((category) => [category.name, category.id]),
    );
    const defaultsById = new Map(
      defaults.categories.map((category) => [category.id, category]),
    );
    const resolveSourceId = (id: string): string => {
      const source = defaultsById.get(id);
      return (source && nameToExistingId.get(source.name)) ?? id;
    };
    const resolveSourceIds = (ids: string[]): string[] =>
      ids
        .map(resolveSourceId)
        .filter(
          (id) =>
            missingDefaults.some((candidate) => candidate.id === id) ||
            categories.some((candidate) => candidate.id === id),
        );
    const relinkTimeSince = (
      category: CategoryDefinition,
    ): CategoryDefinition => {
      if (
        category.kind === 'event-time' &&
        category.eventTime.timeSinceCategoryIds.length
      )
        return {
          ...category,
          eventTime: {
            ...category.eventTime,
            timeSinceCategoryIds: resolveSourceIds(
              category.eventTime.timeSinceCategoryIds,
            ),
          },
        };
      if (
        category.kind === 'duration' &&
        category.duration.timeSinceCategoryIds.length
      )
        return {
          ...category,
          duration: {
            ...category.duration,
            timeSinceCategoryIds: resolveSourceIds(
              category.duration.timeSinceCategoryIds,
            ),
          },
        };
      return category;
    };
    const added = missingDefaults.map((category) => {
      const next = relinkTimeSince(category);
      if (next === category) return category;
      return {
        ...next,
        virtualSeries: recomputeVirtualSeries(next, [
          ...categories,
          ...missingDefaults,
        ]),
      };
    });
    setCategories((current) => [...current, ...added]);
    setGroups((current) => {
      // Normalize first so pre-existing unassigned categories keep their default group
      // instead of being folded into the first restored group later.
      let next = normalizeGroups(current, categories);
      for (const defaultGroup of defaults.groups) {
        const memberIds = defaultGroup.categoryIds.filter((id) =>
          added.some((category) => category.id === id),
        );
        if (!memberIds.length) continue;
        const existing = next.find(
          (candidate) => candidate.name === defaultGroup.name,
        );
        next = existing
          ? next.map((candidate) =>
              candidate.id === existing.id
                ? {
                    ...candidate,
                    categoryIds: [
                      ...candidate.categoryIds,
                      ...memberIds.filter(
                        (id) => !candidate.categoryIds.includes(id),
                      ),
                    ],
                  }
                : candidate,
            )
          : [...next, { ...defaultGroup, categoryIds: memberIds }];
      }
      return next;
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
  ) => {
    const target = groups.find((group) => group.id === targetGroupId);
    if (!target || !isGroupEnabled(target)) return;
    setGroups((current) =>
      current.map((group) => {
        const without = group.categoryIds.filter((id) => id !== categoryId);
        const suspendedCategoryIds = group.suspendedCategoryIds?.filter(
          (id) => id !== categoryId,
        );
        if (group.id !== targetGroupId)
          return { ...group, categoryIds: without, suspendedCategoryIds };
        const insertAt = Math.max(0, Math.min(targetIndex, without.length));
        return {
          ...group,
          suspendedCategoryIds,
          categoryIds: [
            ...without.slice(0, insertAt),
            categoryId,
            ...without.slice(insertAt),
          ],
        };
      }),
    );
  };

  const dailyPanel = (
    <DailyEntryPane onEditCategories={() => setEditorOpen(true)}>
      <CarryoverTimerSection
        records={carryoverTimers}
        categories={categories}
        oldestRunningByCategory={oldestRunningByCategory}
        viewedDateKey={selectedDateKey}
        onChange={updateEntry}
      />
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
                          onAddEntry={(initial) =>
                            addEntry(category.id, initial)
                          }
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
    </DailyEntryPane>
  );
  const statisticsPanel = (
    <StatsPanel
      statsRenderStage={statsRenderStage}
      workspaceId={activeWorkspaceId}
      chartSelection={chartSelections[activeWorkspaceId]}
      chartSelectionHydrated={chartSelectionsHydrated}
      onChartSelectionChange={(selection) => {
        const workspaceId = activeWorkspaceId;
        setChartSelections((current) => ({
          ...current,
          [workspaceId]: selection,
        }));
      }}
      statisticsSettings={statisticsSettings}
      enabledCategories={enabledCategories}
      records={records}
      safeSummaryLookback={safeSummaryLookback}
      orderedRows={orderedRows}
      loading={loading}
      offsets={offsets}
      safeCorrelationOffset={safeCorrelationOffset}
      safeTopCorrelationThreshold={safeTopCorrelationThreshold}
      setTopCorrelationThreshold={setTopCorrelationThreshold}
      setCorrelationOffset={(value) =>
        setCorrelationOffset(Math.min(366, Math.max(0, Math.round(value))))
      }
      setStatisticsSettingsOpen={setStatisticsSettingsOpen}
    />
  );

  if (!hydrated)
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.loading}>
          <StatusBar style="dark" />
          <Text style={styles.loadingText}>Loading your tracker...</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <KeyboardProvider>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <StatusBar style="dark" />
          <View style={styles.header}>
            <View style={desktop && styles.desktopFrame}>
              <View style={styles.headerTop}>
                <View style={styles.headerSide} />
                <View style={styles.titleArea}>
                  <View style={styles.dateNavRow}>
                    <Pressable
                      accessibilityLabel="Previous day"
                      accessibilityRole="button"
                      onPress={() => changeDay(-1)}
                      style={styles.dateNavButton}
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
                      style={styles.dateNavButton}
                    >
                      <ChevronRight
                        color={
                          selectedDateKey === todayKey
                            ? '#a6b1c0'
                            : colors.primary
                        }
                        size={20}
                      />
                    </Pressable>
                  </View>
                  {selectedDateKey !== todayKey ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSelectedDate(new Date())}
                    >
                      <Text style={styles.jumpToToday}>Jump to today</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={[styles.headerSide, styles.headerSideRight]}>
                  <InfoLink
                    section="categories"
                    label="Open category and tracker documentation"
                    style={styles.headerInfoButton}
                  />
                  <Pressable
                    accessibilityLabel="Open settings"
                    accessibilityRole="button"
                    onPress={() => setSettingsOpen(true)}
                    style={styles.settingsButton}
                  >
                    <Settings color={colors.primary} size={20} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.modeRow}>
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
                <Text style={styles.workspaceNotes}>
                  {activeWorkspace.notes}
                </Text>
              ) : null}
            </View>
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
          {!desktop ? (
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.pagerViewport}>
                <Animated.View
                  style={[styles.pagerTrack, { width: width * 2 }, pagerStyle]}
                >
                  <View style={{ width }}>
                    <ScrollView
                      ref={scrollRef}
                      contentContainerStyle={styles.content}
                      onScroll={(event) => {
                        scrollOffset.current =
                          event.nativeEvent.contentOffset.y;
                      }}
                      scrollEventThrottle={16}
                    >
                      {dailyPanel}
                    </ScrollView>
                  </View>
                  <View style={{ width }}>
                    {statsMounted ? (
                      <ScrollView contentContainerStyle={styles.content}>
                        {statisticsPanel}
                      </ScrollView>
                    ) : null}
                  </View>
                </Animated.View>
              </View>
            </GestureDetector>
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.content}
              onScroll={(event) => {
                scrollOffset.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              <View style={[styles.desktopGrid, styles.desktopFrame]}>
                <View style={styles.column}>{dailyPanel}</View>
                <View style={styles.column}>{statisticsPanel}</View>
              </View>
            </ScrollView>
          )}
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
            onToggleGroupEnabled={toggleGroupEnabled}
            entryCounts={entryCounts}
            onUpdate={updateCategory}
            onSelectGroup={setSelectedGroupId}
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
          <ConfirmDialog />
        </SafeAreaView>
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
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

export default App;
