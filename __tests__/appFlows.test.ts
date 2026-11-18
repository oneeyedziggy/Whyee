import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import App from '../App';
import { CarryoverTimerSection } from '../src/components/CarryoverTimerSection';
import { CategoryEditor } from '../src/components/CategoryEditor';
import { CategoryInputCard } from '../src/components/CategoryInputCard';
import { DatePickerModal } from '../src/components/DatePickerModal';
import { ExportDataModal } from '../src/components/ExportDataModal';
import { ImportDataModal } from '../src/components/ImportDataModal';
import { SettingsDrawer } from '../src/components/SettingsDrawer';
import { StatisticsSettings } from '../src/components/StatisticsSettings';
import { StatsPanel } from '../src/components/StatsPanel';
import { WorkspaceManagerModal } from '../src/components/WorkspaceManagerModal';
import { WorkspacePicker } from '../src/components/WorkspacePicker';
import { useNotificationSync } from '../src/hooks/useNotificationSync';
import { persistentStatePrefix } from '../src/hooks/usePersistentState';
import { createDefaultCategory } from '../src/lib/category';
import { createDefaultWorkspaceData } from '../src/lib/defaultCategories';
import { getLocalDateKey } from '../src/lib/dates';
import { createDefaultGroup } from '../src/lib/groups';
import { createDefaultStatisticsSettings } from '../src/lib/statistics';
import type {
  CategoryDefinition,
  CategoryGroup,
  CategorySelectionRecord,
} from '../src/types/category';
import type { ImportPlan } from '../src/types/dataTransfer';

