export type SortDirection = 'asc' | 'desc' | 'default';

export const nextSortDirection = (current: SortDirection): SortDirection =>
  current === 'asc' ? 'desc' : current === 'desc' ? 'default' : 'asc';

export const compareValues = (
  left: number | string | null,
  right: number | string | null,
  direction: Exclude<SortDirection, 'default'> = 'asc',
): number => {
  // Empty values stay last regardless of direction.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result =
    typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right)
      : Number(left) - Number(right);
  return direction === 'asc' ? result : -result;
};
