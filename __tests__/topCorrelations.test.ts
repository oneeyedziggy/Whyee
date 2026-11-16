import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { TopCorrelationsPanel } from '../src/components/TopCorrelationsPanel';
import type { CorrelationRow } from '../src/types/correlation';

const rows: CorrelationRow[] = [
  {
    label: 'A x B',
    leftCategoryId: 'a',
    rightCategoryId: 'b',
    cells: [
      { offset: 0, value: 0.9 },
      { offset: 2, value: -0.85 },
      { offset: 5, value: 0.2 },
    ],
  },
  {
    label: 'B x A',
    leftCategoryId: 'b',
    rightCategoryId: 'a',
    cells: [{ offset: 2, value: 0.75 }],
  },
  {
    label: 'C x D',
    leftCategoryId: 'c',
    rightCategoryId: 'd',
    cells: [{ offset: 1, value: 0.8 }],
  },
];

const flattenText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (value && typeof value === 'object' && 'props' in value) {
    return flattenText(
      (value as { props?: { children?: unknown } }).props?.children,
    );
  }
  return String(value ?? '');
};
describe('TopCorrelationsPanel', () => {
  it('renders sortable table columns for top matches', async () => {
    const screen = await render(
      React.createElement(TopCorrelationsPanel, {
        rows,
        threshold: 0.7,
        onThresholdChange: jest.fn(),
      }),
    );

    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.getByText('Lag')).toBeTruthy();
    expect(screen.getByText('Value')).toBeTruthy();
  });

  it('sorts matches by value descending by default', async () => {
    const screen = await render(
      React.createElement(TopCorrelationsPanel, {
        rows,
        threshold: 0.7,
        onThresholdChange: jest.fn(),
      }),
    );

    const rowsInOrder = screen.getAllByTestId('top-correlation-row');
    const firstRowText = flattenText(rowsInOrder[0].props.children);
    expect(firstRowText).toContain('A');
    expect(firstRowText).toContain('B');
    expect(firstRowText).toContain('0');
    expect(firstRowText).toContain('0.90');
  });

  it('toggles the sort direction when a sortable header is pressed', async () => {
    const screen = await render(
      React.createElement(TopCorrelationsPanel, {
        rows,
        threshold: 0.7,
        onThresholdChange: jest.fn(),
      }),
    );

    await fireEvent.press(screen.getByText('Lag'));
    const firstRowText = flattenText(
      screen.getAllByTestId('top-correlation-row')[0].props.children,
    );
    expect(firstRowText).toContain('0');
  });

  it('shows an empty state when nothing meets the threshold', async () => {
    const screen = await render(
      React.createElement(TopCorrelationsPanel, {
        rows,
        threshold: 0.99,
        onThresholdChange: jest.fn(),
      }),
    );

    expect(
      screen.getByText('No pairs currently meet the threshold.'),
    ).toBeTruthy();
  });

  it('prompts to enable the matrix when there are no rows at all', async () => {
    const screen = await render(
      React.createElement(TopCorrelationsPanel, {
        rows: [],
        threshold: 0.7,
        onThresholdChange: jest.fn(),
      }),
    );

    expect(
      screen.getByText(
        'Enable the correlation matrix to see top correlations.',
      ),
    ).toBeTruthy();
  });

  const renderPanel = (panelRows: CorrelationRow[], threshold = 0.7) =>
    render(
      React.createElement(TopCorrelationsPanel, {
        rows: panelRows,
        threshold,
        onThresholdChange: jest.fn(),
      }),
    );
  type Screen = Awaited<ReturnType<typeof renderPanel>>;
  const table = (screen: Screen) =>
    screen
      .getAllByTestId('top-correlation-row')
      .map((row) =>
        (row.children as Array<{ props: { children?: unknown } }>).map(
          (cell) => flattenText(cell.props.children),
        ),
      );
  const press = (screen: Screen, column: string) =>
    fireEvent.press(screen.getByText(column));

  it('keeps category names containing the letter x intact', async () => {
    const screen = await renderPanel([
      {
        label: 'Exercise x Relax',
        leftCategoryId: 'exercise',
        rightCategoryId: 'relax',
        cells: [{ offset: 1, value: 0.8 }],
      },
    ]);
    expect(table(screen)).toEqual([['Exercise', 'Relax', '1', '0.80']]);
  });

  it('falls back to the whole label when it is not a pair', async () => {
    const screen = await renderPanel([
      {
        label: 'Solo',
        leftCategoryId: 'solo',
        rightCategoryId: 'solo',
        cells: [{ offset: 0, value: 0.9 }],
      },
      {
        label: ' x Right',
        leftCategoryId: 'blank',
        rightCategoryId: 'right',
        cells: [{ offset: 0, value: 0.8 }],
      },
    ]);
    expect(table(screen)).toEqual([
      ['Solo', 'Solo', '0', '0.90'],
      [' x Right', 'Right', '0', '0.80'],
    ]);
  });

  it('cycles text columns asc, desc, default and numeric columns desc, asc, default', async () => {
    const screen = await renderPanel(rows);
    const byValue = [
      ['A', 'B', '0', '0.90'],
      ['C', 'D', '1', '0.80'],
      ['B', 'A', '2', '0.75'],
      ['A', 'B', '2', '-0.85'],
    ];
    expect(table(screen)).toEqual(byValue);
    expect(screen.getByLabelText(/^Value, descending/)).toBeTruthy();

    await press(screen, 'First');
    expect(table(screen).map((row) => row[0])).toEqual(['A', 'A', 'B', 'C']);
    expect(screen.getByLabelText(/^First, ascending/)).toBeTruthy();
    await press(screen, 'First');
    expect(table(screen).map((row) => row[0])).toEqual(['C', 'B', 'A', 'A']);
    await press(screen, 'First');
    expect(table(screen)).toEqual(byValue);
    expect(screen.getByLabelText(/^First, unsorted/)).toBeTruthy();

    await press(screen, 'Second');
    expect(table(screen).map((row) => row[1])).toEqual(['A', 'B', 'B', 'D']);

    await press(screen, 'Lag');
    expect(table(screen).map((row) => row[2])).toEqual(['2', '2', '1', '0']);
    await press(screen, 'Lag');
    expect(table(screen).map((row) => row[2])).toEqual(['0', '1', '2', '2']);

    await press(screen, 'Value');
    expect(table(screen).map((row) => row[3])).toEqual([
      '0.90',
      '0.80',
      '0.75',
      '-0.85',
    ]);
    await press(screen, 'Value');
    expect(table(screen).map((row) => row[3])).toEqual([
      '0.90',
      '0.80',
      '0.75',
      '-0.85',
    ]);
    expect(screen.getByLabelText(/^Value, unsorted/)).toBeTruthy();
    await press(screen, 'Value');
    expect(table(screen).map((row) => row[3])).toEqual([
      '-0.85',
      '0.75',
      '0.80',
      '0.90',
    ]);
  });

  it('colours a lone value at the midpoint and non-finite values neutrally', async () => {
    const colourOf = (screen: Screen) => {
      const cell = screen.getAllByTestId('top-correlation-row')[0].children[3];
      if (typeof cell === 'string') throw new Error('Expected a value cell');
      return StyleSheet.flatten(cell.props.style as StyleProp<ViewStyle>)
        ?.backgroundColor;
    };
    const lone = await renderPanel([
      {
        label: 'A x B',
        leftCategoryId: 'a',
        rightCategoryId: 'b',
        cells: [{ offset: 0, value: 0.8 }, { offset: 1, value: null }],
      },
    ]);
    expect(colourOf(lone)).toBe('hsl(60, 65%, 87%)');
    await lone.unmount();

    const infinite = await renderPanel([
      {
        label: 'A x B',
        leftCategoryId: 'a',
        rightCategoryId: 'b',
        cells: [{ offset: 0, value: Number.POSITIVE_INFINITY }],
      },
    ]);
    expect(colourOf(infinite)).toBe('#f8fafc');
  });

  it('reveals results in batches of fifty', async () => {
    const many: CorrelationRow[] = [
      {
        label: 'A x B',
        leftCategoryId: 'a',
        rightCategoryId: 'b',
        cells: Array.from({ length: 120 }, (_, offset) => ({
          offset,
          value: 0.9,
        })),
      },
    ];
    const screen = await renderPanel(many);
    expect(screen.getAllByTestId('top-correlation-row')).toHaveLength(50);

    await fireEvent.press(screen.getByText('Show more (70 remaining)'));
    expect(screen.getAllByTestId('top-correlation-row')).toHaveLength(100);
    await fireEvent.press(screen.getByText('Show more (20 remaining)'));
    expect(screen.getAllByTestId('top-correlation-row')).toHaveLength(120);
    expect(screen.queryByText(/Show more/)).toBeNull();
  });
});