import { computeRows } from '../src/lib/correlationEngine';
import type {
  CorrelationRequest,
  CorrelationResultBatch,
} from '../src/types/correlation';

type RunCorrelation =
  typeof import('../src/workers/correlationRunner.web').runCorrelation;
type Message = Record<string, unknown> & { requestId: number; type: string };
type Handler = (event: { data: unknown }) => void;
// Returning a message replaces the real response; returning null drops it.
type Intercept = (request: Message, response: Message) => Message | null | void;

const scope = globalThis as unknown as {
  onmessage: Handler | null;
  postMessage: (message: unknown) => void;
  Worker?: unknown;
};

/** Worker double backed by the real worker script, delivering responses asynchronously. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static failAtConstruction: number | null = null;
  static intercept: Intercept | null = null;

  onmessage: Handler | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  readonly terminate = jest.fn();
  readonly posted: Message[] = [];
  private readonly handler: Handler;

  constructor(readonly url: URL) {
    if (FakeWorker.failAtConstruction === FakeWorker.instances.length) {
      throw new Error('Workers are blocked');
    }
    const saved = scope.onmessage;
    let handler!: Handler;
    jest.isolateModules(() => {
      require('../src/workers/correlationWorker.web');
      handler = scope.onmessage as Handler;
    });
    scope.onmessage = saved;
    this.handler = handler;
    FakeWorker.instances.push(this);
  }

  postMessage(message: Message) {
    this.posted.push(message);
    const responses: Message[] = [];
    const savedPost = scope.postMessage;
    scope.postMessage = (response) => responses.push(response as Message);
    try {
      this.handler({ data: message });
    } finally {
      scope.postMessage = savedPost;
    }
    void Promise.resolve().then(() => {
      for (const response of responses) {
        const replaced = FakeWorker.intercept?.(message, response);
        if (replaced === null) continue;
        this.deliver(replaced ?? response);
      }
    });
  }

  deliver(data: unknown) {
    this.onmessage?.({ data });
  }
}

const createRequest = (
  categoryCount: number,
  offsetCount: number,
): CorrelationRequest => {
  const categories = Array.from({ length: categoryCount }, (_, index) => ({
    id: `c${index}`,
    name: `C${index}`,
  }));
  const records = categories.flatMap((category, categoryIndex) =>
    Array.from({ length: 20 }, (_, day) => ({
      categoryId: category.id,
      dateKey: `2026-01-${String(day + 1).padStart(2, '0')}`,
      value: ((day * (categoryIndex + 3)) % 7) + categoryIndex,
    })),
  );
  return {
    categories,
    records,
    offsets: Array.from({ length: offsetCount }, (_, index) => index - 1),
  };
};

const setConcurrency = (value: number | undefined) => {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    value,
    configurable: true,
  });
};

const loadRunner = (concurrency: number | undefined): RunCorrelation => {
  setConcurrency(concurrency);
  jest.resetModules();
  return (
    require('../src/workers/correlationRunner.web') as {
      runCorrelation: RunCorrelation;
    }
  ).runCorrelation;
};

const flush = async () => {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
};

const cancelledError = { name: 'CorrelationCancelledError' };
const originalConcurrency = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(navigator),
  'hardwareConcurrency',
);

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failAtConstruction = null;
  FakeWorker.intercept = null;
  scope.Worker = FakeWorker;
});

afterEach(() => {
  delete scope.Worker;
  delete (navigator as { hardwareConcurrency?: number }).hardwareConcurrency;
});

afterAll(() => {
  if (originalConcurrency)
    Object.defineProperty(
      Object.getPrototypeOf(navigator),
      'hardwareConcurrency',
      originalConcurrency,
    );
});

const postedOfType = (type: string) =>
  FakeWorker.instances.flatMap((worker) =>
    worker.posted.filter((message) => message.type === type),
  );

describe('web correlation runner', () => {
  it('falls back to the main-thread task when Worker is unavailable', async () => {
    delete scope.Worker;
    const runCorrelation = loadRunner(3);
    const request = createRequest(2, 2);
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
  });

  it('falls back and stops retrying when Worker construction throws', async () => {
    FakeWorker.failAtConstruction = 0;
    const runCorrelation = loadRunner(3);
    const request = createRequest(2, 1);
    const onBatch = jest.fn();
    await expect(runCorrelation(request, onBatch).promise).resolves.toEqual(
      computeRows(request),
    );
    expect(onBatch).toHaveBeenCalled();
    FakeWorker.failAtConstruction = null;
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('terminates workers created before a construction failure', async () => {
    FakeWorker.failAtConstruction = 1;
    const runCorrelation = loadRunner(8);
    const request = createRequest(2, 1);
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });

  it.each([
    [8, 4],
    [3, 2],
    [1, 1],
    [0, 3],
    [undefined, 3],
  ])(
    'sizes the pool from hardwareConcurrency %p to %p workers',
    async (concurrency, expectedWorkers) => {
      const runCorrelation = loadRunner(concurrency);
      const request = createRequest(2, 1);
      await expect(runCorrelation(request).promise).resolves.toEqual(
        computeRows(request),
      );
      expect(FakeWorker.instances).toHaveLength(expectedWorkers);
      expect(FakeWorker.instances[0].url.href).toMatch(/correlationWorker\.web$/);
      expect(postedOfType('install')).toHaveLength(expectedWorkers - 1);
      expect(postedOfType('compute')).toHaveLength(1);
    },
  );

  it('spreads chunks across workers, streams batches, and reuses the pool', async () => {
    const runCorrelation = loadRunner(8);
    const request = createRequest(3, 50);
    const batches: CorrelationResultBatch[] = [];
    const rows = await runCorrelation(request, (batch) => batches.push(batch))
      .promise;

    expect(rows).toEqual(computeRows(request));
    const total = 50 * 3 * 2;
    expect(batches.every((batch) => batch.total === total)).toBe(true);
    expect(batches[batches.length - 1].completed).toBe(total);
    expect(
      FakeWorker.instances.every((worker) =>
        worker.posted.some((message) => message.type === 'compute'),
      ),
    ).toBe(true);

    await expect(runCorrelation(request).promise).resolves.toEqual(rows);
    expect(FakeWorker.instances).toHaveLength(4);
  });

  it('merges correctly when chunk responses arrive out of order', async () => {
    const runCorrelation = loadRunner(8);
    const held: Array<() => void> = [];
    FakeWorker.intercept = (message, response) => {
      if (message.type !== 'compute') return;
      const worker = FakeWorker.instances.find((candidate) =>
        candidate.posted.includes(message),
      ) as FakeWorker;
      held.push(() => worker.deliver(response));
      return null;
    };
    const request = createRequest(3, 50);
    const task = runCorrelation(request);
    while (held.length < 4) await flush();
    FakeWorker.intercept = null;
    held.reverse().forEach((release) => release());
    await expect(task.promise).resolves.toEqual(computeRows(request));
  });

  it('ignores unknown and duplicate response ids', async () => {
    const runCorrelation = loadRunner(2);
    FakeWorker.intercept = (message, response) => {
      const [worker] = FakeWorker.instances;
      worker.deliver({ requestId: 999, type: 'result', cells: [] });
      worker.deliver(response);
      return response;
    };
    const request = createRequest(2, 1);
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
  });

  it.each([
    ['worker message', 'prepare failed', 'prepare failed'],
    ['default message', undefined, 'Correlation worker failed'],
  ])('rejects with the %s from an error response', async (_, message, expected) => {
    const runCorrelation = loadRunner(2);
    FakeWorker.intercept = (request) => ({
      type: 'error',
      requestId: request.requestId,
      message,
    });
    await expect(runCorrelation(createRequest(2, 1)).promise).rejects.toThrow(
      expected,
    );
  });

  it.each([
    ['worker message', 'script crashed', 'script crashed'],
    ['default message', '', 'Correlation worker failed'],
  ])(
    'rejects every pending request with the %s on a worker error event',
    async (_, message, expected) => {
      const runCorrelation = loadRunner(2);
      FakeWorker.intercept = () => null;
      const first = runCorrelation(createRequest(2, 1));
      const second = runCorrelation(createRequest(2, 1));
      await flush();
      FakeWorker.instances[0].onerror?.({ message });
      await expect(first.promise).rejects.toThrow(expected);
      await expect(second.promise).rejects.toThrow(expected);
    },
  );

  it('rejects when the worker omits prepared data or cells', async () => {
    const runCorrelation = loadRunner(2);
    FakeWorker.intercept = (request) =>
      request.type === 'prepare'
        ? { type: 'prepared', requestId: request.requestId }
        : undefined;
    await expect(runCorrelation(createRequest(2, 1)).promise).rejects.toThrow(
      'Correlation worker returned no prepared data',
    );

    FakeWorker.intercept = (request) =>
      request.type === 'compute'
        ? { type: 'result', requestId: request.requestId }
        : undefined;
    await expect(runCorrelation(createRequest(2, 1)).promise).rejects.toThrow(
      'Correlation worker returned no cells',
    );
  });

  it('fails an older concurrent run whose worker state was replaced', async () => {
    const runCorrelation = loadRunner(2);
    const older = runCorrelation(createRequest(2, 1));
    const newerRequest = createRequest(3, 1);
    const newer = runCorrelation(newerRequest);
    await expect(older.promise).rejects.toThrow(
      'Correlation worker generation was replaced',
    );
    await expect(newer.promise).resolves.toEqual(computeRows(newerRequest));
  });

  it('rejects on cancel and stops after preparation', async () => {
    const runCorrelation = loadRunner(8);
    const task = runCorrelation(createRequest(3, 2));
    task.cancel();
    task.cancel();
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(postedOfType('install')).toHaveLength(0);
  });

  it('stops before computing when cancelled during installation', async () => {
    const runCorrelation = loadRunner(8);
    let cancel: () => void = () => undefined;
    FakeWorker.intercept = (request) => {
      if (request.type === 'install') cancel();
    };
    const task = runCorrelation(createRequest(3, 2));
    cancel = task.cancel;
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(postedOfType('compute')).toHaveLength(0);
  });

  it('drops in-flight chunks when cancelled during computation', async () => {
    const runCorrelation = loadRunner(8);
    const onBatch = jest.fn();
    let cancel: () => void = () => undefined;
    FakeWorker.intercept = (request) => {
      if (request.type === 'compute') cancel();
    };
    const task = runCorrelation(createRequest(3, 50), onBatch);
    cancel = task.cancel;
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(onBatch).not.toHaveBeenCalled();
  });

  it('stops scheduling chunks when a batch listener cancels', async () => {
    const runCorrelation = loadRunner(3);
    let cancel: () => void = () => undefined;
    const onBatch = jest.fn(() => cancel());
    const task = runCorrelation(createRequest(2, 100), onBatch);
    cancel = task.cancel;
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(postedOfType('compute')).toHaveLength(2);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('keeps a settled result when cancelled afterwards', async () => {
    const runCorrelation = loadRunner(2);
    const task = runCorrelation(createRequest(2, 1));
    const rows = await task.promise;
    task.cancel();
    await expect(task.promise).resolves.toBe(rows);
  });
});
