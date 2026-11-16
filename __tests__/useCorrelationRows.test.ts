import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  correlationCachePrefix,
  useCorrelationRows,
} from '../src/hooks/useCorrelationRows';
import { createCorrelationInputHash } from '../src/lib/hash';
import type { StatisticsSettings } from '../src/lib/statistics';
import { createVirtualCorrelationInput } from '../src/lib/virtualSeries';
import { runCorrelation } from '../src/workers/correlationRunner';
import type { CategoryDefinition } from '../src/types/category';
import type {
  CorrelationBatchListener,
  CorrelationCellResult,
  CorrelationRow,
} from '../src/types/correlation';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/workers/correlationRunner', () => ({ runCorrelation: jest.fn() }));
jest.mock('../src/lib/hash', () => ({ createCorrelationInputHash: jest.fn() }));
jest.mock('../src/lib/virtualSeries', () => ({ createVirtualCorrelationInput: jest.fn() }));

const run = jest.mocked(runCorrelation);
const hash = jest.mocked(createCorrelationInputHash);
const virtualInput = jest.mocked(createVirtualCorrelationInput);
const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);

type Task = {
  onBatch: CorrelationBatchListener;
  resolve: (rows: CorrelationRow[]) => void;
  reject: (error: unknown) => void;
  cancel: jest.Mock;
};
let tasks: Task[] = [];

const category = (id: string) =>
  ({ id, name: id.toUpperCase(), enabled: true }) as unknown as CategoryDefinition;
const [alpha, beta, gamma] = ['alpha', 'beta', 'gamma'].map(category);
const row = (left: string, right: string, offset = 0): CorrelationRow => ({
  label: `${left} x ${right}`,
  leftCategoryId: left,
  rightCategoryId: right,
  cells: [{ offset, value: 0.5 }],
});
const cell = (
  left: string,
  right: string,
  offset: number,
  value: number | null = offset / 10,
): CorrelationCellResult => ({ leftCategoryId: left, rightCategoryId: right, offset, value });

const correlationOn: StatisticsSettings = {
  'correlation.section': true,
  'correlation.top-matches': true,
  'calendar.section': false,
};

type Input = Parameters<typeof useCorrelationRows>[0];
const baseInput = (overrides: Partial<Input> = {}): Input => ({
  activeWorkspaceId: 'user',
  correlationCategories: [alpha, beta, gamma],
  groups: [],
  hydrated: true,
  offsets: [0, 1],
  records: {},
  statisticsSettings: correlationOn,
  statsVisible: true,
  ...overrides,
});
const cacheKey = (workspace = 'user') => `${correlationCachePrefix}${workspace}`;
const renderRows = (input: Input) =>
  renderHook((props: Input) => useCorrelationRows(props), { initialProps: input });
const settle = () => act(async () => undefined);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  tasks = [];
  hash.mockReturnValue('hash-1');
  virtualInput.mockReturnValue({
    categories: [
      { id: 'alpha:avg', name: 'Alpha' },
      { id: 'beta:avg', name: 'Beta' },
      { id: 'gamma:avg', name: 'Gamma' },
    ],
    records: [],
    offsets: [0, 1],
  });
  run.mockImplementation((_request, onBatch) => {
    let resolve!: Task['resolve'];
    let reject!: Task['reject'];
    const promise = new Promise<CorrelationRow[]>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const task = { onBatch: onBatch!, resolve, reject, cancel: jest.fn() };
    tasks.push(task);
    return { promise, cancel: task.cancel };
  });
});

afterEach(() => jest.useRealTimers());

