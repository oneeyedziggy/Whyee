import { strFromU8, unzipSync } from 'fflate';
import {
  buildImportPlan,
  createTransferArchives,
  createTransferBundle,
  parseTransferArchive,
  remapImportedWorkspaces,
  resolveDefaultImportTarget,
} from '../src/lib/dataTransfer';
import type { WorkspaceTransferSnapshot } from '../src/types/dataTransfer';

const workspace: WorkspaceTransferSnapshot = {
  id: 'user',
  name: 'User',
  categories: [
    {
      id: 'category-mood',
      name: 'Mood',
      nameSequence: 1,
      kind: 'number',
      enabled: true,
      notesEnabled: false,
      sentimentEnabled: false,
      correlateWithinGroup: false,
      allowMultiplePerDay: false,
      mainAggregation: 'mean',
      virtualSeries: [],
      weeklyEffectEnabled: false,
      range: { min: 0, max: 10, step: 1 },
    },
  ],
  groups: [
    {
      id: 'default-group',
      name: 'General',
      categoryIds: ['category-mood'],
      expanded: true,
    },
  ],
  records: {
    '2026-09-16:0:category-mood': {
      key: '2026-09-16:0:category-mood',
      categoryId: 'category-mood',
      dateKey: '2026-09-16',
      ordinal: 0,
      localTime: '12:34:56',
      value: 8,
      noteText: 'steady',
    },
  },
};

const globals = {
  analysisSettings: {
    correlationOffset: 7,
    topCorrelationThreshold: 0.7,
    summaryLookback: 14,
    statisticsSettings: { 'chart.section': true },
  },
  appPreferences: { activeWorkspaceId: 'user', categoryIndexExpanded: true },
};

const selection = {
  workspaces: {
    user: { categoriesAndGroups: true, loggedData: true },
  },
  analysisSettings: true,
  appPreferences: true,
};

describe('Whyee data transfer archives', () => {
  it('round-trips a combined ZIP without changing data', () => {
    const bundle = createTransferBundle(
      [workspace],
      globals,
      selection,
      '2026-09-16T12:00:00.000Z',
    );
    const [archive] = createTransferArchives(bundle, 'combined', true);

    expect(archive.fileName).toBe('Whyee.config.zip');
    expect(
      parseTransferArchive(archive.fileName, archive.bytes).bundle,
    ).toEqual(bundle);
  });

  it('writes selected groups as separate JSON entries in one ZIP', () => {
    const bundle = createTransferBundle(
      [workspace],
      globals,
      selection,
      '2026-09-16T12:00:00.000Z',
    );
    const [archive] = createTransferArchives(bundle, 'individual', true);
    const files = unzipSync(archive.bytes);

    expect(Object.keys(files).sort()).toEqual([
      'globals/analysis-settings.json',
      'globals/app-preferences.json',
      'manifest.json',
      'workspaces/user/categories-groups.json',
      'workspaces/user/logged-data.json',
    ]);
    expect(
      JSON.parse(strFromU8(files['workspaces/user/logged-data.json'])),
    ).toEqual(expect.objectContaining({ records: workspace.records }));
    expect(
      parseTransferArchive(archive.fileName, archive.bytes).bundle,
    ).toEqual(bundle);
  });

  it('makes every unzipped individual JSON file independently importable', () => {
    const bundle = createTransferBundle(
      [workspace],
      globals,
      selection,
      '2026-09-16T12:00:00.000Z',
    );
    const archives = createTransferArchives(bundle, 'individual', false);

    expect(archives.map((archive) => archive.fileName)).toEqual([
      'Whyee.user.categories-groups.config.json',
      'Whyee.user.logged-data.config.json',
      'Whyee.analysis-settings.config.json',
      'Whyee.app-preferences.config.json',
    ]);
    for (const archive of archives) {
      expect(
        parseTransferArchive(archive.fileName, archive.bytes).bundle.format,
      ).toBe('whyee-config');
    }
  });

  it('rejects bad names and broken record references', () => {
    const bundle = createTransferBundle([workspace], globals, selection);
    expect(() =>
      parseTransferArchive(
        'backup.zip',
        createTransferArchives(bundle)[0].bytes,
      ),
    ).toThrow('Whyee.*.config');

    const broken = structuredClone(bundle);
    broken.workspaces[0].records!['2026-09-16:0:category-mood'].categoryId =
      'category-other';
    expect(() => createTransferArchives(broken)).toThrow('logged-data key');
  });

  it('plans imported-wins merge conflicts without mutating local data', () => {
    const local = structuredClone(workspace);
    const incoming = structuredClone(workspace);
    incoming.categories[0].name = 'Imported mood';
    incoming.records['2026-09-16:0:category-mood'].value = 3;
    const bundle = createTransferBundle([incoming], globals, selection);

    const plan = buildImportPlan([local], globals, bundle, 'merge', 'imported');

    expect(plan.conflicts.map((conflict) => conflict.section)).toEqual([
      'category',
      'record',
    ]);
    expect(plan.conflicts[0].changedFields).toEqual(['name']);
    expect(plan.workspaces[0].categories[0].name).toBe('Imported mood');
    expect(plan.workspaces[0].records['2026-09-16:0:category-mood'].value).toBe(
      3,
    );
    expect(local.categories[0].name).toBe('Mood');
  });

  it('uses per-conflict decisions and overwrites only included sections', () => {
    const incoming = structuredClone(workspace);
    incoming.categories[0].name = 'Imported mood';
    incoming.records['2026-09-16:0:category-mood'].value = 3;
    const bundle = createTransferBundle([incoming], globals, selection);
    const categoryConflictId = 'user:category:category-mood';
    const mergePlan = buildImportPlan(
      [workspace],
      globals,
      bundle,
      'merge',
      'local',
      { [categoryConflictId]: 'imported' },
    );
    expect(mergePlan.workspaces[0].categories[0].name).toBe('Imported mood');
    expect(
      mergePlan.workspaces[0].records['2026-09-16:0:category-mood'].value,
    ).toBe(8);

    const recordsOnly = createTransferBundle([incoming], globals, {
      ...selection,
      workspaces: { user: { categoriesAndGroups: false, loggedData: true } },
      analysisSettings: false,
      appPreferences: false,
    });
    const overwritePlan = buildImportPlan(
      [workspace],
      globals,
      recordsOnly,
      'overwrite',
    );
    expect(overwritePlan.workspaces[0].categories).toEqual(
      workspace.categories,
    );
    expect(overwritePlan.workspaces[0].records).toEqual(incoming.records);
  });

  it('round-trips workspace notes and hidden state, including new workspaces', () => {
    const noted: WorkspaceTransferSnapshot = {
      ...structuredClone(workspace),
      notes: 'Sleep experiments',
      hidden: true,
    };
    const extra: WorkspaceTransferSnapshot = {
      ...structuredClone(workspace),
      id: 'sleep',
      name: 'Sleep',
      notes: 'Only for naps',
      hidden: false,
    };
    const bundle = createTransferBundle([noted, extra], globals, {
      ...selection,
      workspaces: {
        user: { categoriesAndGroups: true, loggedData: true },
        sleep: { categoriesAndGroups: true, loggedData: true },
      },
    });
    const [zipped] = createTransferArchives(bundle, 'individual', true);

    expect(parseTransferArchive(zipped.fileName, zipped.bytes).bundle).toEqual(
      bundle,
    );

    const plan = buildImportPlan([workspace], globals, bundle, 'overwrite');
    expect(plan.workspaces[0].notes).toBe('Sleep experiments');
    expect(plan.workspaces[0].hidden).toBe(true);
    expect(plan.workspaces[1]).toEqual(
      expect.objectContaining({
        id: 'sleep',
        name: 'Sleep',
        notes: 'Only for naps',
        hidden: false,
      }),
    );
  });
});

