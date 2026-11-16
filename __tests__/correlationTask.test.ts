import { createCorrelationTask } from '../src/workers/correlationTask';
import type { CorrelationRequest } from '../src/types/correlation';

const request = (
  categories: CorrelationRequest['categories'],
  offsets = [0],
): CorrelationRequest => ({
  categories,
  records: [
    { categoryId: 'a', dateKey: '2026-01-01', value: 1 },
    { categoryId: 'a', dateKey: '2026-01-02', value: 2 },
    { categoryId: 'a', dateKey: '2026-01-03', value: 4 },
    { categoryId: 'b', dateKey: '2026-01-01', value: 2 },
    { categoryId: 'b', dateKey: '2026-01-02', value: 3 },
    { categoryId: 'b', dateKey: '2026-01-03', value: 5 },
  ],
  offsets,
});

describe('createCorrelationTask', () => {
  it('counts only correlatable pairs in the progress total', async () => {
    const totals: number[] = [];
    const completed: number[] = [];
    const task = createCorrelationTask(
      request(
        [
          { id: 'a', name: 'A', groupId: 'g1' },
          { id: 'b', name: 'B', groupId: 'g1' },
          { id: 'scoped', name: 'Scoped', groupId: 'g2', scopeGroupId: 'g2' },
        ],
        [0, 1],
      ),
      (batch) => {
        totals.push(batch.total);
        completed.push(batch.completed);
      },
    );

    const rows = await task.promise;

    // Only a<->b qualifies: 2 offsets x 1 pair x 2 directions.
    expect(rows.map((row) => row.label)).toEqual(['A x B', 'B x A']);
    expect(totals).toEqual([4]);
    expect(completed).toEqual([4]);
  });

  it('resolves without a batch listener', async () => {
    const task = createCorrelationTask(
      request([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]),
    );
    const rows = await task.promise;
    expect(rows).toHaveLength(2);
    expect(rows[0].cells[0].value).toBeCloseTo(1, 1);
  });

  it('does not publish an empty final batch when there are no pairs', async () => {
    const onBatch = jest.fn();
    const task = createCorrelationTask(
      request([{ id: 'a', name: 'A' }]),
      onBatch,
    );
    await expect(task.promise).resolves.toEqual([]);
    expect(onBatch).not.toHaveBeenCalled();
  });

  it('ignores cancel once the task has settled', async () => {
    const task = createCorrelationTask(
      request([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]),
    );
    const rows = await task.promise;
    task.cancel();
    await expect(task.promise).resolves.toBe(rows);
  });

  it('rejects when cancelled after the computation has started', async () => {
    const task = createCorrelationTask(
      request([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]),
    );
    // Let the scheduled start fire so the in-flight run, not the timer, gets cancelled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    task.cancel();
    task.cancel();

    await expect(task.promise).rejects.toMatchObject({
      name: 'CorrelationCancelledError',
    });
  });
});