const mockDimensions = { width: 400, height: 800, scale: 1, fontScale: 1 };
const mockPager = {
  page: 'daily',
  setPage: jest.fn(),
  statsMounted: false,
  swipeGesture: {},
  pagerStyle: {},
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockDimensions,
}));
jest.mock('../src/lib/id', () => {
  let sequence = 0;
  return { createId: (prefix: string) => `${prefix}-flow-${sequence++}` };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('lucide-react-native', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Settings: () => null,
}));
jest.mock('../src/hooks/useNotificationSync', () => ({
  useNotificationSync: jest.fn(),
}));
jest.mock('../src/hooks/useCorrelationRows', () => ({
  useCorrelationRows: () => ({
    orderedRows: [],
    loading: false,
  }),
  correlationCachePrefix: 'correlation.mobile.v6.cache.',
}));
jest.mock('../src/hooks/useSwipePager', () => ({
  useSwipePager: () => mockPager,
}));
jest.mock('../src/components/KeyboardProvider', () => ({
  KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/components/CategoryEditor', () => ({
  CategoryEditor: jest.fn(() => null),
}));
jest.mock('../src/components/WorkspaceManagerModal', () => ({
  WorkspaceManagerModal: jest.fn(() => null),
}));
jest.mock('../src/components/WorkspacePicker', () => ({
  WorkspacePicker: jest.fn(() => null),
}));
jest.mock('../src/components/ExportDataModal', () => ({
  ExportDataModal: jest.fn(() => null),
}));
jest.mock('../src/components/ImportDataModal', () => ({
  ImportDataModal: jest.fn(() => null),
}));
jest.mock('../src/components/CategoryInputCard', () => ({
  CategoryInputCard: jest.fn(() => null),
}));
jest.mock('../src/components/CarryoverTimerSection', () => ({
  CarryoverTimerSection: jest.fn(() => null),
}));
jest.mock('../src/components/StatsPanel', () => ({
  StatsPanel: jest.fn(() => null),
}));
jest.mock('../src/components/StatisticsSettings', () => ({
  StatisticsSettings: jest.fn(() => null),
}));
jest.mock('../src/components/SettingsDrawer', () => ({
  SettingsDrawer: jest.fn(() => null),
}));
jest.mock('../src/components/DatePickerModal', () => ({
  DatePickerModal: jest.fn(() => null),
}));
jest.mock('../src/components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));
jest.mock('../src/components/InfoLink', () => ({ InfoLink: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (component: unknown): any => {
  const calls = jest.mocked(component as jest.Mock).mock.calls;
  return calls[calls.length - 1][0];
};
const editor = () => props(CategoryEditor);
const manager = () => props(WorkspaceManagerModal);
const picker = () => props(WorkspacePicker);
const stats = () => props(StatsPanel);
const notificationSync = () => props(useNotificationSync);
const inputCard = (categoryId: string) => {
  const calls = jest.mocked(CategoryInputCard).mock.calls;
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const cardProps = calls[index][0] as {
      category: CategoryDefinition;
      entries: CategorySelectionRecord[];
      onChange: (entry: CategorySelectionRecord) => void;
      onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
      onDeleteEntry: (entry: CategorySelectionRecord) => void;
    };
    if (cardProps.category.id === categoryId) return cardProps;
  }
  throw new Error(`No input card rendered for ${categoryId}`);
};
const stored = async (key: string) =>
  JSON.parse((await AsyncStorage.getItem(`${persistentStatePrefix}${key}`))!);
const seed = (values: Record<string, unknown>) =>
  AsyncStorage.multiSet(
    Object.entries(values).map(([key, value]) => [
      `${persistentStatePrefix}${key}`,
      JSON.stringify(value),
    ]),
  );
const mount = async () => {
  const view = await render(React.createElement(App));
  await waitFor(() => expect(WorkspacePicker).toHaveBeenCalled());
  return view;
};
const groupIds = () => editor().groups.map((group: CategoryGroup) => group.id);
const categoryNames = () =>
  editor().categories.map((category: CategoryDefinition) => category.name);
const defaultCategoryNames = () =>
  createDefaultWorkspaceData().categories.map((category) => category.name);

const mood = { ...createDefaultCategory('multiple-choice', 0, 'Mood', 1), id: 'mood' };
const energy = { ...createDefaultCategory('number', 1, 'Energy', 1), id: 'energy' };
const sleep = { ...createDefaultCategory('number', 2, 'Sleep', 2), id: 'sleep' };
const today = getLocalDateKey();
const record = (
  categoryId: string,
  ordinal: number,
  dateKey = today,
): CategorySelectionRecord => ({
  key: `${dateKey}:${ordinal}:${categoryId}`,
  categoryId,
  dateKey,
  ordinal,
  localTime: '09:00:00',
  value: ordinal + 1,
});
const baseState = () => ({
  'workspaces.v1': [
    { id: 'user', name: 'User', notes: 'Personal tracking' },
    { id: 'work', name: 'Work', notes: '', hidden: false },
  ],
  'categoriesByWorkspace.v1': { user: [mood, energy, sleep], work: [] },
  'groupsByWorkspace.v1': {
    user: [
      { ...createDefaultGroup([mood, energy]) },
      { id: 'body', name: 'Body', categoryIds: ['sleep'], expanded: true },
      { id: 'empty', name: 'Empty', categoryIds: [], expanded: true },
    ],
    work: [],
  },
  'recordsByWorkspace.v1': { user: {}, work: {} },
  'activeWorkspaceId.v1': 'user',
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockDimensions.width = 400;
  mockPager.statsMounted = false;
  await AsyncStorage.clear();
  await seed(baseState());
});

describe('App loading and normalization', () => {
  it('shows a loading state until persisted state hydrates', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getItem = jest.mocked(AsyncStorage.getItem);
    const original = getItem.getMockImplementation()!;
    getItem.mockImplementation(async (key: string) => {
      await gate;
      return original(key);
    });
    await render(React.createElement(App));
    expect(screen.getByText('Loading your tracker...')).toBeTruthy();
    expect(WorkspacePicker).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(WorkspacePicker).toHaveBeenCalled());
    getItem.mockImplementation(original);
    expect(screen.queryByText('Loading your tracker...')).toBeNull();
    expect(screen.getByText('Personal tracking')).toBeTruthy();
  });

  it('fills defaults for legacy categories and clamps stored analysis settings', async () => {
    const stripped = { ...createDefaultCategory('multiple-choice', 3, 'Old'), id: 'old' } as Partial<CategoryDefinition>;
    for (const field of [
      'nameSequence',
      'enabled',
      'notesEnabled',
      'sentimentEnabled',
      'correlateWithinGroup',
      'allowMultiplePerDay',
      'virtualSeries',
    ] as const)
      delete stripped[field];
    const timer = createDefaultCategory('duration', 4, 'Timer') as Extract<
      CategoryDefinition,
      { kind: 'duration' }
    >;
    const legacyTimer = {
      ...timer,
      id: 'legacy-timer',
      duration: { splitEnabled: false, showMilliseconds: false, use24HourClock: true },
    };
    const customTimer = {
      ...timer,
      id: 'custom-timer',
      duration: { ...timer.duration, resetEnabled: false, cumulative: true, animate: false },
    };
    await seed({
      'categoriesByWorkspace.v1': { user: [stripped, legacyTimer, customTimer] },
      'groupsByWorkspace.v1': {},
      'correlation.offset.v1': 900.6,
      'correlation.topThreshold.v1': -2,
      'statistics.summaryLookback.v1': 0,
    });
    mockDimensions.width = 1200;
    await mount();
    const [old, legacy, custom] = editor().categories;
    expect(old).toMatchObject({
      nameSequence: 1,
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: false,
      correlateWithinGroup: false,
      allowMultiplePerDay: false,
    });
    expect(Array.isArray(old.virtualSeries)).toBe(true);
    expect(legacy.nameSequence).toBe(timer.nameSequence);
    expect(legacy.duration).toMatchObject({ resetEnabled: true, cumulative: false, animate: true });
    expect(custom.duration).toMatchObject({ resetEnabled: false, cumulative: true, animate: false });
    expect(editor().groups).toEqual([
      expect.objectContaining({ id: 'default-group', categoryIds: ['old', 'legacy-timer', 'custom-timer'] }),
    ]);
    expect(stats()).toMatchObject({
      safeCorrelationOffset: 366,
      safeTopCorrelationThreshold: 0,
      safeSummaryLookback: 1,
    });
    expect(stats().offsets).toHaveLength(367);
  });

  it('clamps the opposite bounds of stored analysis settings', async () => {
    await seed({
      'correlation.offset.v1': -4,
      'correlation.topThreshold.v1': 3,
      'statistics.summaryLookback.v1': 999,
    });
    mockDimensions.width = 1200;
    await mount();
    expect(stats()).toMatchObject({
      safeCorrelationOffset: 0,
      safeTopCorrelationThreshold: 1,
      safeSummaryLookback: 366,
    });
    expect(stats().offsets).toEqual([0]);
  });

  it('shows the empty-category prompt for a workspace with no stored data', async () => {
    await seed({
      'workspaces.v1': [{ id: 'user', name: 'User' }, { id: 'blank', name: 'Blank' }],
      'activeWorkspaceId.v1': 'blank',
    });
    await mount();
    expect(screen.getByText('Open the category editor to add your first category.')).toBeTruthy();
    expect(editor().categories).toEqual([]);
    const exported = props(ExportDataModal).workspaces;
    expect(exported.find((workspace: { id: string }) => workspace.id === 'blank')).toMatchObject({
      categories: [],
      groups: [],
      records: {},
      notes: '',
      hidden: false,
    });
    // Category and group edits seed missing per-workspace maps.
    await act(async () => editor().onAddGroup());
    await act(async () => editor().onAddCategoryToGroup(editor().groups[0].id));
    await act(async () => inputCard(editor().categories[0].id).onAddEntry());
    expect(Object.keys((await stored('recordsByWorkspace.v1')).blank)).toHaveLength(1);
    expect((await stored('categoriesByWorkspace.v1')).blank).toHaveLength(1);
  });
});

describe('App migration', () => {
  it('migrates legacy user data and test records without legacy test categories', async () => {
    await AsyncStorage.clear();
    const legacyGroups = [createDefaultGroup([mood])];
    const legacyRecords = { a: record('mood', 0, '2020-01-01') };
    await seed({
      'categories.v4': [mood],
      'groups.v4': legacyGroups,
      'records.v4': legacyRecords,
      'testRecords.v10': legacyRecords,
    });
    await mount();
    await waitFor(async () =>
      expect((await stored('workspaces.v1')).map((workspace: { id: string }) => workspace.id)).toEqual([
        'user',
        'test',
      ]),
    );
    expect((await stored('categoriesByWorkspace.v1')).test).toEqual([]);
    expect((await stored('groupsByWorkspace.v1')).test).toEqual([createDefaultGroup([])]);
    expect((await stored('recordsByWorkspace.v1')).user).toEqual(legacyRecords);
    expect(editor().categories.map((category: CategoryDefinition) => category.id)).toEqual(['mood']);
  });

  it('falls back to default categories when legacy storage is unreadable', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(`${persistentStatePrefix}categories.v4`, '{not json');
    await mount();
    expect(categoryNames()).toEqual(defaultCategoryNames());
    await waitFor(async () => expect(await stored('workspaces.v1')).toEqual([
      { id: 'user', name: 'User', notes: '', hidden: false },
    ]));
  });

  it('migrates legacy categories without stored groups into a default group', async () => {
    await AsyncStorage.clear();
    await seed({ 'categories.v4': [mood] });
    await mount();
    expect(categoryNames()).toEqual(['Mood']);
    expect(groupIds()).toEqual(['default-group']);
    expect(editor().groups[0].categoryIds).toEqual(['mood']);
  });
});

