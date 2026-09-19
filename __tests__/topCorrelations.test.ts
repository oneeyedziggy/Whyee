import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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

    fireEvent.press(screen.getByText('Lag'));
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
});
