import type {
  CorrelationCancellation,
  CorrelationRequest,
  CorrelationRow,
} from '../types/correlation';
import {
  computePreparedCorrelationCell,
  createPreparedCorrelationRows,
  prepareCorrelation,
} from './correlationKernel';

export class CorrelationCancelledError extends Error {
  constructor() {
    super('Correlation calculation cancelled');
    this.name = 'CorrelationCancelledError';
  }
}

const throwIfCancelled = (cancellation?: CorrelationCancellation): void => {
  if (cancellation?.cancelled) throw new CorrelationCancelledError();
};

const canCorrelate = (
  first: CorrelationRequest['categories'][number],
  second: CorrelationRequest['categories'][number],
): boolean => {
  if (
    first.scopeGroupId &&
    !second.global &&
    second.groupId !== first.scopeGroupId
  )
    return false;
  if (
    second.scopeGroupId &&
    !first.global &&
    first.groupId !== second.scopeGroupId
  )
    return false;
  return true;
};

const formatDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateKey = (dateKey: string, offset: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offset);
  return formatDateKey(date);
};

export const pearson = (
  xValues: number[],
  yValues: number[],
): number | null => {
  if (xValues.length !== yValues.length || xValues.length < 2) return null;
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const meanY = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let index = 0; index < xValues.length; index += 1) {
    const deltaX = xValues[index] - meanX;
    const deltaY = yValues[index] - meanY;
    numerator += deltaX * deltaY;
    denominatorX += deltaX * deltaX;
    denominatorY += deltaY * deltaY;
  }
  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator === 0 ? null : numerator / denominator;
};

// Shifted by +1 so zero/negative journaled values (counters, inverse transforms) stay defined;
// floored to avoid -Infinity for values at or below -1.
const logTransform = (value: number): number =>
  Math.log(Math.max(value + 1, 1e-6));

export type DailySeries = Map<string, Map<string, number>>;

export interface CorrelationCellResult {
  leftCategoryId: string;
  rightCategoryId: string;
  offset: number;
  value: number | null;
}

export const buildDailySeries = (
  input: CorrelationRequest,
): DailySeries => {
  const categoryDateBuckets = new Map<
    string,
    Map<string, { sum: number; count: number }>
  >();
  for (const record of input.records) {
    const dateBuckets = categoryDateBuckets.get(record.categoryId) ?? new Map();
    const bucket = dateBuckets.get(record.dateKey) ?? { sum: 0, count: 0 };
    bucket.sum += record.value;
    bucket.count += 1;
    dateBuckets.set(record.dateKey, bucket);
    categoryDateBuckets.set(record.categoryId, dateBuckets);
  }
  return new Map(
    [...categoryDateBuckets].map(([categoryId, dateBuckets]) => [
      categoryId,
      new Map(
        [...dateBuckets].map(([dateKey, bucket]) => [
          dateKey,
          bucket.sum / bucket.count,
        ]),
      ),
    ]),
  );
};

export const computeCorrelationCell = (
  leftCategoryId: string,
  rightCategoryId: string,
  offset: number,
  series: DailySeries,
): { offset: number; value: number | null } => {
  const firstSeries = series.get(leftCategoryId) ?? new Map<string, number>();
  const secondSeries =
    series.get(rightCategoryId) ?? new Map<string, number>();
  const xValues: number[] = [];
  const yValues: number[] = [];
  for (const [dateKey, firstValue] of firstSeries) {
    const secondValue = secondSeries.get(shiftDateKey(dateKey, offset));
    if (typeof secondValue === 'number') {
      xValues.push(logTransform(firstValue));
      yValues.push(logTransform(secondValue));
    }
  }
  return {
    offset,
    value: pearson(xValues, yValues),
  };
};

export const computeRows = (input: CorrelationRequest): CorrelationRow[] => {
  return createPreparedCorrelationRows(prepareCorrelation(input));
};

const yieldToUi = async (
  cancellation?: CorrelationCancellation,
): Promise<void> => {
  throwIfCancelled(cancellation);
  await new Promise((resolve) => setTimeout(resolve, 0));
  throwIfCancelled(cancellation);
};

export const computeRowsProgressively = async (
  input: CorrelationRequest,
  onCell?: (cell: CorrelationCellResult) => void,
  cancellation?: CorrelationCancellation,
): Promise<CorrelationRow[]> => {
  const prepared = prepareCorrelation(input);
  const rows: CorrelationRow[] = [];
  const rowByPair = new Map<string, CorrelationRow>();
  for (const { left, right } of prepared.pairs) {
      const firstRow: CorrelationRow = {
        label: `${left.name} x ${right.name}`,
        leftCategoryId: left.id,
        rightCategoryId: right.id,
        cells: [],
      };
      const secondRow: CorrelationRow = {
        label: `${right.name} x ${left.name}`,
        leftCategoryId: right.id,
        rightCategoryId: left.id,
        cells: [],
      };
      rows.push(firstRow, secondRow);
      rowByPair.set(`${left.id}:${right.id}`, firstRow);
      rowByPair.set(`${right.id}:${left.id}`, secondRow);
  }
  for (const offset of prepared.offsets) {
    throwIfCancelled(cancellation);
    for (const { left, right } of prepared.pairs) {
      throwIfCancelled(cancellation);
      for (const [first, second] of [
        [left, right],
        [right, left],
      ] as const) {
        const cell = computePreparedCorrelationCell(
          first.id,
          second.id,
          offset,
          prepared,
        );
        rowByPair.get(`${first.id}:${second.id}`)?.cells.push(cell);
        onCell?.({
          leftCategoryId: first.id,
          rightCategoryId: second.id,
          offset,
          value: cell.value,
        });
      }
      await yieldToUi(cancellation);
    }
  }
  throwIfCancelled(cancellation);
  return rows;
};

export const computeRowsAsync = async (
  input: CorrelationRequest,
  cancellation?: CorrelationCancellation,
): Promise<CorrelationRow[]> =>
  computeRowsProgressively(input, undefined, cancellation);
