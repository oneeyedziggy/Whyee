import {
  createWorkspaceId,
  isDuplicateWorkspaceName,
  moveWorkspace,
  normalizeWorkspace,
  visibleWorkspaces,
} from '../src/lib/workspaces';
import type { WorkspaceMeta } from '../src/types/workspace';

const ws = (id: string, extra: Partial<WorkspaceMeta> = {}): WorkspaceMeta => ({
  id,
  name: id.toUpperCase(),
  ...extra,
});

describe('createWorkspaceId', () => {
  it('slugifies names into the archive-safe charset', () => {
    expect(createWorkspaceId('  My Work/Space!  ', [])).toBe('my-work-space');
    expect(createWorkspaceId('sleep_log-2', [])).toBe('sleep_log-2');
  });

  it('falls back to "workspace" when nothing printable remains', () => {
    expect(createWorkspaceId('', [])).toBe('workspace');
    expect(createWorkspaceId(' ??? ', [])).toBe('workspace');
  });

  it('appends the first free numeric suffix on collisions', () => {
    expect(createWorkspaceId('Home', ['home'])).toBe('home-2');
    expect(createWorkspaceId('Home', ['home', 'home-2', 'home-3'])).toBe(
      'home-4',
    );
    expect(createWorkspaceId('Home', ['home-2'])).toBe('home');
  });
});

describe('normalizeWorkspace / visibleWorkspaces', () => {
  it('fills missing notes and hidden flags without overriding stored ones', () => {
    expect(normalizeWorkspace(ws('a'))).toEqual({
      id: 'a',
      name: 'A',
      notes: '',
      hidden: false,
    });
    expect(normalizeWorkspace(ws('b', { notes: 'n', hidden: true }))).toEqual({
      id: 'b',
      name: 'B',
      notes: 'n',
      hidden: true,
    });
  });

  it('filters hidden workspaces', () => {
    expect(
      visibleWorkspaces([ws('a'), ws('b', { hidden: true }), ws('c', { hidden: false })]).map(
        (workspace) => workspace.id,
      ),
    ).toEqual(['a', 'c']);
  });
});

describe('isDuplicateWorkspaceName', () => {
  const workspaces = [ws('a', { name: 'Home ' }), ws('b', { name: 'Work' })];

  it('matches names case- and whitespace-insensitively', () => {
    expect(isDuplicateWorkspaceName(workspaces, ' home')).toBe(true);
    expect(isDuplicateWorkspaceName(workspaces, 'Gym')).toBe(false);
  });

  it('ignores the workspace being renamed', () => {
    expect(isDuplicateWorkspaceName(workspaces, 'HOME', 'a')).toBe(false);
    expect(isDuplicateWorkspaceName(workspaces, 'HOME', 'b')).toBe(true);
  });
});

describe('moveWorkspace', () => {
  const list = [ws('a'), ws('b'), ws('c'), ws('d')];
  const ids = (items: WorkspaceMeta[]) => items.map((item) => item.id);

  it('moves forward and backward using boundary indices', () => {
    expect(ids(moveWorkspace(list, 0, 2))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(moveWorkspace(list, 0, 4))).toEqual(['b', 'c', 'd', 'a']);
    expect(ids(moveWorkspace(list, 3, 0))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('clamps out-of-range targets', () => {
    expect(ids(moveWorkspace(list, 1, 99))).toEqual(['a', 'c', 'd', 'b']);
    expect(ids(moveWorkspace(list, 2, -5))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('returns the same list for no-op or invalid moves', () => {
    expect(moveWorkspace(list, 1, 1)).toBe(list);
    expect(moveWorkspace(list, 1, 2)).toBe(list);
    expect(moveWorkspace(list, -1, 0)).toBe(list);
    expect(moveWorkspace(list, 4, 0)).toBe(list);
    expect(ids(list)).toEqual(['a', 'b', 'c', 'd']);
  });
});
