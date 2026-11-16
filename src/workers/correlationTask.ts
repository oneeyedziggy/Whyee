import {
  computeRowsProgressively,
  CorrelationCancelledError,
} from '../lib/correlationEngine';
import { canCorrelate } from '../lib/correlationKernel';
import type {
  CorrelationCancellation,
  CorrelationRequest,
  CorrelationRow,
  CorrelationTask,
  CorrelationBatchListener,
  CorrelationCellResult,
} from '../types/correlation';

const progressBatchSize = 64;

export const createCorrelationTask = (
  request: CorrelationRequest,
  onBatch?: CorrelationBatchListener,
): CorrelationTask => {
  const cancellation: CorrelationCancellation = { cancelled: false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let rejectTask!: (reason?: unknown) => void;
  let pairCount = 0;
  for (let leftIndex = 0; leftIndex < request.categories.length; leftIndex += 1)
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < request.categories.length;
      rightIndex += 1
    )
      if (canCorrelate(request.categories[leftIndex], request.categories[rightIndex]))
        pairCount += 1;
  const total = request.offsets.length * pairCount * 2;
  let completed = 0;
  let pendingCells: CorrelationCellResult[] = [];
  const flushBatch = () => {
    if (!pendingCells.length || !onBatch) return;
    const cells = pendingCells;
    pendingCells = [];
    onBatch({ cells, completed, total });
  };

  const promise = new Promise<CorrelationRow[]>((resolve, reject) => {
    rejectTask = reject;
    timer = setTimeout(() => {
      timer = null;
      computeRowsProgressively(
        request,
        (cell) => {
          completed += 1;
          pendingCells.push(cell);
          if (pendingCells.length >= progressBatchSize) flushBatch();
        },
        cancellation,
      ).then(
        (rows) => {
          flushBatch();
          settled = true;
          resolve(rows);
        },
        (error) => {
          settled = true;
          reject(error);
        },
      );
    }, 0);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      cancellation.cancelled = true;
      if (timer) clearTimeout(timer);
      rejectTask(new CorrelationCancelledError());
    },
  };
};
