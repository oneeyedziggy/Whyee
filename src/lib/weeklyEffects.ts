import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import { pearson } from './correlationEngine';

export interface WeeklyEffectResult {
  categoryId: string;
  categoryName: string;
  score: number | null;
  weekday: number | null;
  offset: number | null;
  sampleCount: number;
}

const weekdayPhase = (dateKey: string): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
};

export const calculateWeeklyEffects = (
  categories: CategoryDefinition[],
  records: Record<string, CategorySelectionRecord>,
  offsets: number[],
): WeeklyEffectResult[] =>
  categories
    .filter(
      (
        category,
      ): category is Extract<
        CategoryDefinition,
        { kind: 'multiple-choice' | 'number' }
      > =>
        category.enabled &&
        (category.kind === 'multiple-choice' || category.kind === 'number') &&
        category.weeklyEffectEnabled,
    )
    .map((category) => {
      const categoryRecords = Object.values(records).filter(
        (record) => record.categoryId === category.id,
      );
      let best: WeeklyEffectResult = {
        categoryId: category.id,
        categoryName: category.name,
        score: null,
        weekday: null,
        offset: null,
        sampleCount: 0,
      };
      for (const offset of offsets) {
        const values: number[] = [];
        const sine: number[] = [];
        const cosine: number[] = [];
        const byDate = new Map(
          categoryRecords.map((record) => [record.dateKey, record.value]),
        );
        for (const record of categoryRecords) {
          const shiftedDate = new Date(`${record.dateKey}T00:00:00`);
          shiftedDate.setDate(shiftedDate.getDate() + offset);
          const dateKey = `${shiftedDate.getFullYear()}-${`${shiftedDate.getMonth() + 1}`.padStart(2, '0')}-${`${shiftedDate.getDate()}`.padStart(2, '0')}`;
          const value = byDate.get(dateKey);
          if (value === undefined) continue;
          const phase = (2 * Math.PI * weekdayPhase(dateKey)) / 7;
          values.push(value);
          sine.push(Math.sin(phase));
          cosine.push(Math.cos(phase));
        }
        const rSine = pearson(values, sine);
        const rCosine = pearson(values, cosine);
        if (rSine === null || rCosine === null) continue;
        const score = Math.min(1, Math.sqrt(rSine ** 2 + rCosine ** 2));
        if (best.score === null || score > best.score) {
          const phase = Math.atan2(rSine, rCosine);
          const normalizedPhase = (phase + 2 * Math.PI) % (2 * Math.PI);
          best = {
            ...best,
            score,
            weekday:
              (Math.round((normalizedPhase / (2 * Math.PI)) * 7) % 7) + 1,
            offset,
            sampleCount: values.length,
          };
        }
      }
      return best;
    });
