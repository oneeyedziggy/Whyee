import { createDefaultCategory } from '../src/lib/category';
import {
  createDefaultGroup,
  isGroupEnabled,
  normalizeGroups,
  setGroupEnabled,
} from '../src/lib/groups';
import type { CategoryGroup } from '../src/types/category';

const makeCategories = () => {
  const first = { ...createDefaultCategory('number', 0, 'First'), id: 'first' };
  const second = {
    ...createDefaultCategory('number', 1, 'Second'),
    id: 'second',
    enabled: false,
  };
  const outside = {
    ...createDefaultCategory('number', 2, 'Outside'),
    id: 'outside',
  };
  return [first, second, outside];
};

const makeGroup = (): CategoryGroup => ({
  id: 'custom',
  name: 'Custom',
  categoryIds: ['first', 'second'],
  expanded: true,
});

describe('category group enablement', () => {
  it('treats a group without an explicit flag as enabled', () => {
    expect(isGroupEnabled(makeGroup())).toBe(true);
    expect(isGroupEnabled(createDefaultGroup([]))).toBe(true);
    expect(isGroupEnabled({ ...makeGroup(), enabled: false })).toBe(false);
  });

  it('disables every member, collapses the group, and banks prior states', () => {
    const categories = makeCategories();
    const next = setGroupEnabled(makeGroup(), categories, false);

    expect(next.group).toMatchObject({
      enabled: false,
      expanded: false,
      suspendedCategoryIds: ['second'],
    });
    expect(next.categories.map((category) => category.enabled)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('restores each member to its own state when re-enabled', () => {
    const categories = makeCategories();
    const disabled = setGroupEnabled(makeGroup(), categories, false);
    const restored = setGroupEnabled(disabled.group, disabled.categories, true);

    expect(restored.group.enabled).toBe(true);
    expect(restored.group.suspendedCategoryIds).toBeUndefined();
    expect(restored.categories.map((category) => category.enabled)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('restores banked states that were persisted across a session boundary', () => {
    const categories = makeCategories();
    const disabled = setGroupEnabled(makeGroup(), categories, false);
    // Round-trip through storage, then re-hydrate exactly as a fresh launch would.
    const rehydrated = JSON.parse(
      JSON.stringify({
        groups: [disabled.group],
        categories: disabled.categories,
      }),
    ) as { groups: CategoryGroup[]; categories: typeof categories };
    const groups = normalizeGroups(rehydrated.groups, rehydrated.categories);

    expect(groups[0]).toMatchObject({
      enabled: false,
      expanded: false,
      suspendedCategoryIds: ['second'],
    });

    const restored = setGroupEnabled(groups[0], rehydrated.categories, true);

    expect(restored.categories.map((category) => category.enabled)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('keeps a disabled group collapsed and drops unknown banked ids on normalize', () => {
    const categories = makeCategories();
    const groups = normalizeGroups(
      [
        {
          ...makeGroup(),
          enabled: false,
          expanded: true,
          suspendedCategoryIds: ['second', 'deleted'],
        },
      ],
      categories,
    );

    expect(groups[0].expanded).toBe(false);
    expect(groups[0].suspendedCategoryIds).toEqual(['second']);
  });
});

describe('normalizeGroups', () => {
  it('falls back to one default group holding every category when none are stored', () => {
    const categories = makeCategories();
    for (const stored of [null, undefined, []]) {
      expect(normalizeGroups(stored, categories)).toEqual([
        createDefaultGroup(categories),
      ]);
    }
  });

  it('drops deleted ids and assigns unassigned categories to the first group', () => {
    const categories = makeCategories();
    const groups = normalizeGroups(
      [
        { id: 'a', name: 'A', categoryIds: ['first', 'deleted'], expanded: true },
        { id: 'b', name: 'B', categoryIds: ['second'], expanded: false },
      ],
      categories,
    );

    expect(groups.map((group) => group.categoryIds)).toEqual([
      ['first', 'outside'],
      ['second'],
    ]);
    expect(groups[0].suspendedCategoryIds).toBeUndefined();
  });

  it('leaves fully assigned groups untouched', () => {
    const categories = makeCategories();
    const groups = normalizeGroups(
      [{ ...makeGroup(), categoryIds: ['first', 'second', 'outside'] }],
      categories,
    );
    expect(groups[0].categoryIds).toEqual(['first', 'second', 'outside']);
  });

  it('re-enables every member of a group that never banked any states', () => {
    const categories = makeCategories().map((category) => ({
      ...category,
      enabled: false,
    }));
    const restored = setGroupEnabled(makeGroup(), categories, true);
    expect(restored.categories.map((category) => category.enabled)).toEqual([
      true,
      true,
      false,
    ]);
  });
});
