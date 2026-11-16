import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { HistoricalChart } from '../src/components/HistoricalChart';
import { formatDurationValue } from '../src/lib/durationFormat';
import type { ChartSeries } from '../src/types/charts';

let mockWindowWidth = 1200;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 900,
    scale: 1,
    fontScale: 1,
  }),
}));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: object) =>
      React.createElement(View, { ...props, testID: 'svg' }),
    Line: View,
    Text,
    Path: View,
    Circle: View,
  };
});

const series: ChartSeries[] = [
  {
    id: 'reading',
    name: 'Reading: value',
    label: 'value',
    color: '#123456',
    raw: false,
    points: [
      { key: 'a', timestamp: 1, value: 1, normalized: 0 },
      { key: 'b', timestamp: 2, value: 2, normalized: 1 },
    ],
  },
];

it('fills a wide desktop container but keeps the mobile chart fixed width', async () => {
  const screen = await render(React.createElement(HistoricalChart, { series }));
  await fireEvent(
    screen.getByTestId('historical-chart').parent!.parent!,
    'layout',
    {
      nativeEvent: { layout: { width: 900, height: 300, x: 0, y: 0 } },
    },
  );
  expect(screen.getByTestId('svg').props.width).toBe(900);

  mockWindowWidth = 600;
  await screen.rerender(
    React.createElement(HistoricalChart, { series: [...series] }),
  );
  expect(screen.getByTestId('svg').props.width).toBe(560);
});

describe('point inspection', () => {
  const durationSeries: ChartSeries[] = [
    ...series,
    {
      id: 'sleep',
      name: 'Sleep: duration',
      label: 'duration',
      color: '#654321',
      raw: true,
      durationValue: true,
      points: [
        { key: 'c', timestamp: 2, value: 3_723_000, normalized: 0.5 },
        { key: 'd', timestamp: 3, value: null, normalized: null },
      ],
    },
    {
      id: 'nap',
      name: 'Nap: duration',
      label: 'duration',
      color: '#abcdef',
      raw: false,
      durationValue: true,
      showMilliseconds: true,
      points: [{ key: 'e', timestamp: 2, value: 1_500, normalized: 0.2 }],
    },
  ];
  const left = 28;
  const right = 560 - 16;
  const at = (locationX: number) => ({ nativeEvent: { locationX } });

  beforeEach(() => {
    mockWindowWidth = 600;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects the nearest timestamp on touch and shows formatted values', async () => {
    const screen = await render(
      React.createElement(HistoricalChart, { series: durationSeries }),
    );
    const chart = screen.getByTestId('historical-chart');
    expect(screen.queryByText(/^Reading: value:/)).toBeNull();

    await fireEvent(chart, 'responderGrant', at(left));
    expect(screen.getByText('Reading: value: 1.00')).toBeTruthy();
    expect(screen.getByText(new Date(1).toLocaleString())).toBeTruthy();

    await fireEvent(chart, 'responderMove', at(right));
    expect(screen.getByText('Reading: value: 2.00')).toBeTruthy();
    expect(
      screen.getByText(
        `Sleep: duration: ${formatDurationValue(3_723_000, false)} (${new Date(2).toLocaleTimeString()})`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(`Nap: duration: ${formatDurationValue(1_500, true)}`),
    ).toBeTruthy();

    await fireEvent(chart, 'responderRelease', at(Number.NaN));
    expect(screen.getByText('Reading: value: 2.00')).toBeTruthy();
    await fireEvent(chart, 'responderRelease', at(left + 1));
    expect(screen.getByText('Reading: value: 1.00')).toBeTruthy();
    expect(chart.props.onMouseMove).toBeUndefined();
  });

  it('follows the mouse on web and clears the selection when it leaves', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const screen = await render(React.createElement(HistoricalChart, { series }));
    const chart = screen.getByTestId('historical-chart');
    const rect = () => ({ left: 100 });

    await fireEvent(chart, 'mouseMove', {
      currentTarget: { getBoundingClientRect: rect },
      nativeEvent: { clientX: 100 + right },
    });
    expect(screen.getByText('Reading: value: 2.00')).toBeTruthy();

    await fireEvent(chart, 'mouseMove', {
      currentTarget: { getBoundingClientRect: rect },
      clientX: 100 + left,
    });
    expect(screen.getByText('Reading: value: 1.00')).toBeTruthy();

    await fireEvent(chart, 'mouseMove', {
      currentTarget: {},
      clientX: 100 + right,
    });
    await fireEvent(chart, 'mouseMove', {
      currentTarget: { getBoundingClientRect: rect },
      nativeEvent: {},
    });
    expect(screen.getByText('Reading: value: 1.00')).toBeTruthy();

    await fireEvent(chart, 'mouseLeave');
    expect(screen.queryByText(/^Reading: value:/)).toBeNull();
  });

  it('shows an empty state without plottable points', async () => {
    const screen = await render(
      React.createElement(HistoricalChart, {
        series: [
          {
            ...series[0],
            points: [{ key: 'x', timestamp: 1, value: null, normalized: null }],
          },
        ],
      }),
    );
    expect(screen.getByText('No data for the selected series.')).toBeTruthy();
  });
});
