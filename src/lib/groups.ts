import type { CategoryDefinition, CategoryGroup } from '../types/category';

export const createDefaultGroup = (
  categories: CategoryDefinition[],
): CategoryGroup => ({
  id: 'default-group',
  name: 'General',
  categoryIds: categories.map((category) => category.id),
  expanded: true,
  enabled: true,
});

export const isGroupEnabled = (group: CategoryGroup): boolean =>
  group.enabled !== false;

// Disabling a group turns every member off but banks the members that were already off, so
// re-enabling restores each category's own state instead of switching them all on.
export const setGroupEnabled = (
  group: CategoryGroup,
  categories: CategoryDefinition[],
  enabled: boolean,
): { group: CategoryGroup; categories: CategoryDefinition[] } => {
  const memberIds = new Set(group.categoryIds);
  if (!enabled) {
    const suspendedCategoryIds = categories
      .filter((category) => memberIds.has(category.id) && !category.enabled)
      .map((category) => category.id);
    return {
      group: {
        ...group,
        enabled: false,
        expanded: false,
        suspendedCategoryIds,
      },
      categories: categories.map((category) =>
        memberIds.has(category.id) ? { ...category, enabled: false } : category,
      ),
    };
  }
  const suspended = new Set(group.suspendedCategoryIds ?? []);
  return {
    group: { ...group, enabled: true, suspendedCategoryIds: undefined },
    categories: categories.map((category) =>
      memberIds.has(category.id)
        ? { ...category, enabled: !suspended.has(category.id) }
        : category,
    ),
  };
};

export const normalizeGroups = (
  groups: CategoryGroup[] | null | undefined,
  categories: CategoryDefinition[],
): CategoryGroup[] => {
  if (!groups?.length) return [createDefaultGroup(categories)];
  const knownIds = new Set(categories.map((category) => category.id));
  const normalized = groups.map((group) => ({
    ...group,
    categoryIds: group.categoryIds.filter((id) => knownIds.has(id)),
    expanded: group.enabled === false ? false : group.expanded,
    suspendedCategoryIds: group.suspendedCategoryIds?.filter((id) =>
      knownIds.has(id),
    ),
  }));
  const assigned = new Set(normalized.flatMap((group) => group.categoryIds));
  const missing = categories
    .map((category) => category.id)
    .filter((id) => !assigned.has(id));
  if (missing.length) normalized[0].categoryIds.push(...missing);
  return normalized;
};
