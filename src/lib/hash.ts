import type {
  CategoryGroup,
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';

const hashString = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
};

// Records dominate the hash cost, so digest them once per records object.
const recordsDigests = new WeakMap<object, string>();
const digestRecords = (
  records: Record<string, CategorySelectionRecord>,
): string => {
  const cached = recordsDigests.get(records);
  if (cached) return cached;
  const digest = hashString(
    JSON.stringify(
      Object.values(records).sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
    ),
  );
  recordsDigests.set(records, digest);
  return digest;
};

// Deliberately order-insensitive: category and group ordering only affects how
// rows are displayed, so reordering must not invalidate the cached results.
export const createCorrelationInputHash = (
  categories: CategoryDefinition[],
  records: Record<string, CategorySelectionRecord>,
  offsets: number[] = [],
  includeCalendar = true,
  groups: CategoryGroup[] = [],
  asOf?: number,
): string =>
  hashString(
    JSON.stringify({
      categories: [...categories].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      records: digestRecords(records),
      offsets,
      includeCalendar,
      asOf,
      groups: [...groups]
        .map((group) => ({
          ...group,
          categoryIds: [...group.categoryIds].sort(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }),
  );
