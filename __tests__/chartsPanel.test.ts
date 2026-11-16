import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ChartsPanel } from '../src/components/ChartsPanel';
import { HistoricalChart } from '../src/components/HistoricalChart';
import { createDefaultCategory } from '../src/lib/category';
import * as chartSeries from '../src/lib/chartSeries';
import type { CategorySelectionRecord } from '../src/types/category';
import type { ChartSelection, ChartSeries } from '../src/types/charts';

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

const categories = ['First', 'Second', 'Third'].map((name, index) => ({
  ...createDefaultCategory('number', index, name),
  id: name.toLowerCase(),
  allowMultiplePerDay: true,
}));
const records: Record<string, CategorySelectionRecord> = Object.fromEntries(
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
);

afterEach(() => {
  jest.restoreAllMocks();
});

const renderSelectableChart = async () => {
  let latest: ChartSelection | undefined;
  const Harness = () => {
    const [selection, setSelection] = React.useState<ChartSelection>();
    latest = selection;
    return React.createElement(ChartsPanel, {
      categories,
      records,
      selection,
      selectionHydrated: true,
      onSelectionChange: setSelection,
    });
  };
  const screen = await render(React.createElement(Harness));
  await waitFor(() =>
    expect(screen.getByLabelText('First chart series')).toBeTruthy(),
  );
  return { screen, getSelection: () => latest };
};

it('defaults to two mean series and changes series without rebuilding chart data', async () => {
  const build = jest.spyOn(chartSeries, 'buildChartCategories');
  const { screen, getSelection } = await renderSelectableChart();
  expect(
    screen.getByLabelText('First chart series').props.accessibilityState
      .expanded,
  ).toBe(false);
  expect(screen.queryByLabelText('First: mean')).toBeNull();
  await fireEvent.press(screen.getByLabelText('First chart series'));
  await fireEvent.press(screen.getByLabelText('Second chart series'));
  expect(
    screen.getByLabelText('First: mean').props.accessibilityState.checked,
  ).toBe(true);
  expect(
    screen.getByLabelText('Second: mean').props.accessibilityState.checked,
  ).toBe(true);
  expect(screen.queryByLabelText('First: Main')).toBeNull();
  expect(screen.queryByLabelText('Third: mean')).toBeNull();
  expect(
    screen.getByRole('checkbox', { name: 'Enable Third chart' }),
  ).toBeTruthy();
  const initialBuilds = build.mock.calls.length;
  await fireEvent.press(screen.getByLabelText('First: sum'));
  await fireEvent.press(screen.getByLabelText('First: mean'));
  expect(getSelection()?.categories.first.selectedSeriesIds).toEqual([
    'first:chart:virtual:first:value:sum',
  ]);
  expect(
    screen.getByLabelText('First: sum').props.accessibilityState.checked,
  ).toBe(true);
  expect(
    screen
      .getAllByRole('checkbox')
      .filter((button) =>
        button.props.accessibilityLabel?.startsWith('First:'),
      )[0].props.accessibilityLabel,
  ).toBe('First: mean');
  expect(build.mock.calls.length).toBe(initialBuilds);
});

it('shows, selects and hides inverse series from the header toggle', async () => {
  const { screen, getSelection } = await renderSelectableChart();
  await fireEvent.press(screen.getByLabelText('First chart series'));
  expect(screen.queryByLabelText('First: mean inverse')).toBeNull();
  await fireEvent(
    screen.getByRole('switch', { name: 'Enable First inverse chart series' }),
    'valueChange',
    true,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('First: mean inverse')).toBeTruthy(),
  );
  expect(getSelection()?.categories.first.showInverses).toBe(true);
  await fireEvent.press(screen.getByLabelText('First: mean inverse'));
  await waitFor(() =>
    expect(getSelection()?.categories.first.selectedSeriesIds).toEqual([
      'first:chart:virtual:first:value:mean',
      'first:chart:virtual:first:value:mean:inverse',
    ]),
  );
  await fireEvent(
    screen.getByRole('switch', { name: 'Enable First inverse chart series' }),
    'valueChange',
    false,
  );
  await waitFor(() =>
    expect(screen.queryByLabelText('First: mean inverse')).toBeNull(),
  );
  expect(getSelection()?.categories.first).toEqual({
    enabled: true,
    showInverses: false,
    selectedSeriesIds: ['first:chart:virtual:first:value:mean'],
  });
});

