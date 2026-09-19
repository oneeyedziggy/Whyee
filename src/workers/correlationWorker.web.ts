import {
  computePreparedCorrelationRange,
  prepareCorrelation,
  type PreparedCorrelation,
} from '../lib/correlationKernel';
import type { CorrelationRequest } from '../types/correlation';

type WorkerRequest =
  | {
      type: 'prepare';
      requestId: number;
      generation: number;
      request: CorrelationRequest;
    }
  | {
      type: 'install';
      requestId: number;
      generation: number;
      prepared: PreparedCorrelation;
    }
  | {
      type: 'compute';
      requestId: number;
      generation: number;
      start: number;
      end: number;
    };

const workerScope = globalThis as unknown as {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage: (message: unknown) => void;
};

let installed:
  | { generation: number; prepared: PreparedCorrelation }
  | undefined;

workerScope.onmessage = ({ data }) => {
  try {
    if (data.type === 'prepare') {
      const prepared = prepareCorrelation(data.request);
      installed = { generation: data.generation, prepared };
      workerScope.postMessage({
        type: 'prepared',
        requestId: data.requestId,
        prepared,
      });
      return;
    }
    if (data.type === 'install') {
      installed = { generation: data.generation, prepared: data.prepared };
      workerScope.postMessage({ type: 'installed', requestId: data.requestId });
      return;
    }
    if (!installed || installed.generation !== data.generation) {
      throw new Error('Correlation worker generation was replaced');
    }
    workerScope.postMessage({
      type: 'result',
      requestId: data.requestId,
      cells: computePreparedCorrelationRange(
        installed.prepared,
        data.start,
        data.end,
      ),
    });
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId: data.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};