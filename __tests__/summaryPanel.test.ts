import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SummaryPanel } from '../src/components/SummaryPanel';
import { createDefaultCategory } from '../src/lib/category';
import { getLocalDateKey } from '../src/lib/dates';
import type { StatisticsSettings } from '../src/lib/statistics';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../src/types/category';

jest.mock('../src/components/InfoLink', () => ({ InfoLink: () => null }));

const mood = createDefaultCategory('number', 0, 'Mood');
const sleep = createDefaultCategory('duration', 1, 'Sleep');
if (sleep.kind === 'duration') sleep.duration.showMilliseconds = false;
const empty = createDefaultCategory('number', 2, 'Empty');
const categories: CategoryDefinition[] = [mood, sleep, empty];

const dateKeyDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getLocalDateKey(date);
};

const record = (
  category: CategoryDefinition,
  daysBack: number,
  value: number,
): CategorySelectionRecord => ({
  key: `${category.id}:${daysBack}`,
  categoryId: category.id,
  dateKey: dateKeyDaysAgo(daysBack),
  ordinal: 0,
  localTime: '12:00',
  value,
});

// Inserted out of date order to prove values are ordered chronologically.
const records = Object.fromEntries(
  [
    record(mood, 1, 6),
    record(mood, 10, 2),
    record(mood, 5, 4),
    record(sleep, 2, 7200000),
    record(sleep, 3, 3600000),
  ].map((entry) => [entry.key, entry]),
);

const allColumns: StatisticsSettings = {};

type Props = React.ComponentProps<typeof SummaryPanel>;

const renderPanel = async (props: Partial<Props> = {}) => {
  const element = (overrides: Partial<Props> = {}) =>
    React.createElement(SummaryPanel, {
      categories,
      records,
      recentDays: 7,
      settings: allColumns,
      ...props,
      ...overrides,
    });
  const screen = await render(element());
  return {
    screen,
    rerender: (overrides: Partial<Props>) => screen.rerender(element(overrides)),
  };
};

type Screen = Awaited<ReturnType<typeof renderPanel>>['screen'];