it('keeps disclosure independent of enablement and restores remembered series', async () => {
  const { screen, getSelection } = await renderSelectableChart();
  await fireEvent.press(screen.getByLabelText('First chart series'));
  await fireEvent.press(screen.getByLabelText('First: sum'));
  await fireEvent.press(screen.getByLabelText('First: mean'));
  await fireEvent.press(screen.getByLabelText('First chart series'));
  expect(
    screen.getByLabelText('First chart series').props.accessibilityState
      .expanded,
  ).toBe(false);
  expect(screen.queryByLabelText('First: sum')).toBeNull();
  expect(getSelection()?.categories.first.enabled).toBe(true);
  await fireEvent(
    screen.getByRole('switch', { name: 'Enable First chart' }),
    'valueChange',
    false,
  );
  expect(screen.queryByLabelText('First chart series')).toBeNull();
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  expect(
    screen.getByLabelText('First chart series').props.accessibilityState
      .expanded,
  ).toBe(true);
  expect(
    screen.getByLabelText('First: mean').props.accessibilityState.checked,
  ).toBe(false);
  expect(
    screen.getByLabelText('First: sum').props.accessibilityState.checked,
  ).toBe(true);
  expect(getSelection()?.categories.first.selectedSeriesIds).toEqual([
    'first:chart:virtual:first:value:sum',
  ]);
});

it('disables a category when its last series is cleared and restores the default series on re-enable', async () => {
  const { screen, getSelection } = await renderSelectableChart();
  await fireEvent.press(screen.getByLabelText('First chart series'));
  await fireEvent.press(screen.getByLabelText('First: mean'));
  expect(screen.queryByLabelText('First chart series')).toBeNull();
  expect(getSelection()?.categories.first.enabled).toBe(false);
  expect(getSelection()?.categories.first.selectedSeriesIds).toEqual([]);
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  expect(getSelection()?.categories.first.enabled).toBe(true);
  expect(getSelection()?.categories.first.selectedSeriesIds).toEqual([
    'first:chart:virtual:first:value:mean',
  ]);
});

it('waits for hydration and data, preserves intentional emptiness and retains active categories without points', async () => {
  const onSelectionChange = jest.fn();
  const screen = await render(
    React.createElement(ChartsPanel, {
      categories,
      records: {},
      selectionHydrated: false,
      onSelectionChange,
    }),
  );
  expect(onSelectionChange).not.toHaveBeenCalled();
  await screen.rerender(
    React.createElement(ChartsPanel, {
      categories,
      records,
      selectionHydrated: false,
      onSelectionChange,
    }),
  );
  expect(onSelectionChange).not.toHaveBeenCalled();
  await screen.rerender(
    React.createElement(ChartsPanel, {
      categories,
      records: {},
      selectionHydrated: true,
      onSelectionChange,
    }),
  );
  expect(onSelectionChange).not.toHaveBeenCalled();
  await screen.rerender(
    React.createElement(ChartsPanel, {
      categories,
      records,
      selectionHydrated: true,
      selection: { categories: {} },
      onSelectionChange,
    }),
  );
  expect(screen.getByText('No series selected.')).toBeTruthy();
  expect(onSelectionChange).not.toHaveBeenCalled();
  await screen.rerender(
    React.createElement(ChartsPanel, {
      categories,
      records: {},
      selectionHydrated: true,
      onSelectionChange,
      selection: {
        categories: {
          first: {
            enabled: true,
            selectedSeriesIds: ['first:chart:virtual:first:value:mean'],
          },
        },
      },
    }),
  );
  expect(screen.getByLabelText('First chart series')).toBeTruthy();
  expect(
    screen.getByText('Add daily values to populate the chart.'),
  ).toBeTruthy();
});

it('initializes when hydrated data arrives, skipping categories without data', async () => {
  const onSelectionChange = jest.fn();
  const screen = await render(
    React.createElement(ChartsPanel, {
      categories,
      records: {},
      selectionHydrated: true,
      onSelectionChange,
    }),
  );
  expect(onSelectionChange).not.toHaveBeenCalled();
  await screen.rerender(
    React.createElement(ChartsPanel, {
      categories,
      records: { second: records.second, third: records.third },
      selectionHydrated: true,
      onSelectionChange,
    }),
  );
  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  expect(onSelectionChange).toHaveBeenCalledWith({
    categories: {
      second: {
        enabled: true,
        selectedSeriesIds: ['second:chart:virtual:second:value:mean'],
      },
      third: {
        enabled: true,
        selectedSeriesIds: ['third:chart:virtual:third:value:mean'],
      },
    },
  });
});

it('retains and restores a remembered ordinal without current points', async () => {
  const rememberedId = chartSeries
    .buildChartCategories(categories, {
      ...records,
      extra: { ...records.first, key: 'extra', ordinal: 2 },
    })[0]
    .series.find((series) => series.label === 'instance 3')?.id;
  expect(rememberedId).toBeDefined();
  const Harness = () => {
    const [selection, setSelection] = React.useState<ChartSelection>({
      categories: {
        first: { enabled: true, selectedSeriesIds: [rememberedId!] },
      },
    });
    return React.createElement(ChartsPanel, {
      categories,
      records,
      selection,
      selectionHydrated: true,
      onSelectionChange: setSelection,
    });
  };
  const screen = await render(React.createElement(Harness));
  await fireEvent.press(screen.getByLabelText('First chart series'));
  expect(
    screen.getByLabelText('First: instance 3').props.accessibilityState.checked,
  ).toBe(true);
  expect(screen.getByText('No data for the selected series.')).toBeTruthy();
  await fireEvent(
    screen.getByRole('switch', { name: 'Enable First chart' }),
    'valueChange',
    false,
  );
  expect(screen.getByText('No series selected.')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('checkbox', { name: 'Enable First chart' }),
  );
  expect(
    screen.getByLabelText('First: instance 3').props.accessibilityState.checked,
  ).toBe(true);
  expect(
    screen.getByLabelText('First: mean').props.accessibilityState.checked,
  ).toBe(false);
});

