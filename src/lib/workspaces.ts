import type { WorkspaceMeta } from '../types/workspace';

// Ids end up in export archive paths, so keep them to the safe transfer charset.
const unsafeIdChars = /[^A-Za-z0-9_-]+/g;

export const createWorkspaceId = (
  name: string,
  existingIds: string[],
): string => {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(unsafeIdChars, '-')
      .replace(/^-+|-+$/g, '') || 'workspace';
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export const normalizeWorkspace = (
  workspace: WorkspaceMeta,
): WorkspaceMeta => ({
  ...workspace,
  notes: workspace.notes ?? '',
  hidden: workspace.hidden ?? false,
});

export const visibleWorkspaces = (
  workspaces: WorkspaceMeta[],
): WorkspaceMeta[] => workspaces.filter((workspace) => !workspace.hidden);

export const isDuplicateWorkspaceName = (
  workspaces: WorkspaceMeta[],
  name: string,
  ignoreId = '',
): boolean => {
  const candidate = name.trim().toLowerCase();
  return workspaces.some(
    (workspace) =>
      workspace.id !== ignoreId &&
      workspace.name.trim().toLowerCase() === candidate,
  );
};

// `to` is a boundary index within the original list, matching the drag handler.
export const moveWorkspace = (
  workspaces: WorkspaceMeta[],
  from: number,
  to: number,
): WorkspaceMeta[] => {
  if (from < 0 || from >= workspaces.length) return workspaces;
  const target = Math.max(0, Math.min(to, workspaces.length));
  const insertAt = target > from ? target - 1 : target;
  if (insertAt === from) return workspaces;
  const next = [...workspaces];
  const [moved] = next.splice(from, 1);
  next.splice(insertAt, 0, moved);
  return next;
};
