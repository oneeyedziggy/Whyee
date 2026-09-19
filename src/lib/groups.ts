import type { CategoryDefinition, CategoryGroup } from '../types/category';

export const createDefaultGroup = (
  categories: CategoryDefinition[],
): CategoryGroup => ({
  id: 'default-group',
  name: 'General',
  categoryIds: categories.map((category) => category.id),
  expanded: true,
});

export const normalizeGroups = (
  groups: CategoryGroup[] | null | undefined,
  categories: CategoryDefinition[],
): CategoryGroup[] => {
  if (!groups?.length) return [createDefaultGroup(categories)];
  const knownIds = new Set(categories.map((category) => category.id));
  const normalized = groups.map((group) => ({
    ...group,
    categoryIds: group.categoryIds.filter((id) => knownIds.has(id)),
  }));
  const assigned = new Set(normalized.flatMap((group) => group.categoryIds));
  const missing = categories
    .map((category) => category.id)
    .filter((id) => !assigned.has(id));
  if (missing.length) normalized[0].categoryIds.push(...missing);
  return normalized;
};
