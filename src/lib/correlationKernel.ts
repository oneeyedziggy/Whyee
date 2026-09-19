import type {
  CorrelationCellResult,
  CorrelationInputCategory,
  CorrelationRequest,
  CorrelationRow,
} from '../types/correlation';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export interface PreparedCorrelationSeries {
  days: number[];
  values: number[];
}

export interface PreparedCorrelationPair {
  left: CorrelationInputCategory;
  right: CorrelationInputCategory;
}

export interface PreparedCorrelation {
  offsets: number[];
  pairs: PreparedCorrelationPair[];
  seriesByCategoryId: Record<string, PreparedCorrelationSeries>;
}

export const getPreparedCorrelationCellCount = (
  prepared: PreparedCorrelation,
): number => {
  'worklet';
  return prepared.offsets.length * prepared.pairs.length * 2;
};

export const canCorrelate = (
  first: CorrelationInputCategory,
  second: CorrelationInputCategory,
): boolean => {
  'worklet';
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

const dateKeyToDay = (dateKey: string): number => {
  'worklet';
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / millisecondsPerDay);
};

const logTransform = (value: number): number => {
  'worklet';
  return Math.log(Math.max(value + 1, 1e-6));
};

const findDayValue = (
  series: PreparedCorrelationSeries,
  targetDay: number,
): number | undefined => {
  'worklet';
  let low = 0;
  let high = series.days.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const day = series.days[middle];
    if (day === targetDay) return series.values[middle];
    if (day < targetDay) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
};

export const prepareCorrelation = (
  input: CorrelationRequest,
): PreparedCorrelation => {
  'worklet';
  const bucketsByCategoryId: Record<
    string,
    Record<string, { sum: number; count: number }>
  > = {};
  for (const record of input.records) {
    const categoryBuckets =
      bucketsByCategoryId[record.categoryId] ??
      (bucketsByCategoryId[record.categoryId] = {});
    const day = dateKeyToDay(record.dateKey);
    const bucket = categoryBuckets[day] ?? { sum: 0, count: 0 };
    bucket.sum += record.value;
    bucket.count += 1;
    categoryBuckets[day] = bucket;
  }

  const seriesByCategoryId: Record<string, PreparedCorrelationSeries> = {};
  for (const category of input.categories) {
    const buckets = bucketsByCategoryId[category.id] ?? {};
    const days = Object.keys(buckets)
      .map(Number)
      .sort((left, right) => left - right);
    seriesByCategoryId[category.id] = {
      days,
      values: days.map((day) => {
        const bucket = buckets[day];
        return logTransform(bucket.sum / bucket.count);
      }),
    };
  }

  const pairs: PreparedCorrelationPair[] = [];
  for (let leftIndex = 0; leftIndex < input.categories.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < input.categories.length;
      rightIndex += 1
    ) {
      const left = input.categories[leftIndex];
      const right = input.categories[rightIndex];
      if (canCorrelate(left, right)) pairs.push({ left, right });
    }
  }

  return {
    offsets: [...input.offsets].sort((left, right) => left - right),
    pairs,
    seriesByCategoryId,
  };
};

export const computePreparedCorrelationCell = (
  leftCategoryId: string,
  rightCategoryId: string,
  offset: number,
  prepared: PreparedCorrelation,
): { offset: number; value: number | null } => {
  'worklet';
  const firstSeries = prepared.seriesByCategoryId[leftCategoryId] ?? {
    days: [],
    values: [],
  };
  const secondSeries = prepared.seriesByCategoryId[rightCategoryId] ?? {
    days: [],
    values: [],
  };
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let index = 0; index < firstSeries.days.length; index += 1) {
    const firstValue = firstSeries.values[index];
    const secondValue = findDayValue(
      secondSeries,
      firstSeries.days[index] + offset,
    );
    if (secondValue === undefined) continue;
    count += 1;
    sumX += firstValue;
    sumY += secondValue;
    sumXX += firstValue * firstValue;
    sumYY += secondValue * secondValue;
    sumXY += firstValue * secondValue;
  }

  if (count < 2) return { offset, value: null };
  const numerator = count * sumXY - sumX * sumY;
  const denominatorX = Math.max(0, count * sumXX - sumX * sumX);
  const denominatorY = Math.max(0, count * sumYY - sumY * sumY);
  const denominator = Math.sqrt(denominatorX * denominatorY);
  return {
    offset,
    value: denominator === 0 ? null : numerator / denominator,
  };
};

export const computePreparedCorrelationRange = (
  prepared: PreparedCorrelation,
  start: number,
  end: number,
): CorrelationCellResult[] => {
  'worklet';
  const cells: CorrelationCellResult[] = [];
  const directionalPairsPerOffset = prepared.pairs.length * 2;
  const total = getPreparedCorrelationCellCount(prepared);
  for (let taskIndex = start; taskIndex < Math.min(end, total); taskIndex += 1) {
    const offsetIndex = Math.floor(taskIndex / directionalPairsPerOffset);
    const directionalPairIndex = taskIndex % directionalPairsPerOffset;
    const pair = prepared.pairs[Math.floor(directionalPairIndex / 2)];
    const first = directionalPairIndex % 2 === 0 ? pair.left : pair.right;
    const second = directionalPairIndex % 2 === 0 ? pair.right : pair.left;
    const cell = computePreparedCorrelationCell(
      first.id,
      second.id,
      prepared.offsets[offsetIndex],
      prepared,
    );
    cells.push({
      leftCategoryId: first.id,
      rightCategoryId: second.id,
      offset: cell.offset,
      value: cell.value,
    });
  }
  return cells;
};

const pairKey = (leftCategoryId: string, rightCategoryId: string): string => {
  'worklet';
  return `${leftCategoryId}\u0000${rightCategoryId}`;
};

export const mergePreparedCorrelationCells = (
  prepared: PreparedCorrelation,
  cells: CorrelationCellResult[],
): CorrelationRow[] => {
  'worklet';
  const cellsByPair: Record<string, Record<string, number | null>> = {};
  for (const cell of cells) {
    const key = pairKey(cell.leftCategoryId, cell.rightCategoryId);
    const pairCells = cellsByPair[key] ?? (cellsByPair[key] = {});
    pairCells[cell.offset] = cell.value;
  }

  const rows: CorrelationRow[] = [];
  for (const { left, right } of prepared.pairs) {
    for (const [first, second] of [
      [left, right],
      [right, left],
    ] as const) {
      const pairCells = cellsByPair[pairKey(first.id, second.id)] ?? {};
      rows.push({
        label: `${first.name} x ${second.name}`,
        leftCategoryId: first.id,
        rightCategoryId: second.id,
        cells: prepared.offsets.map((offset) => ({
          offset,
          value: pairCells[offset] ?? null,
        })),
      });
    }
  }
  return rows;
};

export const createPreparedCorrelationRows = (
  prepared: PreparedCorrelation,
): CorrelationRow[] => {
  'worklet';
  return mergePreparedCorrelationCells(
    prepared,
    computePreparedCorrelationRange(
      prepared,
      0,
      getPreparedCorrelationCellCount(prepared),
    ),
  );
};