import {
  computePreparedCorrelationCell,
  mergePreparedCorrelationCells,
  prepareCorrelation,
} from '../src/lib/correlationKernel';
import type { CorrelationRequest } from '../src/types/correlation';

const request = (values: Record<string, number[]>): CorrelationRequest => ({
  categories: Object.keys(values).map((id) => ({ id, name: id.toUpperCase() })),
  records: Object.entries(values).flatMap(([categoryId, series]) =>
    series.map((value, index) => ({
      categoryId,
      dateKey: `2026-01-0${index + 1}`,
      value,
    })),
  ),
  offsets: [0],
});

describe('prepared correlation kernel', () => {
  it('correlates matching days and is null for unknown series', () => {
    const prepared = prepareCorrelation(
      request({ a: [1, 2, 3, 4], b: [2, 4, 6, 8] }),
    );
    expect(computePreparedCorrelationCell('a', 'b', 0, prepared).value).toBeCloseTo(
      1,
    );
    expect(computePreparedCorrelationCell('a', 'missing', 0, prepared)).toEqual({
      offset: 0,
      value: null,
    });
    expect(computePreparedCorrelationCell('missing', 'a', 0, prepared).value).toBeNull();
  });

  it('returns null rather than dividing by zero for a constant series', () => {
    const prepared = prepareCorrelation(
      request({ flat: [3, 3, 3, 3], b: [1, 5, 2, 8] }),
    );
    expect(computePreparedCorrelationCell('flat', 'b', 0, prepared).value).toBeNull();
    expect(computePreparedCorrelationCell('b', 'flat', 0, prepared).value).toBeNull();
  });

  it('fills rows with null cells when a pair produced no results', () => {
    const prepared = prepareCorrelation(request({ a: [1, 2], b: [2, 1] }));
    expect(mergePreparedCorrelationCells(prepared, [])).toEqual([
      {
        label: 'A x B',
        leftCategoryId: 'a',
        rightCategoryId: 'b',
        cells: [{ offset: 0, value: null }],
      },
      {
        label: 'B x A',
        leftCategoryId: 'b',
        rightCategoryId: 'a',
        cells: [{ offset: 0, value: null }],
      },
    ]);
  });
});
