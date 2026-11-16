import { createCorrelationTask } from './correlationTask';
import {
  getPreparedCorrelationCellCount,
  mergePreparedCorrelationCells,
  type PreparedCorrelation,
} from '../lib/correlationKernel';
import { CorrelationCancelledError } from '../lib/correlationEngine';
import type {
  CorrelationBatchListener,
  CorrelationCellResult,
  CorrelationRequest,
  CorrelationRow,
  CorrelationTask,
} from '../types/correlation';

type WorkerResponse = {
  requestId: number;
  type: 'prepared' | 'installed' | 'result' | 'error';
  prepared?: PreparedCorrelation;
  cells?: CorrelationCellResult[];
  message?: string;
};

class CorrelationWorkerClient {
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }
  >();
  readonly worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL('./correlationWorker.web', window.location.href),
    );
    this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      this.pending.delete(data.requestId);
      if (data.type === 'error') {
        pending.reject(new Error(data.message ?? 'Correlation worker failed'));
        return;
      }
      pending.resolve(data);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Correlation worker failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  request(message: Record<string, unknown>): Promise<WorkerResponse> {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ ...message, requestId });
    });
  }
}

const maximumWorkerCount = 4;
const chunkSize = 64;
// undefined = not attempted yet; null = workers cannot be constructed here.
let workerPool: CorrelationWorkerClient[] | null | undefined;
let nextGeneration = 1;

const createWorkerPool = (): CorrelationWorkerClient[] | null => {
  const reportedConcurrency = navigator.hardwareConcurrency || 4;
  const workerCount = Math.max(
    1,
    Math.min(maximumWorkerCount, reportedConcurrency - 1),
  );
  const clients: CorrelationWorkerClient[] = [];
  try {
    for (let index = 0; index < workerCount; index += 1)
      clients.push(new CorrelationWorkerClient());
    return clients;
  } catch {
    for (const client of clients) client.worker.terminate();
    return null;
  }
};

const getWorkerPool = (): CorrelationWorkerClient[] | null => {
  if (workerPool === undefined) workerPool = createWorkerPool();
  return workerPool;
};

export const runCorrelation = (
  request: CorrelationRequest,
  onBatch?: CorrelationBatchListener,
): CorrelationTask => {
  const pool = typeof Worker === 'undefined' ? null : getWorkerPool();
  if (!pool) return createCorrelationTask(request, onBatch);

  const generation = nextGeneration;
  nextGeneration += 1;
  let cancelled = false;
  let rejectTask!: (reason?: unknown) => void;

  const execute = async (): Promise<CorrelationRow[]> => {
    const preparation = await pool[0].request({
      type: 'prepare',
      generation,
      request,
    });
    const prepared = preparation.prepared;
    if (!prepared) throw new Error('Correlation worker returned no prepared data');
    if (cancelled) throw new CorrelationCancelledError();

    await Promise.all(
      pool.slice(1).map((worker) =>
        worker.request({ type: 'install', generation, prepared }),
      ),
    );
    if (cancelled) throw new CorrelationCancelledError();

    const total = getPreparedCorrelationCellCount(prepared);
    const activeWorkers = pool.slice(
      0,
      Math.max(1, Math.min(pool.length, Math.ceil(total / chunkSize))),
    );
    let nextStart = 0;
    let completed = 0;
    const cells: CorrelationCellResult[] = [];
    const runWorker = async (
      worker: CorrelationWorkerClient,
    ): Promise<void> => {
      while (!cancelled) {
        const start = nextStart;
        if (start >= total) return;
        nextStart += chunkSize;
        const response = await worker.request({
          type: 'compute',
          generation,
          start,
          end: start + chunkSize,
        });
        if (cancelled) return;
        const batchCells = response.cells;
        if (!batchCells) throw new Error('Correlation worker returned no cells');
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
    // Settling an already-cancelled promise is a no-op, so late results are dropped.
    execute().then(resolve, reject);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      rejectTask(new CorrelationCancelledError());
    },
  };
};
