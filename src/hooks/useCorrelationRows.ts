import AsyncStorage from '@react-native-async-storage/async-storage';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { createCorrelationInputHash } from '../lib/hash';
import { isStatisticEnabled, type StatisticsSettings } from '../lib/statistics';
import { createVirtualCorrelationInput } from '../lib/virtualSeries';
import { runCorrelation } from '../workers/correlationRunner';
import type {
  CategoryDefinition,
  CategoryGroup,
  CategorySelectionRecord,
} from '../types/category';
import type {
  CorrelationCacheEntry,
  CorrelationRow,
} from '../types/correlation';

// Bumped when the generated series change shape (v6 added weekday indicator series).
export const correlationCachePrefix = 'correlation.mobile.v6.cache.';
const correlationPublishIntervalMs = 120;

// An unreadable or corrupt cache entry is a cache miss, not a reason to skip the run.
const parseCacheEntry = (raw: string | null): CorrelationCacheEntry | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CorrelationCacheEntry;
  } catch {
    return null;
  }
};

interface CorrelationRunInput {
  activeWorkspaceId: string;
  correlationCategories: CategoryDefinition[];
  groups: CategoryGroup[];
  hydrated: boolean;
  offsets: number[];
  records: Record<string, CategorySelectionRecord>;
  statisticsSettings: StatisticsSettings;
  statsVisible: boolean;
}

// Owns the cached, cancellable correlation run.
export const useCorrelationRows = ({
  activeWorkspaceId,
  correlationCategories,
  groups,
  hydrated,
  offsets,
  records,
  statisticsSettings,
  statsVisible,
}: CorrelationRunInput) => {
  const [rows, setRows] = useState<CorrelationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hydrated || !statsVisible) {
      setLoading(false);
      return;
    }
    if (
      !isStatisticEnabled(statisticsSettings, 'correlation.section') &&
      !isStatisticEnabled(statisticsSettings, 'correlation.top-matches')
    ) {
      setRows([]);
      setLoading(false);
      return;
    }
    const includeCalendar = isStatisticEnabled(
      statisticsSettings,
      'calendar.section',
    );
    const inputHash = createCorrelationInputHash(
      correlationCategories,
      records,
      offsets,
      includeCalendar,
      groups,
    );
    const cacheKey = `${correlationCachePrefix}${activeWorkspaceId}`;
    let active = true;
    let correlationTask: ReturnType<typeof runCorrelation> | null = null;
    let publicationTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    AsyncStorage.getItem(cacheKey)
      .catch(() => null)
      .then((raw) => {
        if (!active) return null;
        const cached = parseCacheEntry(raw);
        if (cached?.inputHash === inputHash) return cached.rows;
        const request = createVirtualCorrelationInput(
          correlationCategories,
          records,
          offsets,
          includeCalendar,
          groups,
        );
        setRows([]);
        const categoryById = new Map(
          request.categories.map((category, index) => [
            category.id,
            { category, index },
          ]),
        );
        const accumulatedRows = new Map<
          string,
          {
            row: Omit<CorrelationRow, 'cells'>;
            cellsByOffset: Map<number, CorrelationRow['cells'][number]>;
          }
        >();
        const publishAccumulatedRows = () => {
          publicationTimer = null;
          const nextRows = [...accumulatedRows.values()]
            .sort((first, second) => {
              const firstLeft = categoryById.get(
                first.row.leftCategoryId,
              )!.index;
              const firstRight = categoryById.get(
                first.row.rightCategoryId,
              )!.index;
              const secondLeft = categoryById.get(
                second.row.leftCategoryId,
              )!.index;
              const secondRight = categoryById.get(
                second.row.rightCategoryId,
              )!.index;
              const firstPair = [
                Math.min(firstLeft, firstRight),
                Math.max(firstLeft, firstRight),
              ];
              const secondPair = [
                Math.min(secondLeft, secondRight),
                Math.max(secondLeft, secondRight),
              ];
              return (
                firstPair[0] - secondPair[0] ||
                firstPair[1] - secondPair[1] ||
                firstLeft - secondLeft
              );
            })
            .map(({ row, cellsByOffset }) => ({
              ...row,
              cells: [...cellsByOffset.values()].sort(
                (first, second) => first.offset - second.offset,
              ),
            }));
          startTransition(() => setRows(nextRows));
        };
        correlationTask = runCorrelation(request, (batch) => {
          if (!active) return;
          for (const cell of batch.cells) {
            const left = categoryById.get(cell.leftCategoryId)?.category;
            const right = categoryById.get(cell.rightCategoryId)?.category;
            if (!left || !right) continue;
            const key = `${left.id}:${right.id}`;
            const accumulated = accumulatedRows.get(key) ?? {
              row: {
                label: `${left.name} x ${right.name}`,
                leftCategoryId: left.id,
                rightCategoryId: right.id,
              },
              cellsByOffset: new Map(),
            };
            accumulated.cellsByOffset.set(cell.offset, {
              offset: cell.offset,
              value: cell.value,
            });
            accumulatedRows.set(key, accumulated);
          }
          if (!publicationTimer)
            publicationTimer = setTimeout(
              publishAccumulatedRows,
              correlationPublishIntervalMs,
            );
        });
        return correlationTask.promise.then((nextRows) => {
          if (!active) return null;
          if (publicationTimer) {
            clearTimeout(publicationTimer);
            publicationTimer = null;
          }
          const entry: CorrelationCacheEntry = {
            inputHash,
            rows: nextRows,
            updatedAt: new Date().toISOString(),
          };
          // A failed cache write must not discard freshly computed rows.
          return AsyncStorage.setItem(cacheKey, JSON.stringify(entry))
            .catch(() => undefined)
            .then(() => nextRows);
        });
      })
      .then((nextRows) => {
        if (active && nextRows) setRows(nextRows);
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (publicationTimer) clearTimeout(publicationTimer);
      correlationTask?.cancel();
    };
  }, [
    activeWorkspaceId,
    correlationCategories,
    groups,
    hydrated,
    offsets,
    records,
    statisticsSettings,
    statsVisible,
  ]);

  const orderedRows = useMemo(() => {
    const order = new Map(
      correlationCategories.map((category, index) => [category.id, index]),
    );
    const rank = (seriesId: string) =>
      order.get(seriesId.split(':')[0]) ?? Number.MAX_SAFE_INTEGER;
    return [...rows].sort((left, right) => {
      const leftPair = [
        rank(left.leftCategoryId),
        rank(left.rightCategoryId),
      ].sort((first, second) => first - second);
      const rightPair = [
        rank(right.leftCategoryId),
        rank(right.rightCategoryId),
      ].sort((first, second) => first - second);
      return (
        leftPair[0] - rightPair[0] ||
        leftPair[1] - rightPair[1] ||
        rank(left.leftCategoryId) - rank(right.leftCategoryId)
      );
    });
  }, [correlationCategories, rows]);

  return { orderedRows, loading };
};
