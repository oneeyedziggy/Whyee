import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ChartsPanel } from '../src/components/ChartsPanel';
import {
  persistentStatePrefix,
  usePersistentState,
} from '../src/hooks/usePersistentState';
import { createDefaultCategory } from '../src/lib/category';
import type { CategorySelectionRecord } from '../src/types/category';
import type { ChartSelection } from '../src/types/charts';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('lucide-react-native', () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
}));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: View,
    Line: View,
    Text,
    Path: (props: object) =>
      React.createElement(View, { ...props, testID: 'svg-path' }),
    Circle: (props: object) =>
      React.createElement(View, { ...props, testID: 'svg-point' }),
  };
});

const selectionKey = 'chart.selectionByWorkspace.v1';
const storageKey = `${persistentStatePrefix}${selectionKey}`;
const categories = ['First', 'Second'].map((name, index) => ({
  ...createDefaultCategory('number', index, name),
  id: name.toLowerCase(),
  allowMultiplePerDay: true,
}));
const records: Record<string, CategorySelectionRecord> = {
  ...Object.fromEntries(
    categories.map((category) => [
      category.id,
      {
        key: category.id,
        categoryId: category.id,
        dateKey: '2026-10-05',
        ordinal: 0,
        localTime: '09:00:00',
        value: 2,
      },
    ]),
  ),
  // A second same-day entry is what makes the Raw series worth showing.
  firstExtra: {
    key: 'firstExtra',
    categoryId: 'first',
    dateKey: '2026-10-05',
    ordinal: 1,
    localTime: '10:00:00',
    value: 3,
  },
};

