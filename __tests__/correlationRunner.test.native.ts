import { computeRows } from '../src/lib/correlationEngine';
import type {
  CorrelationRequest,
  CorrelationResultBatch,
} from '../src/types/correlation';

type RunCorrelation =
  typeof import('../src/workers/correlationRunner.native').runCorrelation;

interface FakeRuntime {
  name: string;
  globals: unknown;
}

type CallHook = (runtime: FakeRuntime, args: unknown[]) => void;

const runtimeGlobals = globalThis as { __correlationPrepared?: unknown };

const createFakeWorklets = () => {
  const hooks: CallHook[] = [];
  const worklets = {
    hooks,
    createWorkletRuntime: jest.fn(
      ({ name }: { name: string }): FakeRuntime => ({ name, globals: undefined }),
    ),
    // Emulates isolated runtimes by swapping each runtime's global around the call.
    runOnRuntimeAsync: jest.fn(
      async (
        runtime: FakeRuntime,
        worklet: (...args: unknown[]) => unknown,
        ...args: unknown[]
      ) => {
        await Promise.resolve();
        hooks.forEach((hook) => hook(runtime, args));
        const saved = runtimeGlobals.__correlationPrepared;
        runtimeGlobals.__correlationPrepared = runtime.globals;
        try {
          return worklet(...args);
        } finally {
          runtime.globals = runtimeGlobals.__correlationPrepared;
          runtimeGlobals.__correlationPrepared = saved;
        }
      },
    ),
  };
  return worklets;
};

const loadRunner = (worklets: object | null): RunCorrelation => {
  // The runner requires worklets lazily, so reset the shared registry rather
  // than isolating only the initial import.
  jest.resetModules();
  jest.doMock('react-native-worklets', () => {
    if (!worklets) throw new Error('react-native-worklets is unavailable');
    return worklets;
  });
  return (
    require('../src/workers/correlationRunner.native') as {
      runCorrelation: RunCorrelation;
    }
  ).runCorrelation;
};

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

const flush = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

const cancelledError = { name: 'CorrelationCancelledError' };

// Argument counts identify the worklet: prepare(request), install(generation,
// prepared), compute(generation, start, end).
const isCompute = (args: unknown[]) => args.length === 3;
const isInstall = (args: unknown[]) => args.length === 2;

afterEach(() => {
  jest.dontMock('react-native-worklets');
  delete runtimeGlobals.__correlationPrepared;
});

describe('native correlation runner', () => {
  it.each([
    ['no records', { ...createRequest(2, 1), records: [] }],
    ['fewer than two categories', createRequest(1, 1)],
    ['no offsets', createRequest(2, 0)],
  ])('resolves empty results without loading worklets for %s', async (_, request) => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const task = runCorrelation(request);
    expect(() => task.cancel()).not.toThrow();
    await expect(task.promise).resolves.toEqual([]);
    expect(worklets.createWorkletRuntime).not.toHaveBeenCalled();
  });

  it('falls back to the main-thread task when worklets are unavailable', async () => {
    const runCorrelation = loadRunner(null);
    const request = createRequest(3, 2);
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
    const onBatch = jest.fn();
    await expect(runCorrelation(request, onBatch).promise).resolves.toEqual(
      computeRows(request),
    );
    expect(onBatch).toHaveBeenCalled();
  });

  it('spreads chunks across the runtime pool and streams batches', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const request = createRequest(3, 50);
    const batches: CorrelationResultBatch[] = [];

    const rows = await runCorrelation(request, (batch) => batches.push(batch))
      .promise;

    expect(rows).toEqual(computeRows(request));
    expect(worklets.createWorkletRuntime).toHaveBeenCalledTimes(3);
    const total = 50 * 3 * 2;
    expect(batches.map((batch) => batch.total)).toEqual(
      batches.map(() => total),
    );
    expect(batches[batches.length - 1].completed).toBe(total);
    const computeRuntimes = new Set(
      worklets.runOnRuntimeAsync.mock.calls
        .filter(([, , ...args]) => isCompute(args))
        .map(([runtime]) => runtime.name),
    );
    expect(computeRuntimes.size).toBe(3);
  });

  it('reuses the runtime pool and uses one runtime for small jobs', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const request = createRequest(2, 1);
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
    await expect(runCorrelation(request).promise).resolves.toEqual(
      computeRows(request),
    );
    expect(worklets.createWorkletRuntime).toHaveBeenCalledTimes(3);
    const installRuntimes = worklets.runOnRuntimeAsync.mock.calls
      .filter(([, , ...args]) => isInstall(args))
      .map(([runtime]) => runtime.name);
    expect(installRuntimes).toEqual(['correlation-1', 'correlation-1']);
  });

  it('rejects immediately on cancel and stops after preparation', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const task = runCorrelation(createRequest(3, 2));
    task.cancel();
    task.cancel();
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(worklets.runOnRuntimeAsync).toHaveBeenCalledTimes(1);
  });

  it('stops before computing when cancelled during installation', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const task = runCorrelation(createRequest(3, 2));
    worklets.hooks.push((_, args) => {
      if (isInstall(args)) task.cancel();
    });
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(
      worklets.runOnRuntimeAsync.mock.calls.some(([, , ...args]) =>
        isCompute(args),
      ),
    ).toBe(false);
  });

  it('drops in-flight chunks when cancelled during computation', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const onBatch = jest.fn();
    const task = runCorrelation(createRequest(3, 50), onBatch);
    worklets.hooks.push((_, args) => {
      if (isCompute(args)) task.cancel();
    });
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    expect(onBatch).not.toHaveBeenCalled();
  });

  it('stops scheduling chunks when a batch listener cancels', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    let cancel: () => void = () => undefined;
    const onBatch = jest.fn(() => cancel());
    const task = runCorrelation(createRequest(2, 100), onBatch);
    cancel = task.cancel;
    await expect(task.promise).rejects.toMatchObject(cancelledError);
    await flush();
    const computeCalls = worklets.runOnRuntimeAsync.mock.calls.filter(
      ([, , ...args]) => isCompute(args),
    );
    expect(computeCalls).toHaveLength(2);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('rejects when a runtime lost its prepared generation', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    worklets.hooks.push((runtime, args) => {
      if (isCompute(args)) runtime.globals = undefined;
    });
    await expect(runCorrelation(createRequest(2, 1)).promise).rejects.toThrow(
      'Correlation worker generation was replaced',
    );
  });

  it('fails an older concurrent run whose runtime state was replaced', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    const older = runCorrelation(createRequest(2, 1));
    const newerRequest = createRequest(3, 1);
    const newer = runCorrelation(newerRequest);
    await expect(older.promise).rejects.toThrow(
      'Correlation worker generation was replaced',
    );
    await expect(newer.promise).resolves.toEqual(computeRows(newerRequest));
  });

  it('propagates runtime errors and ignores cancel after settling', async () => {
    const worklets = createFakeWorklets();
    const runCorrelation = loadRunner(worklets);
    worklets.runOnRuntimeAsync.mockRejectedValueOnce(new Error('runtime crashed'));
    const failed = runCorrelation(createRequest(2, 1));
    await expect(failed.promise).rejects.toThrow('runtime crashed');
    failed.cancel();

    const request = createRequest(2, 1);
    const succeeded = runCorrelation(request);
    const rows = await succeeded.promise;
    succeeded.cancel();
    await expect(succeeded.promise).resolves.toBe(rows);
  });
});