describe('App navigation', () => {
  it('moves between days, jumps to today, and uses the date picker', async () => {
    await mount();
    const date = () => getLocalDateKey(props(DatePickerModal).date);
    expect(screen.queryByText('Jump to today')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Next day'));
    expect(date()).toBe(today);

    await fireEvent.press(screen.getByLabelText('Previous day'));
    expect(date()).not.toBe(today);
    expect(screen.getByText('Jump to today')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next day'));
    expect(date()).toBe(today);

    await fireEvent.press(screen.getByLabelText('Previous day'));
    await fireEvent.press(screen.getByText('Jump to today'));
    expect(date()).toBe(today);

    await fireEvent.press(screen.getByLabelText('Open date picker'));
    expect(props(DatePickerModal).visible).toBe(true);
    await act(async () => props(DatePickerModal).onSelect(new Date(2020, 1, 3)));
    expect(date()).toBe('2020-02-03');
    await act(async () => props(DatePickerModal).onClose());
    expect(props(DatePickerModal).visible).toBe(false);
  });

  it('switches mobile pages with tabs and notification callbacks', async () => {
    await mount();
    await fireEvent.press(screen.getByText('Stats'));
    expect(mockPager.setPage).toHaveBeenLastCalledWith('stats');
    await fireEvent.press(screen.getByText('Daily'));
    expect(mockPager.setPage).toHaveBeenLastCalledWith('daily');
    expect(StatsPanel).not.toHaveBeenCalled();

    expect(notificationSync()).toMatchObject({
      hydrated: true,
      activeWorkspaceId: 'user',
      selectedDateKey: today,
      setPage: mockPager.setPage,
    });
    await act(async () => notificationSync().setSelectedCategoryId((previous: string) => `${previous}energy`));
    expect(editor().selectedCategoryId).toBe('energy');
    await act(async () => notificationSync().setSelectedCategoryId((previous: string) => previous.replace('energy', '')));
    expect(editor().selectedCategoryId).toBe('');
    expect(editor().selectedGroupId).toBe('');
    await act(async () => notificationSync().setActiveWorkspaceId('work'));
    expect(picker().selectedId).toBe('work');
  });

  it('renders the desktop layout without page tabs', async () => {
    mockDimensions.width = 1000;
    await mount();
    expect(screen.queryByText('Stats')).toBeNull();
    expect(StatsPanel).toHaveBeenCalled();
    expect(stats().workspaceId).toBe('user');
  });

  it.each([
    ['mobile', 400],
    ['desktop', 1000],
  ])('scrolls the %s daily list to a category from the index', async (_label, width) => {
    mockDimensions.width = width;
    const measure = (View as unknown as { prototype: { measureInWindow: jest.Mock } }).prototype.measureInWindow;
    const scrollTo = jest.spyOn((ScrollView as unknown as { prototype: { scrollTo: () => void } }).prototype, 'scrollTo');
    measure.mockImplementation(function (this: unknown, callback) {
      callback(0, this instanceof ScrollView ? 100 : 400, 0, 0);
    });
    try {
      await mount();
      let scroller = screen.getByTestId('daily-entry-pane') as unknown as {
        parent: typeof scroller | null;
        props: { onScroll?: (event: unknown) => void };
      } | null;
      while (scroller && !scroller.props.onScroll) scroller = scroller.parent;
      await act(async () => scroller!.props.onScroll!({ nativeEvent: { contentOffset: { y: 50 } } }));
      await fireEvent.press(screen.getByLabelText('Jump to Mood'));
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 342, animated: true });
    } finally {
      measure.mockReset();
      scrollTo.mockRestore();
    }
  });

  it('ignores scroll requests for collapsed or unmounted categories', async () => {
    const measure = (View as unknown as { prototype: { measureInWindow: jest.Mock } }).prototype.measureInWindow;
    const scrollTo = jest.spyOn((ScrollView as unknown as { prototype: { scrollTo: () => void } }).prototype, 'scrollTo');
    const pending: Array<(x: number, y: number) => void> = [];
    measure.mockImplementation((callback) => {
      pending.push(callback as unknown as (x: number, y: number) => void);
    });
    try {
      const view = await mount();
      await fireEvent.press(screen.getByText('General'));
      expect(screen.getByRole('button', { name: /General/, expanded: false })).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Jump to Mood'));
      expect(measure).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByText('General'));
      expect(screen.getByRole('button', { name: /General/, expanded: true })).toBeTruthy();

      await fireEvent.press(screen.getByLabelText('Jump to Mood'));
      expect(pending).toHaveLength(1);
      pending.shift()!(0, 10);
      await view.unmount();
      pending.shift()!(0, 0);
      expect(scrollTo).not.toHaveBeenCalled();
      // Notification-driven scroll requests before any category is mounted are ignored.
      notificationSync().scrollToCategory('mood');
      expect(pending).toHaveLength(0);
    } finally {
      measure.mockReset();
      scrollTo.mockRestore();
    }
  });

  it('collapses and expands the category index', async () => {
    await mount();
    expect(screen.getByLabelText('Jump to Sleep')).toBeTruthy();
    await fireEvent.press(screen.getByText('Categories'));
    expect(screen.queryByLabelText('Jump to Sleep')).toBeNull();
    await waitFor(async () => expect(await stored('daily.categoryIndexExpanded.v1')).toBe(false));
    await fireEvent.press(screen.getByText('Categories'));
    expect(screen.getByLabelText('Jump to Sleep')).toBeTruthy();
  });

  it('progressively reveals statistics sections and restarts on workspace change', async () => {
    mockPager.statsMounted = true;
    const frames: FrameRequestCallback[] = [];
    const request = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback));
    const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const flush = async () => {
      while (frames.length) {
        const frame = frames.shift()!;
        await act(async () => frame(0));
      }
    };
    try {
      const view = await mount();
      await flush();
      expect(stats().statsRenderStage).toBe(5);
      await act(async () => picker().onSelect('work'));
      expect(stats().statsRenderStage).toBe(0);
      expect(frames.length).toBeGreaterThan(0);
      const stale = frames.shift()!;
      await view.unmount();
      expect(cancel).toHaveBeenCalled();
      const renders = jest.mocked(StatsPanel).mock.calls.length;
      stale(0);
      expect(jest.mocked(StatsPanel).mock.calls).toHaveLength(renders);
    } finally {
      request.mockRestore();
      cancel.mockRestore();
    }
  });
});

