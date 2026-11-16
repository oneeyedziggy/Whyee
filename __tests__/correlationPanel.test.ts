import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CorrelationPanel } from '../src/components/CorrelationPanel';
import type { CorrelationRow } from '../src/types/correlation';

jest.mock('../src/components/InfoLink', () => ({ InfoLink: () => null }));

const row = (
  label: string,
  cells: CorrelationRow['cells'],
  ids = label.split(' x '),
): CorrelationRow => ({
  label,
  leftCategoryId: ids[0],
  rightCategoryId: ids[1],
  cells,
});

const rows: CorrelationRow[] = [
  row('Gamma x Delta', [
    { offset: 0, value: -0.3 },
    { offset: 1, value: 0.2 },
  ]),
  row('Alpha x Beta', [
    { offset: 0, value: 0.5 },
    { offset: 1, value: null },
    { offset: 2, value: 0.9 },
  ]),
  row('Beta x Gamma', [{ offset: 0, value: null }]),
];

type Props = React.ComponentProps<typeof CorrelationPanel>;

const renderPanel = async (props: Partial<Props> = {}) => {
  const onOffsetChange = jest.fn();
  const element = (overrides: Partial<Props> = {}) =>
    React.createElement(CorrelationPanel, {
      rows,
      loading: false,
      offsets: [0, 1, 2],
      offset: 3,
      onOffsetChange,
      ...props,
      ...overrides,
    });
  const screen = await render(element());
  return {
    screen,
    onOffsetChange,
    rerender: (overrides: Partial<Props>) => screen.rerender(element(overrides)),
  };
};

type Screen = Awaited<ReturnType<typeof renderPanel>>['screen'];

const pairOrder = (screen: Screen) =>
  screen
    .getAllByHintText('Shows the full pair name')
    .map((node) => node.props.accessibilityLabel as string);

const pressHeader = (screen: Screen, label: string) =>
  fireEvent.press(screen.getByLabelText(new RegExp(`^${label}, `)));

const cellBackground = (screen: Screen, label: string) =>
  StyleSheet.flatten(screen.getByLabelText(label).props.style).backgroundColor;