describe('correlation rows', () => {
  it('stays idle until hydrated and visible', async () => {
    const { result, rerender } = await renderRows(baseInput({ hydrated: false }));
    await settle();
    expect(result.current).toEqual({ orderedRows: [], loading: false });

    await rerender(baseInput({ statsVisible: false }));
    await settle();
    expect(result.current.loading).toBe(false);
    expect(getItem).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('clears rows when both correlation statistics are disabled', async () => {
    const input = baseInput();
    await AsyncStorage.setItem(
      cacheKey(),
      JSON.stringify({ inputHash: 'hash-1', rows: [row('alpha:avg', 'beta:avg')] }),
    );
    const { result, rerender } = await renderRows(input);
    await waitFor(() => expect(result.current.orderedRows).toHaveLength(1));

    await rerender({
      ...input,
      statisticsSettings: {
        ...correlationOn,
        'correlation.section': false,
        'correlation.top-matches': false,
      },
    });

    expect(result.current.orderedRows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('runs when only the top-matches statistic is enabled', async () => {
    await renderRows(
      baseInput({
        statisticsSettings: { ...correlationOn, 'correlation.section': false },
      }),
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it('serves matching cached rows without recomputing, in category order', async () => {
    const cached = [
      row('gamma:avg', 'alpha:avg'),
      row('unknown:avg', 'alpha:avg'),
      row('beta:avg', 'alpha:avg'),
      row('alpha:avg', 'beta:avg'),
      row('beta:avg', 'gamma:avg'),
    ];
    await AsyncStorage.setItem(
      cacheKey(),
      JSON.stringify({ inputHash: 'hash-1', rows: cached, updatedAt: 'x' }),
    );
    const input = baseInput({
      statisticsSettings: { ...correlationOn, 'calendar.section': true },
    });
    const { result } = await renderRows(input);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hash).toHaveBeenCalledWith(input.correlationCategories, {}, [0, 1], true, []);
    expect(run).not.toHaveBeenCalled();
    expect(result.current.orderedRows.map((entry) => entry.label)).toEqual([
      'alpha:avg x beta:avg',
      'beta:avg x alpha:avg',
      'gamma:avg x alpha:avg',
      'unknown:avg x alpha:avg',
      'beta:avg x gamma:avg',
    ]);
  });

  it('streams batches into ordered partial rows, then caches the final result', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-16T12:00:00Z') });
    await AsyncStorage.setItem(
      cacheKey(),
      JSON.stringify({ inputHash: 'stale', rows: [row('alpha:avg', 'beta:avg')] }),
    );
    const input = baseInput();
    const { result } = await renderRows(input);
    await settle();

    expect(virtualInput).toHaveBeenCalledWith(
      input.correlationCategories,
      input.records,
      input.offsets,
      false,
      input.groups,
    );
    expect(tasks).toHaveLength(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      tasks[0].onBatch({
        cells: [
          cell('beta:avg', 'gamma:avg', 1),
          cell('gamma:avg', 'alpha:avg', 0),
          cell('beta:avg', 'alpha:avg', 0),
          cell('alpha:avg', 'beta:avg', 1),
          cell('alpha:avg', 'missing', 0),
        ],
        completed: 5,
        total: 12,
      });
      tasks[0].onBatch({
        cells: [cell('alpha:avg', 'beta:avg', 0), cell('beta:avg', 'gamma:avg', 0)],
        completed: 7,
        total: 12,
      });
    });
    expect(result.current.orderedRows).toEqual([]);

    await act(async () => jest.advanceTimersByTime(120));

    expect(result.current.orderedRows).toEqual([
      {
        label: 'Alpha x Beta',
        leftCategoryId: 'alpha:avg',
        rightCategoryId: 'beta:avg',
        cells: [
          { offset: 0, value: 0 },
          { offset: 1, value: 0.1 },
        ],
      },
      {
        label: 'Beta x Alpha',
        leftCategoryId: 'beta:avg',
        rightCategoryId: 'alpha:avg',
        cells: [{ offset: 0, value: 0 }],
      },
      {
        label: 'Gamma x Alpha',
        leftCategoryId: 'gamma:avg',
        rightCategoryId: 'alpha:avg',
        cells: [{ offset: 0, value: 0 }],
      },
      {
        label: 'Beta x Gamma',
        leftCategoryId: 'beta:avg',
        rightCategoryId: 'gamma:avg',
        cells: [
          { offset: 0, value: 0 },
          { offset: 1, value: 0.1 },
        ],
      },
    ]);
    expect(result.current.loading).toBe(true);

    // A second publication is scheduled for later batches, then superseded by the final rows.
    await act(async () =>
      tasks[0].onBatch({ cells: [cell('alpha:avg', 'gamma:avg', 0)], completed: 8, total: 12 }),
    );
    const finalRows = [row('alpha:avg', 'gamma:avg')];
    await act(async () => tasks[0].resolve(finalRows));
    await act(async () => jest.advanceTimersByTime(500));

    expect(result.current.orderedRows).toEqual(finalRows);
    expect(result.current.loading).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(cacheKey()))!)).toEqual({
      inputHash: 'hash-1',
      rows: finalRows,
      updatedAt: '2026-11-16T12:00:00.120Z',
    });
  });

  it('caches results that finish before any batch publication', async () => {
    const { result } = await renderRows(baseInput({ activeWorkspaceId: 'work' }));
    await settle();

    const finalRows = [row('alpha:avg', 'beta:avg')];
    await act(async () => tasks[0].resolve(finalRows));

    expect(result.current.orderedRows).toEqual(finalRows);
    expect(setItem).toHaveBeenCalledWith(cacheKey('work'), expect.stringContaining('"hash-1"'));
  });

  it('keeps computed rows when the cache write fails', async () => {
    setItem.mockRejectedValueOnce(new Error('quota'));
    const { result } = await renderRows(baseInput());
    await settle();

    const finalRows = [row('alpha:avg', 'beta:avg')];
    await act(async () => tasks[0].resolve(finalRows));

    expect(setItem).toHaveBeenCalled();
    expect(result.current.orderedRows).toEqual(finalRows);
    expect(result.current.loading).toBe(false);
  });

  it('clears rows when the correlation fails', async () => {
    const { result } = await renderRows(baseInput());
    await settle();

    await act(async () => tasks[0].reject(new Error('worker crashed')));

    expect(result.current.orderedRows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('treats an unreadable or corrupt cache as a miss and recomputes', async () => {
    getItem.mockRejectedValueOnce(new Error('disk'));
    const first = await renderRows(baseInput());
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    const rows = [row('alpha:avg', 'beta:avg')];
    await act(async () => tasks[0].resolve(rows));
    expect(first.result.current.orderedRows).toEqual(rows);

    getItem.mockResolvedValueOnce('{corrupt');
    const second = await renderRows(baseInput());
    await settle();
    expect(run).toHaveBeenCalledTimes(2);
    await act(async () => tasks[1].resolve(rows));
    expect(second.result.current.orderedRows).toEqual(rows);
    expect(second.result.current.loading).toBe(false);
  });

  it('cancels the old run and ignores its late results after inputs change', async () => {
    jest.useFakeTimers();
    const input = baseInput();
    const { result, rerender } = await renderRows(input);
    await settle();
    await act(async () =>
      tasks[0].onBatch({ cells: [cell('alpha:avg', 'beta:avg', 0)], completed: 1, total: 4 }),
    );

    hash.mockReturnValue('hash-2');
    await rerender({ ...input, offsets: [0, 1, 2] });
    await settle();

    expect(tasks[0].cancel).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveLength(2);
    await act(async () => {
      tasks[0].onBatch({ cells: [cell('beta:avg', 'gamma:avg', 0)], completed: 2, total: 4 });
      jest.advanceTimersByTime(500);
      tasks[0].resolve([row('stale:avg', 'alpha:avg')]);
    });
    expect(result.current.orderedRows).toEqual([]);
    expect(result.current.loading).toBe(true);

    const fresh = [row('alpha:avg', 'beta:avg', 2)];
    await act(async () => tasks[1].resolve(fresh));
    expect(result.current.orderedRows).toEqual(fresh);
    expect(JSON.parse((await AsyncStorage.getItem(cacheKey()))!).inputHash).toBe('hash-2');
  });

  it('ignores a cache read that finishes after the inputs changed', async () => {
    let resolveRead: (value: string | null) => void = () => undefined;
    getItem.mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)));
    const input = baseInput();
    const { result, rerender } = await renderRows(input);

    await rerender({ ...input, statsVisible: false });
    expect(result.current.loading).toBe(false);
    await act(async () =>
      resolveRead(JSON.stringify({ inputHash: 'hash-1', rows: [row('alpha:avg', 'beta:avg')] })),
    );

    expect(run).not.toHaveBeenCalled();
    expect(result.current.orderedRows).toEqual([]);
  });

  it('ignores failures and results from a run abandoned by unmount', async () => {
    const { result, unmount } = await renderRows(baseInput());
    await settle();
    await unmount();

    expect(tasks[0].cancel).toHaveBeenCalledTimes(1);
    await act(async () => tasks[0].reject(new Error('cancelled')));
    expect(result.current.loading).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
  });
});