describe('App records', () => {
  it('adds, orders, updates, and deletes entries for the selected day', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await seed({
      'recordsByWorkspace.v1': {
        user: {
          second: { ...record('mood', 2), key: 'second' },
          first: { ...record('mood', 0), key: 'first' },
          other: record('energy', 0),
          old: record('mood', 0, getLocalDateKey(yesterday)),
        },
      },
    });
    await mount();
    expect(inputCard('mood').entries.map((entry) => entry.key)).toEqual(['first', 'second']);
    expect(editor().entryCounts).toEqual({ mood: 3, energy: 1 });

    await act(async () => inputCard('mood').onAddEntry());
    const added = inputCard('mood').entries[2];
    expect(added).toMatchObject({ ordinal: 3, value: 0, instanceId: 'mood:3', dateKey: today });
    await act(async () => inputCard('sleep').onAddEntry({ value: 7, noteText: 'rested' }));
    expect(inputCard('sleep').entries).toEqual([
      expect.objectContaining({ ordinal: 0, value: 7, noteText: 'rested' }),
    ]);

    await act(async () => inputCard('mood').onChange({ ...added, value: 9 }));
    expect(inputCard('mood').entries[2].value).toBe(9);
    await act(async () => props(CarryoverTimerSection).onChange({ ...added, value: 4 }));
    expect(inputCard('mood').entries[2].value).toBe(4);
    await act(async () => inputCard('mood').onDeleteEntry(added));
    expect(inputCard('mood').entries.map((entry) => entry.key)).toEqual(['first', 'second']);
    await waitFor(async () =>
      expect(Object.keys((await stored('recordsByWorkspace.v1')).user)).toHaveLength(5),
    );
  });
});