it('uses actual timestamps, breaks missing daily points, shows single points and all equal-time raw values', async () => {
  const start = new Date('2026-10-05T09:00:00').getTime();
  const hour = 60 * 60 * 1000;
  const raw: ChartSeries = {
    id: 'raw',
    name: 'First: Raw',
    label: 'Raw',
    color: '#123456',
    raw: true,
    points: [0, 1, 1, 9].map((offset, index) => ({
      key: String(index),
      timestamp: start + offset * hour,
      value: index + 1,
      normalized: index / 3,
    })),
  };
  const main: ChartSeries = {
    ...raw,
    id: 'main',
    name: 'First: mean',
    raw: false,
    points: [
      { key: 'a', timestamp: start, value: 2, normalized: 0.5 },
      { key: 'b', timestamp: start + hour, value: null, normalized: null },
      { key: 'c', timestamp: start + 9 * hour, value: 2, normalized: 0.5 },
    ],
  };
  const screen = await render(
    React.createElement(HistoricalChart, { series: [raw, main] }),
  );
  const paths = screen.getAllByTestId('svg-path');
  expect(paths[0].props.d).toContain('L 85.33333333333333');
  expect(paths[1].props.d.match(/M/g)).toHaveLength(2);
  await fireEvent(screen.getByTestId('historical-chart'), 'responderGrant', {
    nativeEvent: { locationX: 85 },
  });
  expect(screen.getByText(/First: Raw: 2.00/)).toBeTruthy();
  expect(screen.getByText(/First: Raw: 3.00/)).toBeTruthy();
  await screen.rerender(
    React.createElement(HistoricalChart, {
      series: [{ ...main, points: [main.points[0]] }],
    }),
  );
  expect(screen.queryByText(/First: Raw: 2.00/)).toBeNull();
  const point = screen.getByTestId('svg-point');
  expect(point.props.cx).toBe(286);
  expect(point.props.cy).toBe(117);
  await screen.rerender(
    React.createElement(HistoricalChart, { series: [{ ...main, points: [] }] }),
  );
  expect(screen.getByText('No data for the selected series.')).toBeTruthy();
});

it('formats duration point values as days, clock time, and optional milliseconds', async () => {
  const duration: ChartSeries = {
    id: 'sleep-duration',
    name: 'Sleep: total duration',
    label: 'total duration',
    color: '#123456',
    raw: false,
    durationValue: true,
    showMilliseconds: true,
    points: [
      { key: 'first', timestamp: 1000, value: 90061000, normalized: 0 },
      { key: 'second', timestamp: 2000, value: 172800000, normalized: 1 },
    ],
  };
  const screen = await render(
    React.createElement(HistoricalChart, { series: [duration] }),
  );

  await fireEvent(screen.getByTestId('historical-chart'), 'responderGrant', {
    nativeEvent: { locationX: 28 },
  });
  expect(
    screen.getByText('Sleep: total duration: 1d 01:01:01.000'),
  ).toBeTruthy();

  const withoutMilliseconds = {
    ...duration,
    showMilliseconds: false,
  };
  await screen.rerender(
    React.createElement(HistoricalChart, { series: [withoutMilliseconds] }),
  );
  await fireEvent(screen.getByTestId('historical-chart'), 'responderGrant', {
    nativeEvent: { locationX: 28 },
  });
  expect(screen.getByText('Sleep: total duration: 1d 01:01:01')).toBeTruthy();
});

it('keys projected data by category id regardless of selection order', async () => {
  const build = jest.spyOn(chartSeries, 'buildChartCategories');
  const choice = (id: string) => ({
    enabled: true,
    selectedSeriesIds: [`${id}:ordinal:1`],
    showInverses: id === 'first',
  });
  const props = (order: string[]) => ({
    categories,
    records,
    selectionHydrated: true,
    onSelectionChange: jest.fn(),
    selection: {
      categories: Object.fromEntries(order.map((id) => [id, choice(id)])),
    } as ChartSelection,
  });
  const screen = await render(
    React.createElement(ChartsPanel, props(['second', 'first'])),
  );
  expect(build).toHaveBeenCalledTimes(1);
  expect(Object.keys(build.mock.calls[0][2]!.categories)).toEqual([
    'first',
    'second',
  ]);
  await screen.rerender(
    React.createElement(ChartsPanel, props(['first', 'second'])),
  );
  expect(build).toHaveBeenCalledTimes(1);
});
