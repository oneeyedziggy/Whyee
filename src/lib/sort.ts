export type SortDirection = 'asc' | 'desc' | 'default';

export const nextSortDirection = (current: SortDirection): SortDirection =>
  current === 'asc' ? 'desc' : current === 'desc' ? 'default' : 'asc';

export const compareValues = (
  left: number | string | null,
  right: number | string | null,
): number => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right);
  }
  return Number(left) - Number(right);
};