type HostNode = { children: Array<HostNode | string> };
const textOf = (node: HostNode | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

const rowValues = (screen: Screen, name: string) =>
  (screen.getByText(name).parent as unknown as HostNode).children
    .slice(1)
    .map(textOf);

const rowOrder = (screen: Screen) =>
  screen.getAllByText(/^(Mood|Sleep|Empty)$/).map(textOf);

const headerLabels = (screen: Screen) =>
  screen
    .getAllByLabelText(/, (unsorted|ascending|descending)\. Activate/)
    .map((node) => (node.props.accessibilityLabel as string).split(',')[0]);

const pressHeader = (screen: Screen, label: string) =>
  fireEvent.press(screen.getByLabelText(new RegExp(`^${label}, `)));

describe('SummaryPanel', () => {
  it('shows every enabled column, labelled with the recent window', async () => {
    const { screen } = await renderPanel();
    expect(headerLabels(screen)).toEqual([
      'Category',
      'Mean',
      'Mean 7d',
      'Median',
      'Median 7d',
      'Mode',
      'Mode 7d',
      'Slope',
      'Slope 7d',
      'Autocorrelation',
    ]);
    expect(
      screen.getByLabelText(/^Mean 7d, /).props.accessibilityHint,
    ).toContain('last 7 days');
  });

  it('computes all-time and recent statistics for numeric categories', async () => {
    const { screen } = await renderPanel();
    expect(rowValues(screen, 'Mood')).toEqual([
      '4.00',
      '5.00',
      '4.00',
      '5.00',
      '2.00',
      '4.00',
      '2.00',
      '2.00',
      '--',
    ]);
  });

  it('formats duration statistics as clock values but keeps unitless ones numeric', async () => {
    const { screen } = await renderPanel();
    expect(rowValues(screen, 'Sleep')).toEqual([
      '01:30:00',
      '01:30:00',
      '01:30:00',
      '01:30:00',
      '01:00:00',
      '01:00:00',
      '01:00:00',
      '01:00:00',
      '--',
    ]);
  });

  it('formats event-time statistics as times of day and skips unreadable stamps', async () => {
    const onset = createDefaultCategory('event-time', 3, 'Onset');
    const onsetRecords = Object.fromEntries(
      [
        { ...record(onset, 1, 0), localTime: '08:00:00' },
        { ...record(onset, 2, 0), localTime: '10:30:00' },
        { ...record(onset, 3, 0), localTime: 'bogus' },
      ].map((entry) => [entry.key, entry]),
    );
    const { screen } = await renderPanel({
      categories: [onset],
      records: onsetRecords,
    });
    const values = rowValues(screen, 'Onset');
    expect(values.slice(0, 4)).toEqual(['09:15', '09:15', '09:15', '09:15']);
    // Trend columns stay numeric even for event categories.
    expect(values[6]).toMatch(/^-?\d+\.\d{2}$/);
  });

  it('shows placeholders for categories without records', async () => {
    const { screen } = await renderPanel();
    expect(rowValues(screen, 'Empty')).toEqual(Array(9).fill('--'));
  });

  it('computes autocorrelation at the recent-day lag', async () => {
    const { screen } = await renderPanel({
      recentDays: 1,
      settings: { 'summary.autocorrelation': true },
      categories: [mood],
    });
    // Mood 2, 4, 6 rises in lockstep with its one-day-later values.
    expect(rowValues(screen, 'Mood')[8]).toBe('1.00');
  });

  it.each([
    ['summary.autocorrelation', 'Autocorrelation', '--'],
    ['summary.slope.recent', 'Slope 7d', '2.00'],
  ] as const)(
    'shows only %s and skips history it does not need',
    async (id, header, value) => {
      const { screen } = await renderPanel({
        settings: {
          'summary.mean.all': false,
          'summary.mean.recent': false,
          'summary.median.all': false,
          'summary.median.recent': false,
          'summary.mode.all': false,
          'summary.mode.recent': false,
          'summary.slope.all': false,
          'summary.slope.recent': false,
          'summary.autocorrelation': false,
          [id]: true,
        },
      });
      expect(headerLabels(screen)).toEqual(['Category', header]);
      expect(rowValues(screen, 'Mood')).toEqual([value]);
    },
  );

  it('renders only the category column when no statistic is enabled', async () => {
    const { screen } = await renderPanel({
      settings: {
        'summary.mean.all': false,
        'summary.mean.recent': false,
        'summary.median.all': false,
        'summary.median.recent': false,
        'summary.mode.all': false,
        'summary.mode.recent': false,
        'summary.slope.all': false,
        'summary.slope.recent': false,
        'summary.autocorrelation': false,
      },
      categories: [],
    });
    expect(headerLabels(screen)).toEqual(['Category']);
    expect(screen.queryByText('Mood')).toBeNull();
  });

  it('cycles a statistic column through ascending, descending and original order', async () => {
    const { screen } = await renderPanel();
    expect(rowOrder(screen)).toEqual(['Mood', 'Sleep', 'Empty']);

    await pressHeader(screen, 'Mean');
    expect(screen.getByLabelText(/^Mean, ascending/)).toBeTruthy();
    expect(rowOrder(screen)).toEqual(['Mood', 'Sleep', 'Empty']);

    await pressHeader(screen, 'Mean');
    expect(screen.getByLabelText(/^Mean, descending/)).toBeTruthy();
    // Categories without values stay last in both directions.
    expect(rowOrder(screen)).toEqual(['Sleep', 'Mood', 'Empty']);

    await pressHeader(screen, 'Mean');
    expect(screen.getByLabelText(/^Mean, unsorted/)).toBeTruthy();
    expect(rowOrder(screen)).toEqual(['Mood', 'Sleep', 'Empty']);
  });

  it('sorts by category name and resets the previous column', async () => {
    const { screen } = await renderPanel();
    await pressHeader(screen, 'Mean');
    await pressHeader(screen, 'Mean');
    expect(rowOrder(screen)).toEqual(['Sleep', 'Mood', 'Empty']);

    await pressHeader(screen, 'Category');
    expect(screen.getByLabelText(/^Mean, unsorted/)).toBeTruthy();
    expect(rowOrder(screen)).toEqual(['Empty', 'Mood', 'Sleep']);
    await pressHeader(screen, 'Category');
    expect(rowOrder(screen)).toEqual(['Sleep', 'Mood', 'Empty']);
  });

  it('falls back to the original order when the sorted column is disabled', async () => {
    const { screen, rerender } = await renderPanel();
    await pressHeader(screen, 'Mean');
    await pressHeader(screen, 'Mean');
    expect(rowOrder(screen)).toEqual(['Sleep', 'Mood', 'Empty']);

    await rerender({ settings: { ...allColumns, 'summary.mean.all': false } });
    expect(screen.queryByLabelText(/^Mean, /)).toBeNull();
    expect(rowOrder(screen)).toEqual(['Mood', 'Sleep', 'Empty']);
  });

  it('only counts entries inside the recent window for recent columns', async () => {
    const { screen } = await renderPanel({ recentDays: 2 });
    // Only the day-1 Mood entry is within the last 2 days.
    expect(rowValues(screen, 'Mood').slice(0, 2)).toEqual(['4.00', '6.00']);
    expect(screen.getByLabelText(/^Mean 2d, /)).toBeTruthy();
  });
});