it('persists late-hydrated choices, workspace isolation, header restoration and intentional emptiness across reloads', async () => {
  const savedA: ChartSelection = {
    categories: {
      first: {
        enabled: false,
        selectedSeriesIds: ['first:chart:virtual:first:value:sum'],
      },
    },
  };
  const empty: ChartSelection = { categories: {} };
  const saved = { A: savedA, B: empty };
  await AsyncStorage.clear();
  await AsyncStorage.setItem(storageKey, JSON.stringify(saved));
  const getItem = jest.mocked(AsyncStorage.getItem);
  const setItem = jest.mocked(AsyncStorage.setItem);
  getItem.mockClear();
  setItem.mockClear();
  let resolveHydration!: (value: string | null) => void;
  getItem.mockImplementationOnce(
    () =>
      new Promise<string | null>((resolve) => {
        resolveHydration = resolve;
      }),
  );

  let latest: Record<string, ChartSelection> = {};
  let hydrated = false;
  const PersistentCharts = ({ workspaceId }: { workspaceId: string }) => {
    const [selections, setSelections, selectionsHydrated] = usePersistentState<
      Record<string, ChartSelection>
    >(selectionKey, {});
    latest = selections;
    hydrated = selectionsHydrated;
    return React.createElement(ChartsPanel, {
      key: workspaceId,
      categories,
      records,
      selection: selections[workspaceId],
      selectionHydrated: selectionsHydrated,
      onSelectionChange: (selection: ChartSelection) => {
        setSelections((current) => ({ ...current, [workspaceId]: selection }));
      },
    });
  };
  const Harness = ({
    workspaceId,
    reload,
  }: {
    workspaceId: string;
    reload: number;
  }) => React.createElement(PersistentCharts, { key: reload, workspaceId });
  const screen = await render(
    React.createElement(Harness, { workspaceId: 'A', reload: 0 }),
  );
  const expectStored = async (expected: Record<string, ChartSelection>) => {
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(storageKey)).toBe(
        JSON.stringify(expected),
      );
    });
  };
  const expectVirtualOnly = () => {
    expect(
      screen.getByLabelText('First: sum').props.accessibilityState.checked,
    ).toBe(true);
    expect(
      screen.getByLabelText('First: mean').props.accessibilityState.checked,
    ).toBe(false);
    expect(screen.queryByLabelText('Second chart series')).toBeNull();
  };

  expect(getItem).toHaveBeenCalledWith(storageKey);
  expect(hydrated).toBe(false);
  expect(latest).toEqual({});
  expect(
    screen.getByRole('checkbox', { name: 'Enable First chart' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByLabelText('First: mean')).toBeNull();
  expect(setItem).not.toHaveBeenCalled();
  await act(async () => {
    resolveHydration(JSON.stringify(saved));
  });
  await waitFor(() => {
    expect(hydrated).toBe(true);
    expect(latest).toEqual(saved);
    expect(
      screen.getByRole('checkbox', { name: 'Enable First chart' }).props
        .accessibilityState.disabled,
    ).toBe(false);
  });
  expect(screen.queryByLabelText('First chart series')).toBeNull();
  expect(screen.getByText('No series selected.')).toBeTruthy();
  await expectStored(saved);
  expect(
    setItem.mock.calls.every(
      ([key, value]) => key === storageKey && value === JSON.stringify(saved),
    ),
  ).toBe(true);

  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  const enabledA: ChartSelection = {
    categories: {
      first: { ...savedA.categories.first, enabled: true },
    },
  };
  await waitFor(() => {
    expectVirtualOnly();
    expect(latest.A).toEqual(enabledA);
  });
  await expectStored({ A: enabledA, B: empty });
  await fireEvent(
    screen.getByRole('switch', { name: 'Enable First chart' }),
    'valueChange',
    false,
  );
  await waitFor(() => {
    expect(latest.A).toEqual(savedA);
    expect(screen.queryByLabelText('First chart series')).toBeNull();
  });
  await expectStored(saved);

  await screen.rerender(
    React.createElement(Harness, { workspaceId: 'B', reload: 0 }),
  );
  await waitFor(() => {
    expect(latest.B).toEqual(empty);
    expect(screen.getByText('No series selected.')).toBeTruthy();
    expect(screen.queryByLabelText('First: mean')).toBeNull();
    expect(screen.queryByLabelText('Second: mean')).toBeNull();
  });
  await expectStored(saved);
  await screen.rerender(
    React.createElement(Harness, { workspaceId: 'B', reload: 1 }),
  );
  await waitFor(() => {
    expect(hydrated).toBe(true);
    expect(latest).toEqual(saved);
  });
  expect(screen.getByText('No series selected.')).toBeTruthy();
  expect(screen.queryByLabelText('First chart series')).toBeNull();

  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText('First: mean').props.accessibilityState.checked,
    ).toBe(true),
  );
  await fireEvent.press(screen.getByLabelText('First: Raw'));
  await waitFor(() =>
    expect(
      screen.getByLabelText('First: Raw').props.accessibilityState.checked,
    ).toBe(true),
  );
  await fireEvent.press(screen.getByLabelText('First: mean'));
  const enabledB: ChartSelection = {
    categories: {
      first: { enabled: true, selectedSeriesIds: ['first:chart:raw'] },
    },
  };
  await waitFor(() => {
    expect(latest).toEqual({ A: savedA, B: enabledB });
    expect(
      screen.getByLabelText('First: mean').props.accessibilityState.checked,
    ).toBe(false);
  });
  await fireEvent(
    screen.getByRole('switch', { name: 'Enable First chart' }),
    'valueChange',
    false,
  );
  const disabledB: ChartSelection = {
    categories: {
      first: { ...enabledB.categories.first, enabled: false },
    },
  };
  await waitFor(() => expect(latest).toEqual({ A: savedA, B: disabledB }));
  await expectStored({ A: savedA, B: disabledB });

  await screen.rerender(
    React.createElement(Harness, { workspaceId: 'A', reload: 1 }),
  );
  expect(screen.queryByLabelText('First chart series')).toBeNull();
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  await waitFor(() => {
    expectVirtualOnly();
    expect(latest.B).toEqual(disabledB);
  });
  await expectStored({ A: enabledA, B: disabledB });
  await fireEvent.press(screen.getByLabelText('First: sum'));
  const clearedA: ChartSelection = {
    categories: {
      first: { enabled: false, selectedSeriesIds: [] },
    },
  };
  const finalSelections = { A: clearedA, B: disabledB };
  await waitFor(() => {
    expect(latest).toEqual(finalSelections);
    expect(screen.getByText('No series selected.')).toBeTruthy();
  });
  await expectStored(finalSelections);
  setItem.mockClear();

  await screen.rerender(
    React.createElement(Harness, { workspaceId: 'A', reload: 2 }),
  );
  await waitFor(() => {
    expect(hydrated).toBe(true);
    expect(latest).toEqual(finalSelections);
  });
  expect(screen.getByText('No series selected.')).toBeTruthy();
  expect(screen.queryByLabelText('First: mean')).toBeNull();
  expect(screen.queryByLabelText('Second: mean')).toBeNull();
  await expectStored(finalSelections);
  expect(
    setItem.mock.calls.every(
      ([key, value]) =>
        key === storageKey && value === JSON.stringify(finalSelections),
    ),
  ).toBe(true);

  await screen.rerender(
    React.createElement(Harness, { workspaceId: 'B', reload: 2 }),
  );
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  await waitFor(() => {
    expect(
      screen.getByLabelText('First: Raw').props.accessibilityState.checked,
    ).toBe(true);
    expect(
      screen.getByLabelText('First: mean').props.accessibilityState.checked,
    ).toBe(false);
    expect(
      screen.getByLabelText('First: sum').props.accessibilityState.checked,
    ).toBe(false);
    expect(latest).toEqual({ A: clearedA, B: enabledB });
  });
  await expectStored({ A: clearedA, B: enabledB });
});
