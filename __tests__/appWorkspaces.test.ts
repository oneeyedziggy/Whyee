import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import App from '../App';
import { CategoryEditor } from '../src/components/CategoryEditor';
import { ExportDataModal } from '../src/components/ExportDataModal';
import { WorkspaceManagerModal } from '../src/components/WorkspaceManagerModal';
import { WorkspacePicker } from '../src/components/WorkspacePicker';
import { createDefaultCategory, recomputeVirtualSeries } from '../src/lib/category';
import { createDefaultGroup } from '../src/lib/groups';
import { persistentStatePrefix } from '../src/hooks/usePersistentState';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/lib/id', () => {
  let sequence = 0;
  return { createId: (prefix: string) => `${prefix}-test-${sequence++}` };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('lucide-react-native', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Settings: () => null,
}));
jest.mock('../src/hooks/useNotificationSync', () => ({ useNotificationSync: jest.fn() }));
jest.mock('../src/hooks/useCorrelationRows', () => ({
  useCorrelationRows: () => ({ orderedRows: [], loading: false }),
  correlationCachePrefix: 'correlation.mobile.v6.cache.',
}));
jest.mock('../src/hooks/useSwipePager', () => ({
  useSwipePager: () => ({ page: 'daily', setPage: jest.fn(), statsMounted: false }),
}));
jest.mock('../src/components/KeyboardProvider', () => ({
  KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/components/CategoryEditor', () => ({ CategoryEditor: jest.fn(() => null) }));
jest.mock('../src/components/WorkspaceManagerModal', () => ({ WorkspaceManagerModal: jest.fn(() => null) }));
jest.mock('../src/components/WorkspacePicker', () => ({ WorkspacePicker: jest.fn(() => null) }));
jest.mock('../src/components/ExportDataModal', () => ({ ExportDataModal: jest.fn(() => null) }));
jest.mock('../src/components/ImportDataModal', () => ({ ImportDataModal: () => null }));
jest.mock('../src/components/CategoryInputCard', () => ({ CategoryInputCard: () => null }));
jest.mock('../src/components/CarryoverTimerSection', () => ({ CarryoverTimerSection: () => null }));
jest.mock('../src/components/StatsPanel', () => ({ StatsPanel: () => null }));
jest.mock('../src/components/StatisticsSettings', () => ({ StatisticsSettings: () => null }));
jest.mock('../src/components/SettingsDrawer', () => ({ SettingsDrawer: () => null }));
jest.mock('../src/components/DatePickerModal', () => ({ DatePickerModal: () => null }));
jest.mock('../src/components/InfoLink', () => ({ InfoLink: () => null }));

const userCategory = { ...createDefaultCategory('number', 0), id: 'user-number' };
const savedChoice = {
  ...createDefaultCategory('multiple-choice', 0, 'Saved choice'),
  id: 'saved-choice',
};
savedChoice.virtualSeries = recomputeVirtualSeries(savedChoice);
userCategory.virtualSeries = recomputeVirtualSeries(userCategory);
const savedGroup = createDefaultGroup([savedChoice]);
const savedRecords = {
  saved: {
    key: 'saved',
    categoryId: savedChoice.id,
    dateKey: '2021-01-02',
    ordinal: 0,
    localTime: '10:00:00',
    value: 2,
    noteText: 'Keep my history',
  },
};
const storage = async (key: string) =>
  JSON.parse((await AsyncStorage.getItem(`${persistentStatePrefix}${key}`))!);
const editor = () => {
  const calls = jest.mocked(CategoryEditor).mock.calls;
  return calls[calls.length - 1][0];
};
const manager = () => {
  const calls = jest.mocked(WorkspaceManagerModal).mock.calls;
  return calls[calls.length - 1][0];
};
const picker = () => {
  const calls = jest.mocked(WorkspacePicker).mock.calls;
  return calls[calls.length - 1][0];
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.multiSet(Object.entries({
    'workspaces.v1': [
      { id: 'user', name: 'User' },
      { id: 'test', name: 'Test', hidden: false },
    ],
    'categoriesByWorkspace.v1': { user: [userCategory], test: [savedChoice] },
    'groupsByWorkspace.v1': { user: [createDefaultGroup([userCategory])], test: [savedGroup] },
    'recordsByWorkspace.v1': { user: {}, test: savedRecords },
    'activeWorkspaceId.v1': 'test',
  }).map(([key, value]) => [`${persistentStatePrefix}${key}`, JSON.stringify(value)]));
});

it('keeps App selection mutually exclusive after group/category changes and deleting a category', async () => {
  await render(React.createElement(App));
  await waitFor(() => expect(picker().selectedId).toBe('user'));
  expect(editor().selectedCategoryId).toBe('');
  expect(editor().selectedGroupId).toBe('default-group');

  await act(async () => editor().onSelect(userCategory.id));
  expect(editor().selectedCategoryId).toBe(userCategory.id);
  expect(editor().selectedGroupId).toBe('');
  await act(async () => editor().onSelectGroup('default-group'));
  expect(editor().selectedCategoryId).toBe('');
  expect(editor().selectedGroupId).toBe('default-group');
  await act(async () => editor().onSelect(userCategory.id));
  await act(async () => editor().onDelete(userCategory.id));
  await waitFor(() => expect(editor().selectedCategoryId).toBe(''));
  expect(editor().selectedGroupId).toBe('');
});

it('hides the original workspace and copies all saved choice data persistently only when requested', async () => {
  const screen = await render(React.createElement(App));
  await waitFor(() => expect(picker().selectedId).toBe('user'));
  expect(manager().workspaces.map((workspace) => workspace.id)).toEqual(['user']);
  const exportCalls = jest.mocked(ExportDataModal).mock.calls;
  expect(exportCalls[exportCalls.length - 1][0].workspaces.map((workspace) => workspace.id)).toEqual(['user']);
  expect((await storage('categoriesByWorkspace.v1')).test).toEqual([savedChoice]);

  await act(async () => manager().onAdd('testChoice', 'My test copy'));
  await waitFor(async () => {
    expect((await storage('recordsByWorkspace.v1')).testchoice).toEqual(savedRecords);
  });
  expect((await storage('categoriesByWorkspace.v1')).testchoice).toEqual([savedChoice]);
  expect((await storage('groupsByWorkspace.v1')).testchoice).toEqual([savedGroup]);
  expect((await storage('recordsByWorkspace.v1')).test).toEqual(savedRecords);
  await screen.unmount();
  await render(React.createElement(App));
  await waitFor(() => expect(picker().selectedId).toBe('testchoice'));
  expect(editor().categories).toEqual([savedChoice]);
});

it('starts fresh installations without generating any test categories or history', async () => {
  await AsyncStorage.clear();
  await render(React.createElement(App));
  await waitFor(() => expect(picker().selectedId).toBe('user'));
  expect((await storage('workspaces.v1')).map((workspace: { id: string }) => workspace.id))
    .toEqual(['user']);
  expect(Object.keys(await storage('categoriesByWorkspace.v1'))).toEqual(['user']);
  expect(await storage('recordsByWorkspace.v1')).toEqual({ user: {} });
});

it('migrates fixed-key test history without exposing it or replacing it with generated data', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    [`${persistentStatePrefix}testCategories.v10`, JSON.stringify([savedChoice])],
    [`${persistentStatePrefix}testGroups.v4`, JSON.stringify([savedGroup])],
    [`${persistentStatePrefix}testRecords.v10`, JSON.stringify(savedRecords)],
  ]);
  await render(React.createElement(App));
  await waitFor(() => expect(picker().selectedId).toBe('user'));
  expect(manager().workspaces.map((workspace) => workspace.id)).toEqual(['user']);
  expect((await storage('recordsByWorkspace.v1')).test).toEqual(savedRecords);
  await act(async () => manager().onAdd('testChoice', 'Migrated history'));
  await waitFor(async () => {
    expect((await storage('recordsByWorkspace.v1')).testchoice).toEqual(savedRecords);
  });
  expect((await storage('categoriesByWorkspace.v1')).testchoice).toEqual([savedChoice]);
  expect((await storage('groupsByWorkspace.v1')).testchoice).toEqual([savedGroup]);
});

it('does not seed even a reserved workspace name in production', async () => {
  const development = __DEV__;
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true, writable: true });
  try {
    await render(React.createElement(App));
    await waitFor(() => expect(picker().selectedId).toBe('user'));
    await act(async () => manager().onAdd('testData', 'Ordinary production workspace'));
    await waitFor(async () => {
      expect((await storage('recordsByWorkspace.v1')).testdata).toEqual({});
    });
    const categories = (await storage('categoriesByWorkspace.v1')).testdata;
    expect(categories.map((category: { name: string }) => category.name)).toEqual(['Mood', 'Energy']);
    expect((await storage('recordsByWorkspace.v1')).test).toEqual(savedRecords);
  } finally {
    Object.defineProperty(globalThis, '__DEV__', { value: development, configurable: true, writable: true });
  }
});