describe('import workspace target resolution', () => {
  it('defaults to id match, then name match, then new', () => {
    const local: WorkspaceTransferSnapshot[] = [
      { ...workspace, id: 'user', name: 'User' },
      { ...workspace, id: 'other', name: 'Vacation' },
    ];

    expect(
      resolveDefaultImportTarget({ id: 'user', name: 'Anything' }, local),
    ).toBe('user');
    expect(
      resolveDefaultImportTarget({ id: 'unknown', name: 'vacation' }, local),
    ).toBe('other');
    expect(
      resolveDefaultImportTarget({ id: 'unknown', name: 'Nope' }, local),
    ).toBe('new');
  });

  it('remaps an imported workspace onto the chosen existing target', () => {
    const local: WorkspaceTransferSnapshot[] = [
      { ...workspace, id: 'user', name: 'User' },
      { ...workspace, id: 'vacation-2020', name: 'Vacation' },
    ];
    const bundle = createTransferBundle([workspace], globals, selection);

    const remapped = remapImportedWorkspaces(
      bundle,
      { [workspace.id]: 'vacation-2020' },
      local,
    );

    expect(remapped.workspaces[0].id).toBe('vacation-2020');
    expect(remapped.workspaces[0].name).toBe('Vacation');
  });

  it('keeps the imported id/name for "new" and dedupes collisions', () => {
    const local: WorkspaceTransferSnapshot[] = [
      { ...workspace, id: 'other', name: 'Other' },
    ];
    const bundle = createTransferBundle([workspace], globals, selection);

    const remapped = remapImportedWorkspaces(
      bundle,
      { [workspace.id]: 'new' },
      local,
    );
    expect(remapped.workspaces[0].id).toBe(workspace.id);

    const collidingLocal: WorkspaceTransferSnapshot[] = [
      { ...workspace, id: workspace.id, name: 'Existing' },
    ];
    const dedupedRemapped = remapImportedWorkspaces(
      bundle,
      { [workspace.id]: 'new' },
      collidingLocal,
    );
    expect(dedupedRemapped.workspaces[0].id).toBe(`${workspace.id}-2`);
  });
});