describe('CorrelationPanel', () => {
  it('renders each pair with formatted values and gaps for missing cells', async () => {
    const { screen } = await renderPanel();
    expect(pairOrder(screen)).toEqual([
      'Gamma x Delta',
      'Alpha x Beta',
      'Beta x Gamma',
    ]);
    expect(
      screen.getByLabelText('Alpha x Beta, 2 forward days, correlation 0.90'),
    ).toHaveTextContent('0.90');
    expect(
      screen.getByLabelText(
        'Alpha x Beta, 1 forward days, correlation not available',
      ),
    ).toHaveTextContent('--');
    expect(
      screen.getByLabelText(
        'Gamma x Delta, 2 forward days, correlation not available',
      ),
    ).toHaveTextContent('--');
  });

  it('colors cells from lowest (red) to highest (green) value', async () => {
    const { screen } = await renderPanel();
    expect(
      cellBackground(screen, 'Gamma x Delta, 0 forward days, correlation -0.30'),
    ).toBe('hsl(0, 65%, 87%)');
    expect(
      cellBackground(screen, 'Alpha x Beta, 2 forward days, correlation 0.90'),
    ).toBe('hsl(120, 65%, 87%)');
    expect(
      cellBackground(
        screen,
        'Beta x Gamma, 0 forward days, correlation not available',
      ),
    ).toBe('#f8fafc');
  });

  it('uses a neutral color when every value is identical', async () => {
    const { screen } = await renderPanel({
      rows: [row('A x B', [{ offset: 0, value: 0.4 }])],
      offsets: [0],
    });
    expect(
      cellBackground(screen, 'A x B, 0 forward days, correlation 0.40'),
    ).toBe('hsl(60, 65%, 87%)');
  });

  it('renders rows whose cells are all unavailable', async () => {
    const { screen } = await renderPanel({
      rows: [row('A x B', [{ offset: 0, value: null }])],
      offsets: [0],
    });
    expect(
      cellBackground(screen, 'A x B, 0 forward days, correlation not available'),
    ).toBe('#f8fafc');
  });

  it('cycles a lag column through ascending, descending and original order, keeping gaps last', async () => {
    const { screen } = await renderPanel();
    await pressHeader(screen, '0');
    expect(screen.getByLabelText(/^0, ascending/)).toBeTruthy();
    expect(pairOrder(screen)).toEqual([
      'Gamma x Delta',
      'Alpha x Beta',
      'Beta x Gamma',
    ]);

    await pressHeader(screen, '0');
    expect(screen.getByLabelText(/^0, descending/)).toBeTruthy();
    expect(pairOrder(screen)).toEqual([
      'Alpha x Beta',
      'Gamma x Delta',
      'Beta x Gamma',
    ]);

    await pressHeader(screen, '0');
    expect(screen.getByLabelText(/^0, unsorted/)).toBeTruthy();
    expect(pairOrder(screen)).toEqual([
      'Gamma x Delta',
      'Alpha x Beta',
      'Beta x Gamma',
    ]);
  });

  it('keeps rows with no value in the sorted column at the end, regardless of direction', async () => {
    const { screen } = await renderPanel();
    await pressHeader(screen, '1');
    expect(pairOrder(screen)).toEqual([
      'Gamma x Delta',
      'Alpha x Beta',
      'Beta x Gamma',
    ]);
    await pressHeader(screen, '1');
    expect(pairOrder(screen)[0]).toBe('Gamma x Delta');

    // Column 2 starts with a gap, so a valued row must move ahead of it.
    await pressHeader(screen, '2');
    expect(pairOrder(screen)).toEqual([
      'Alpha x Beta',
      'Gamma x Delta',
      'Beta x Gamma',
    ]);
    await pressHeader(screen, '2');
    expect(pairOrder(screen)).toEqual([
      'Alpha x Beta',
      'Gamma x Delta',
      'Beta x Gamma',
    ]);
  });

  it('sorts pairs alphabetically and switches columns back to ascending', async () => {
    const { screen } = await renderPanel();
    await pressHeader(screen, '0');
    await pressHeader(screen, '0');
    await pressHeader(screen, 'Pair');
    expect(screen.getByLabelText(/^Pair, ascending/)).toBeTruthy();
    expect(screen.getByLabelText(/^0, unsorted/)).toBeTruthy();
    expect(pairOrder(screen)).toEqual([
      'Alpha x Beta',
      'Beta x Gamma',
      'Gamma x Delta',
    ]);
    await pressHeader(screen, 'Pair');
    expect(pairOrder(screen)).toEqual([
      'Gamma x Delta',
      'Beta x Gamma',
      'Alpha x Beta',
    ]);
  });

  it('widens only the last header cell', async () => {
    const { screen } = await renderPanel();
    const width = (label: string) =>
      StyleSheet.flatten(
        screen.getByLabelText(new RegExp(`^${label}, `)).props.style,
      ).minWidth;
    expect(width('0')).toBe(52);
    expect(width('2')).toBe(66);
  });

  it('expands and collapses a truncated pair name when tapped', async () => {
    const { screen } = await renderPanel();
    const pair = screen.getByLabelText('Alpha x Beta');
    expect(pair.props.accessibilityState).toEqual({ expanded: false });
    expect(screen.getByText('Alpha x Beta').props.numberOfLines).toBe(1);

    await fireEvent.press(pair);
    expect(
      screen.getByLabelText('Alpha x Beta').props.accessibilityState,
    ).toEqual({ expanded: true });
    expect(screen.getByText('Alpha x Beta').props.numberOfLines).toBe(0);
    expect(screen.getByLabelText('Alpha x Beta').props.title).toBeUndefined();

    await fireEvent.press(screen.getByLabelText('Alpha x Beta'));
    expect(screen.getByText('Alpha x Beta').props.numberOfLines).toBe(1);
  });

  it('reveals rows in batches', async () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      row(`P${String(index).padStart(2, '0')} x Q`, [
        { offset: 0, value: index / 30 },
      ]),
    );
    const { screen } = await renderPanel({ rows: many, offsets: [0] });
    expect(pairOrder(screen)).toHaveLength(24);
    await fireEvent.press(screen.getByText(/Show more pairs \(6\s+remaining\)/));
    expect(pairOrder(screen)).toHaveLength(30);
    expect(screen.queryByText(/Show more pairs/)).toBeNull();
  });

  it('reports numeric forward-day edits and ignores non-numeric input', async () => {
    const { screen, onOffsetChange } = await renderPanel();
    const input = screen.getByLabelText('Correlation forward days');
    expect(input.props.value).toBe('3');
    await fireEvent.changeText(input, '12');
    expect(onOffsetChange).toHaveBeenCalledWith(12);
    await fireEvent.changeText(input, 'abc');
    expect(onOffsetChange).toHaveBeenCalledTimes(1);
  });

  it('shows a loading message only until rows arrive', async () => {
    const { screen, rerender } = await renderPanel({ rows: [], loading: true });
    expect(screen.getByText('Updating correlations...')).toBeTruthy();
    expect(screen.queryByText('Add data to view correlation results.')).toBeNull();

    await rerender({ rows, loading: true });
    expect(screen.queryByText('Updating correlations...')).toBeNull();
    expect(pairOrder(screen)).toHaveLength(3);
  });

  it('prompts for data when there are no rows and nothing is loading', async () => {
    const { screen } = await renderPanel({ rows: [] });
    expect(screen.getByText('Add data to view correlation results.')).toBeTruthy();
    expect(screen.queryByText('Updating correlations...')).toBeNull();
    expect(screen.getByLabelText('Correlation forward days')).toBeTruthy();
  });
});
