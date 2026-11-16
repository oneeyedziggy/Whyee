import { computeRows } from '../src/lib/correlationEngine';
import type { CorrelationRequest } from '../src/types/correlation';

// Platform variants shadow the default runner, so load it by explicit path.
const { runCorrelation } = jest.requireActual<
  typeof import('../src/workers/correlationRunner')
>('../src/workers/correlationRunner.ts');

const request: CorrelationRequest = {
  categories: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  records: [
    { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
    { categoryId: 'a', dateKey: '2026-01-02', value: 4 },
    { categoryId: 'a', dateKey: '2026-01-03', value: 9 },
    { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
    { categoryId: 'b', dateKey: '2026-01-02', value: 5 },
    { categoryId: 'b', dateKey: '2026-01-03', value: 30 },
  ],
  offsets: [0, 1],
};

describe('default correlation runner', () => {
  it('computes rows on the main thread and reports batches', async () => {
    const onBatch = jest.fn();
    const rows = await runCorrelation(request, onBatch).promise;
    expect(rows).toEqual(computeRows(request));
    expect(onBatch).toHaveBeenCalledWith(
      expect.objectContaining({ completed: 4, total: 4 }),
    );
  });

  it('rejects with a cancellation error when cancelled', async () => {
    const task = runCorrelation(request);
    task.cancel();
    await expect(task.promise).rejects.toMatchObject({
      name: 'CorrelationCancelledError',
    });
  });
});