describe('App category editing', () => {
  it('opens and closes the category editor', async () => {
    await mount();
    expect(editor().visible).toBe(false);
    await fireEvent.press(screen.getByLabelText('Open category editor'));
    expect(editor().visible).toBe(true);
    await act(async () => editor().onClose());
    expect(editor().visible).toBe(false);
  });

  it('keeps selection kinds exclusive when clearing selections', async () => {
    await mount();
    expect(editor().selectedGroupId).toBe('default-group');
    await act(async () => editor().onSelect(''));
    expect(editor().selectedGroupId).toBe('default-group');
    await act(async () => editor().onSelectGroup(''));
    expect(editor().selectedGroupId).toBe('');
    await act(async () => editor().onSelectGroup('body'));
    await act(async () => editor().onSelectGroup('empty'));
    expect(editor().selectedGroupId).toBe('empty');
    await act(async () => editor().onDeleteGroup('empty'));
    await waitFor(() => expect(editor().selectedGroupId).toBe(''));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('adds groups and categories, renames groups, and saves per-kind settings', async () => {
    await mount();
    await act(async () => editor().onAddGroup());
    const added = editor().groups[3];
    expect(added).toMatchObject({ name: 'Group 4', categoryIds: [], expanded: true });
    await act(async () => editor().onUpdateGroup({ ...added, name: 'Renamed' }));
    expect(editor().groups[3].name).toBe('Renamed');
    expect(editor().groups[0].name).toBe('General');

    await act(async () => editor().onAddCategoryToGroup(added.id));
    const created = editor().categories[3];
    expect(created).toMatchObject({ kind: 'multiple-choice', name: expect.stringMatching(/^Choice/) });
    expect(editor().groups[3].categoryIds).toEqual([created.id]);
    expect(editor().groups[0].categoryIds).toEqual(['mood', 'energy']);
    expect(editor().selectedCategoryId).toBe(created.id);
    expect(editor().selectedGroupId).toBe('');

    await act(async () => editor().onUpdate({ ...editor().categories[1], name: 'Vigor' }));
    const vigor = editor().categories[1];
    expect(vigor.name).toBe('Vigor');
    expect(vigor.savedTypeSettings.number).toMatchObject({ name: 'Vigor' });
    expect(vigor.savedTypeSettings.number).not.toHaveProperty('savedTypeSettings');
    await act(async () => editor().onUpdate({ ...vigor, name: 'Power' }));
    expect(editor().categories[1].savedTypeSettings.number.name).toBe('Power');
    expect(editor().categories[0].savedTypeSettings).toBeUndefined();
  });

  it('enables, disables, and reorders categories between groups', async () => {
    await mount();
    await act(async () => editor().onToggleGroupEnabled('missing', false));
    await act(async () => editor().onUpdate({ ...editor().categories[1], enabled: false }));
    await act(async () => editor().onToggleGroupEnabled('default-group', false));
    expect(editor().groups[0]).toMatchObject({ enabled: false, suspendedCategoryIds: ['energy'] });
    expect(editor().categories.map((category: CategoryDefinition) => category.enabled)).toEqual([false, false, true]);
    expect(screen.queryByText('General')).toBeNull();
    expect(screen.queryByLabelText('Jump to Mood')).toBeNull();

    await act(async () => editor().onMoveCategory('sleep', 'default-group', 0));
    await act(async () => editor().onMoveCategory('sleep', 'missing', 0));
    expect(editor().groups[1].categoryIds).toEqual(['sleep']);

    await act(async () => editor().onMoveCategory('energy', 'body', 99));
    expect(editor().groups[0]).toMatchObject({ categoryIds: ['mood'], suspendedCategoryIds: [] });
    expect(editor().groups[1].categoryIds).toEqual(['sleep', 'energy']);
    await act(async () => editor().onMoveCategory('energy', 'body', -3));
    expect(editor().groups[1].categoryIds).toEqual(['energy', 'sleep']);

    await act(async () => editor().onToggleGroupEnabled('default-group', true));
    expect(editor().groups[0].enabled).toBe(true);
    expect(editor().categories[0].enabled).toBe(true);
  });

  it('deletes groups with or without their categories', async () => {
    const alert = jest.mocked(Alert.alert);
    await mount();
    await act(async () => editor().onDeleteGroup('missing'));
    expect(alert).not.toHaveBeenCalled();

    await act(async () => editor().onDeleteGroup('body'));
    expect(alert).toHaveBeenCalledWith('Delete Body?', expect.any(String), expect.any(Array));
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Delete categories', 'Move to General']);
    await act(async () => buttons[2].onPress!());
    expect(groupIds()).toEqual(['default-group', 'empty']);
    expect(editor().groups[0].categoryIds).toEqual(['mood', 'energy', 'sleep']);

    await act(async () => editor().onDeleteGroup('default-group'));
    await act(async () => alert.mock.calls[1][2]![1].onPress!());
    expect(groupIds()).toEqual(['empty']);
    expect(editor().categories).toEqual([]);
  });

  it('moves deleted group categories to the first group or drops them when none remain', async () => {
    const alert = jest.mocked(Alert.alert);
    await seed({
      'groupsByWorkspace.v1': {
        user: [
          { id: 'a', name: 'A', categoryIds: ['mood', 'energy'], expanded: true },
          { id: 'b', name: 'B', categoryIds: ['sleep'], expanded: true },
        ],
      },
    });
    await mount();
    await act(async () => editor().onDeleteGroup('a'));
    await act(async () => alert.mock.calls[0][2]![2].onPress!());
    expect(editor().groups).toEqual([
      expect.objectContaining({ id: 'b', categoryIds: ['sleep', 'mood', 'energy'] }),
    ]);
    await act(async () => editor().onDeleteGroup('b'));
    await act(async () => alert.mock.calls[1][2]![2].onPress!());
    await waitFor(async () => expect((await stored('groupsByWorkspace.v1')).user).toEqual([]));
    // Categories survive and fall back into a regenerated default group.
    expect(editor().groups).toEqual([
      expect.objectContaining({ id: 'default-group', categoryIds: ['mood', 'energy', 'sleep'] }),
    ]);
  });

  it('restores missing default categories only in the user workspace', async () => {
    await mount();
    const defaults = createDefaultWorkspaceData();
    await act(async () => editor().onRestoreDefaults());
    expect(categoryNames()).toEqual(['Mood', 'Energy', 'Sleep', ...defaultCategoryNames()]);
    // Restored categories land in their own named groups, created alongside existing ones.
    const groupNames = () => editor().groups.map((group: CategoryGroup) => group.name);
    expect(groupNames()).toEqual(expect.arrayContaining(['Headache', 'Stomach', 'Lifestyle']));
    for (const defaultGroup of defaults.groups) {
      const restored = editor().groups.find((group: CategoryGroup) => group.name === defaultGroup.name);
      expect(restored.categoryIds).toHaveLength(defaultGroup.categoryIds.length);
    }

    // Running again adds nothing.
    await act(async () => editor().onRestoreDefaults());
    expect(categoryNames()).toEqual(['Mood', 'Energy', 'Sleep', ...defaultCategoryNames()]);

    // Re-adding a deleted default re-links its time-since sources to the surviving categories.
    const byName = (name: string) =>
      editor().categories.find((category: CategoryDefinition) => category.name === name);
    const mealsId = byName('Meals').id;
    const caffeineId = byName('Caffeine').id;
    const headacheId = byName('Headache episode').id;
    await act(async () => editor().onDelete(byName('Stomach pain onset').id));
    await act(async () => editor().onRestoreDefaults());
    const restoredOnset = byName('Stomach pain onset');
    expect(restoredOnset.eventTime.timeSinceCategoryIds).toEqual([
      mealsId,
      caffeineId,
      headacheId,
    ]);
    const stomachGroup = editor().groups.find((group: CategoryGroup) => group.name === 'Stomach');
    expect(stomachGroup.categoryIds).toContain(restoredOnset.id);

    // Duration categories re-link the same way.
    await act(async () => editor().onDelete(headacheId));
    await act(async () => editor().onRestoreDefaults());
    const restoredEpisode = byName('Headache episode');
    expect(restoredEpisode.duration.timeSinceCategoryIds).toEqual([
      mealsId,
      restoredOnset.id,
    ]);

    await act(async () => picker().onSelect('work'));
    await act(async () => editor().onRestoreDefaults());
    expect(editor().categories).toEqual([]);
  });

  it.each([
    ['without a default group', [{ id: 'other', name: 'Other', categoryIds: ['sleep'], expanded: true }]],
    ['with no stored groups', []],
  ])('restores defaults %s', async (_label, groups) => {
    await seed({
      'categoriesByWorkspace.v1': { user: [sleep] },
      'groupsByWorkspace.v1': { user: groups },
    });
    await mount();
    await act(async () => editor().onRestoreDefaults());
    expect(categoryNames()).toEqual(['Sleep', ...defaultCategoryNames()]);
    for (const defaultGroup of createDefaultWorkspaceData().groups) {
      const restored = editor().groups.find((group: CategoryGroup) => group.name === defaultGroup.name);
      expect(restored.categoryIds).toHaveLength(defaultGroup.categoryIds.length);
    }
  });
});

describe('App workspaces', () => {
  it('selects, manages, renames, and reorders workspaces', async () => {
    await seed({
      'workspaces.v1': [
        { id: 'user', name: 'User' },
        { id: 'test', name: 'Test', hidden: true },
        { id: 'work', name: 'Work' },
      ],
    });
    await mount();
    expect(picker().options).toEqual([
      { id: 'user', label: 'User' },
      { id: 'work', label: 'Work' },
    ]);
    await act(async () => picker().onSelect('work'));
    expect(picker().selectedId).toBe('work');
    expect(manager().visible).toBe(false);
    await act(async () => picker().onManage());
    expect(manager().visible).toBe(true);
    await act(async () => manager().onUpdate('work', { name: 'Job', notes: 'Day job' }));
    expect(screen.getByText('Day job')).toBeTruthy();
    expect(manager().workspaces[0].name).toBe('User');
    await act(async () => manager().onReorder(1, 0));
    await waitFor(async () =>
      expect((await stored('workspaces.v1')).map((workspace: { id: string }) => workspace.id)).toEqual([
        'work',
        'user',
        'test',
      ]),
    );
    await act(async () => manager().onClose());
    expect(manager().visible).toBe(false);
  });

  it('creates workspaces from built-in datasets or default categories', async () => {
    await mount();
    await act(async () => manager().onAdd('testNumber', ''));
    expect(picker().selectedId).toBe('testnumber');
    expect(editor().categories.length).toBeGreaterThan(0);

    await act(async () => manager().onAdd('testChoice', ''));
    expect(picker().selectedId).toBe('testchoice');
    expect(editor().categories.length).toBeGreaterThan(0);

    await act(async () => manager().onAdd('Plain', 'Notes'));
    expect(picker().selectedId).toBe('plain');
    expect(categoryNames()).toEqual(defaultCategoryNames());
    expect(editor().groups.flatMap((group: CategoryGroup) => group.categoryIds)).toEqual(
      editor().categories.map((category: CategoryDefinition) => category.id),
    );
    await waitFor(async () => expect((await stored('recordsByWorkspace.v1')).plain).toEqual({}));
  });

  it('copies stored test categories without records into testChoice', async () => {
    await seed({
      'workspaces.v1': [{ id: 'user', name: 'User' }, { id: 'test', name: 'Test', hidden: true }],
      'categoriesByWorkspace.v1': { user: [mood], test: [sleep] },
      'groupsByWorkspace.v1': { user: [], test: [] },
      'recordsByWorkspace.v1': { user: {} },
    });
    await mount();
    await act(async () => manager().onAdd('testChoice', ''));
    expect(editor().categories.map((category: CategoryDefinition) => category.id)).toEqual(['sleep']);
    await waitFor(async () => expect((await stored('recordsByWorkspace.v1')).testchoice).toEqual({}));
  });

  it('confirms workspace deletion and ignores unknown or last workspaces', async () => {
    const alert = jest.mocked(Alert.alert);
    const removeItem = jest.mocked(AsyncStorage.removeItem);
    removeItem.mockRejectedValueOnce(new Error('disk'));
    await mount();
    await act(async () => manager().onDelete('missing'));
    expect(alert).not.toHaveBeenCalled();

    await act(async () => manager().onDelete('user'));
    expect(alert).toHaveBeenCalledWith('Delete User?', expect.any(String), expect.any(Array));
    await act(async () => alert.mock.calls[0][2]![1].onPress!());
    expect(removeItem).toHaveBeenCalledWith('correlation.mobile.v6.cache.user');
    await waitFor(() => expect(picker().selectedId).toBe('work'));
    expect(manager().workspaces.map((workspace: { id: string }) => workspace.id)).toEqual(['work']);
    await waitFor(async () => expect(await stored('categoriesByWorkspace.v1')).toEqual({ work: [] }));

    await act(async () => manager().onDelete('work'));
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['keeps a hidden-only active workspace', [{ id: 'h', name: 'H', hidden: true }], 'h', 'h'],
    ['falls back to the first hidden workspace', [{ id: 'h', name: 'H', hidden: true }, { id: 'g', name: 'G', hidden: true }], 'missing', 'h'],
    ['falls back to a visible workspace', [{ id: 'h', name: 'H', hidden: true }, { id: 'v', name: 'V' }], 'h', 'v'],
    ['keeps the active id when only the reserved test workspace exists', [{ id: 'test', name: 'Test' }], 'test', 'test'],
  ])('%s', async (_label, list, active, expected) => {
    await seed({ 'workspaces.v1': list, 'activeWorkspaceId.v1': active });
    await mount();
    await waitFor(() => expect(picker().selectedId).toBe(expected));
  });
});

describe('App settings and transfers', () => {
  it('opens and closes the settings drawer, export, and import flows', async () => {
    await mount();
    await fireEvent.press(screen.getByLabelText('Open settings'));
    expect(props(SettingsDrawer).visible).toBe(true);
    await act(async () => props(SettingsDrawer).onClose());
    expect(props(SettingsDrawer).visible).toBe(false);

    await fireEvent.press(screen.getByLabelText('Open settings'));
    await act(async () => props(SettingsDrawer).onExport());
    expect(props(SettingsDrawer).visible).toBe(false);
    expect(props(ExportDataModal).visible).toBe(true);
    expect(props(ExportDataModal).globals).toEqual({
      analysisSettings: {
        correlationOffset: 7,
        topCorrelationThreshold: 0.7,
        summaryLookback: 7,
        statisticsSettings: createDefaultStatisticsSettings(),
      },
      appPreferences: { activeWorkspaceId: 'user', categoryIndexExpanded: true },
    });
    await act(async () => props(ExportDataModal).onClose());
    expect(props(ExportDataModal).visible).toBe(false);

    await fireEvent.press(screen.getByLabelText('Open settings'));
    await act(async () => props(SettingsDrawer).onImport());
    expect(props(SettingsDrawer).visible).toBe(false);
    expect(props(ImportDataModal).visible).toBe(true);
    await act(async () => props(ImportDataModal).onClose());
    expect(props(ImportDataModal).visible).toBe(false);
  });

  const plan = (
    workspaces: ImportPlan['workspaces'],
    activeWorkspaceId: string,
  ): ImportPlan => ({
    workspaces,
    conflicts: [],
    globals: {
      analysisSettings: {
        correlationOffset: 14,
        topCorrelationThreshold: 0.5,
        summaryLookback: 30,
        statisticsSettings: { ...createDefaultStatisticsSettings(), showSummaryStatistics: false } as never,
      },
      appPreferences: { activeWorkspaceId, categoryIndexExpanded: false },
    },
  });
  const snapshot = (id: string, extra: Partial<ImportPlan['workspaces'][number]> = {}) => ({
    id,
    name: id.toUpperCase(),
    categories: [],
    groups: [],
    records: {},
    ...extra,
  });

  it('rejects an empty import plan', async () => {
    await mount();
    expect(() => props(ImportDataModal).onApply(plan([], 'user'))).toThrow(
      'The import plan is missing a workspace.',
    );
  });

  it('applies an import plan, keeping existing workspace metadata when omitted', async () => {
    await seed({
      'workspaces.v1': [
        { id: 'user', name: 'User', notes: 'Mine', hidden: false },
        { id: 'work', name: 'Work', notes: 'Old', hidden: true },
      ],
    });
    await mount();
    await act(async () =>
      props(ImportDataModal).onApply(
        plan(
          [
            snapshot('user', { categories: [mood], records: { a: record('mood', 0) } }),
            snapshot('work'),
            snapshot('fresh', { notes: 'New', hidden: false }),
          ],
          'fresh',
        ),
      ),
    );
    expect(picker().selectedId).toBe('fresh');
    expect(manager().workspaces).toEqual([
      { id: 'user', name: 'USER', notes: 'Mine', hidden: false },
      { id: 'work', name: 'WORK', notes: 'Old', hidden: true },
      { id: 'fresh', name: 'FRESH', notes: 'New', hidden: false },
    ]);
    expect(props(ExportDataModal).globals).toMatchObject({
      analysisSettings: { correlationOffset: 14, topCorrelationThreshold: 0.5, summaryLookback: 30 },
      appPreferences: { activeWorkspaceId: 'fresh', categoryIndexExpanded: false },
    });
    expect(screen.queryByLabelText('Jump to Mood')).toBeNull();
    await act(async () => picker().onSelect('user'));
    expect(inputCard('mood').entries).toHaveLength(1);
  });

  it.each([
    ['skips a hidden preferred workspace', [snapshot('a', { hidden: true }), snapshot('b', { hidden: false })], 'a', 'b'],
    ['uses the first workspace when every workspace is hidden', [snapshot('a', { hidden: true }), snapshot('b', { hidden: true })], 'missing', 'a'],
    ['defaults unknown workspace metadata', [snapshot('new')], 'gone', 'new'],
  ])('import %s', async (_label, workspaces, preferred, expected) => {
    await mount();
    await act(async () => props(ImportDataModal).onApply(plan(workspaces, preferred)));
    await waitFor(() => expect(picker().selectedId).toBe(expected));
    if (expected === 'new')
      expect(manager().workspaces).toEqual([{ id: 'new', name: 'NEW', notes: '', hidden: false }]);
  });

  it('wires statistics panel and settings callbacks', async () => {
    mockPager.statsMounted = true;
    await mount();
    expect(stats().chartSelectionHydrated).toBe(true);
    await act(async () => stats().onChartSelectionChange({ categoryIds: ['mood'] }));
    expect(stats().chartSelection).toEqual({ categoryIds: ['mood'] });
    await waitFor(async () =>
      expect(await stored('chart.selectionByWorkspace.v1')).toEqual({ user: { categoryIds: ['mood'] } }),
    );
    await act(async () => stats().setCorrelationOffset(12.6));
    expect(stats().safeCorrelationOffset).toBe(13);
    await act(async () => stats().setCorrelationOffset(1000));
    expect(stats().safeCorrelationOffset).toBe(366);
    await act(async () => stats().setCorrelationOffset(-1));
    expect(stats().safeCorrelationOffset).toBe(0);
    await act(async () => stats().setTopCorrelationThreshold(0.25));
    expect(stats().safeTopCorrelationThreshold).toBe(0.25);

    await act(async () => stats().setStatisticsSettingsOpen(true));
    expect(props(StatisticsSettings).visible).toBe(true);
    const nextSettings = { ...props(StatisticsSettings).settings, showSummaryStatistics: false };
    await act(async () => props(StatisticsSettings).onChange(nextSettings));
    expect(stats().statisticsSettings).toEqual(nextSettings);
    await act(async () => props(StatisticsSettings).onClose());
    expect(props(StatisticsSettings).visible).toBe(false);
    await act(async () => stats().setStatisticsSettingsOpen(true));
    await act(async () => props(StatisticsSettings).onOpenCategorySettings());
    expect(props(StatisticsSettings).visible).toBe(false);
    expect(editor().visible).toBe(true);
  });
});
