import { getLocalTimeStamp, makeRecordKey } from './dates';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';

// Patch must land after the existing entry so edits are never overwritten by stale fields.
export const buildEntry = (
  category: CategoryDefinition,
  entry: CategorySelectionRecord | null,
  index: number,
  dateKey: string,
  patch: Partial<CategorySelectionRecord>,
): CategorySelectionRecord => {
  const ordinal = entry?.ordinal ?? index;
  return {
    key: entry?.key ?? makeRecordKey(dateKey, ordinal, category.id),
    categoryId: category.id,
    dateKey: entry?.dateKey ?? dateKey,
    ordinal,
    localTime: entry?.localTime ?? getLocalTimeStamp(),
    value: 0,
    instanceId: entry?.instanceId ?? `${category.id}:${ordinal}`,
    ...entry,
    ...patch,
  };
};
