import type * as ReactNativeWorklets from 'react-native-worklets';
import {
  computePreparedCorrelationRange,
  getPreparedCorrelationCellCount,
  mergePreparedCorrelationCells,
  prepareCorrelation,
  type PreparedCorrelation,
} from '../lib/correlationKernel';
import { CorrelationCancelledError } from '../lib/correlationEngine';
import { createCorrelationTask } from './correlationTask';
import type {
  CorrelationBatchListener,
  CorrelationCellResult,
  CorrelationRequest,
  CorrelationRow,
  CorrelationTask,
} from '../types/correlation';

declare global {
  var __correlationPrepared:
    | { generation: number; prepared: PreparedCorrelation }
    | undefined;
}

const maximumWorkerCount = 3;
const chunkSize = 128;
let workletsModule: typeof ReactNativeWorklets | null | undefined;
let workerPool: ReactNativeWorklets.WorkletRuntime[] | null = null;
let nextGeneration = 1;

const getWorklets = (): typeof ReactNativeWorklets | null => {
  if (workletsModule !== undefined) return workletsModule;
  try {
    workletsModule = require(
      'react-native-worklets',
    ) as typeof ReactNativeWorklets;
  } catch {
    workletsModule = null;
  }
  return workletsModule ?? null;
};

const getWorkerPool = (
  worklets: typeof ReactNativeWorklets,
): ReactNativeWorklets.WorkletRuntime[] => {
  if (!workerPool) {
    workerPool = Array.from({ length: maximumWorkerCount }, (_, index) =>
      worklets.createWorkletRuntime({ name: `correlation-${index + 1}` }),
    );
  }
  return workerPool;
};

const installPreparedCorrelation = (
  generation: number,
  prepared: PreparedCorrelation,
): void => {
  'worklet';
  globalThis.__correlationPrepared = { generation, prepared };
};

const computeInstalledRange = (
  generation: number,
  start: number,
  end: number,
): CorrelationCellResult[] | null => {
  'worklet';
  const installed = globalThis.__correlationPrepared;
  if (!installed || installed.generation !== generation) return null;
  return computePreparedCorrelationRange(installed.prepared, start, end);
};

export const runCorrelation = (
  request: CorrelationRequest,
  onBatch?: CorrelationBatchListener,
): CorrelationTask => {
  if (
    request.records.length === 0 ||
    request.categories.length < 2 ||
    request.offsets.length === 0
  ) {
    return { promise: Promise.resolve([]), cancel: () => undefined };
  }
  const worklets = getWorklets();
  if (!worklets) return createCorrelationTask(request, onBatch);

  const generation = nextGeneration;
  nextGeneration += 1;
  let cancelled = false;
  let settled = false;
  let rejectTask: ((reason?: unknown) => void) | null = null;

  const execute = async (): Promise<CorrelationRow[]> => {
    const pool = getWorkerPool(worklets);
    const prepared = await worklets.runOnRuntimeAsync(
      pool[0],
      prepareCorrelation,
      request,
    );
    if (cancelled) throw new CorrelationCancelledError();

    const total = getPreparedCorrelationCellCount(prepared);
    const activeWorkers = pool.slice(
      0,
      Math.max(1, Math.min(pool.length, Math.ceil(total / chunkSize))),
    );
    await Promise.all(
      activeWorkers.map((runtime) =>
        worklets.runOnRuntimeAsync(
          runtime,
          installPreparedCorrelation,
          generation,
          prepared,
        ),
      ),
    );
    if (cancelled) throw new CorrelationCancelledError();

    let nextStart = 0;
    let completed = 0;
    const cells: CorrelationCellResult[] = [];
    const runWorker = async (
      runtime: ReactNativeWorklets.WorkletRuntime,
    ): Promise<void> => {
      while (!cancelled) {
        const start = nextStart;
        if (start >= total) return;
        nextStart += chunkSize;
        const batchCells = await worklets.runOnRuntimeAsync(
          runtime,
          computeInstalledRange,
          generation,
          start,
          start + chunkSize,
        );
        if (cancelled) return;
        if (!batchCells)
          throw new Error('Correlation worker generation was replaced');
        cells.push(...batchCells);
        completed += batchCells.length;
        onBatch?.({ cells: batchCells, completed, total });
      }
    };

    await Promise.all(activeWorkers.map(runWorker));
    if (cancelled) throw new CorrelationCancelledError();
    return mergePreparedCorrelationCells(prepared, cells);
  };

  const promise = new Promise<CorrelationRow[]>((resolve, reject) => {
    rejectTask = reject;
    execute().then(
      (rows) => {
        if (settled) return;
        settled = true;
        resolve(rows);
      },
      (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      },
    );
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      cancelled = true;
      rejectTask?.(new CorrelationCancelledError());
    },
  };
};
