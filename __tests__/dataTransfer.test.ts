import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  buildImportPlan,
  createTransferArchives,
  createTransferBundle,
  parseTransferArchive,
  remapImportedWorkspaces,
  resolveDefaultImportTarget,
  validateTransferBundle,
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

describe('Whyee data transfer validation and edge cases', () => {
  const baseBundle = () =>
    createTransferBundle([workspace], globals, selection, '2026-09-16T12:00:00.000Z');
  const bytesOf = (value: unknown) => strToU8(JSON.stringify(value));
  const zipOf = (files: Record<string, unknown>) =>
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, value]) => [
          path,
          value instanceof Uint8Array ? value : bytesOf(value),
        ]),
      ),
    );
  const manifest = (layout: string = 'individual') => ({
    format: 'whyee-config',
    version: baseBundle().version,
    exportedAt: '2026-09-16T12:00:00.000Z',
    layout,
  });
  const parseZip = (files: Record<string, unknown>) =>
    parseTransferArchive('Whyee.config.zip', zipOf(files));

  describe('bundle and archive creation', () => {
    it('omits unselected workspaces, sections, and globals', () => {
      const other = { ...structuredClone(workspace), id: 'other', name: 'Other' };
      const bundle = createTransferBundle(
        [workspace, other],
        globals,
        {
          workspaces: {
            user: { categoriesAndGroups: true, loggedData: false },
            other: { categoriesAndGroups: false, loggedData: false },
          },
          analysisSettings: false,
          appPreferences: false,
        },
        '2026-09-16T12:00:00.000Z',
      );
      expect(bundle.workspaces).toEqual([
        {
          id: 'user',
          name: 'User',
          categories: workspace.categories,
          groups: workspace.groups,
        },
      ]);
      expect(bundle.globals).toEqual({});

      const [zipped] = createTransferArchives(bundle, 'individual', true);
      expect(Object.keys(unzipSync(zipped.bytes)).sort()).toEqual([
        'manifest.json',
        'workspaces/user/categories-groups.json',
      ]);
      expect(
        createTransferArchives(bundle, 'individual', false).map(
          (archive) => archive.fileName,
        ),
      ).toEqual(['Whyee.user.categories-groups.config.json']);
    });

    it('writes records-only workspaces without a categories file', () => {
      const bundle = createTransferBundle(
        [{ ...structuredClone(workspace), notes: 'Notes', hidden: true }],
        globals,
        {
          workspaces: { user: { categoriesAndGroups: false, loggedData: true } },
          analysisSettings: false,
          appPreferences: false,
        },
      );
      const [zipped] = createTransferArchives(bundle, 'individual', true);
      expect(Object.keys(unzipSync(zipped.bytes)).sort()).toEqual([
        'manifest.json',
        'workspaces/user/logged-data.json',
      ]);
      expect(parseTransferArchive(zipped.fileName, zipped.bytes).bundle).toEqual(
        bundle,
      );
      const files = createTransferArchives(bundle, 'individual', false);
      expect(files.map((archive) => archive.fileName)).toEqual([
        'Whyee.user.logged-data.config.json',
      ]);
      expect(
        parseTransferArchive(files[0].fileName, files[0].bytes).bundle.workspaces,
      ).toEqual([
        { id: 'user', name: 'User', notes: 'Notes', hidden: true, records: workspace.records },
      ]);
    });

    it('carries notes and hidden flags into individual category files', () => {
      const bundle = createTransferBundle(
        [{ ...structuredClone(workspace), notes: 'Notes', hidden: true }],
        globals,
        selection,
      );
      const [categoriesFile] = createTransferArchives(bundle, 'individual', false);
      expect(
        parseTransferArchive(categoriesFile.fileName, categoriesFile.bytes).bundle
          .workspaces[0],
      ).toEqual(
        expect.objectContaining({ notes: 'Notes', hidden: true }),
      );
    });

    it('writes a combined plain JSON file that parses back unchanged', () => {
      const bundle = baseBundle();
      const archives = createTransferArchives(bundle, 'combined', false);
      expect(archives).toHaveLength(1);
      expect(archives[0]).toMatchObject({
        fileName: 'Whyee.config.json',
        mimeType: 'application/json',
      });
      expect(
        parseTransferArchive(archives[0].fileName, archives[0].bytes).bundle,
      ).toEqual(bundle);
    });
  });

  describe('parseTransferArchive', () => {
    it.each([
      ['empty', new Uint8Array()],
      ['too large', new Uint8Array(50 * 1024 * 1024 + 1)],
    ])('rejects %s files', (_label, bytes) => {
      expect(() => parseTransferArchive('Whyee.config.json', bytes)).toThrow(
        'empty or too large',
      );
    });

    it('rejects invalid JSON and non-Whyee bundles', () => {
      expect(() =>
        parseTransferArchive('Whyee.config.json', strToU8('{nope')),
      ).toThrow('Whyee.config.json is not valid JSON.');
      expect(() =>
        parseTransferArchive('Whyee.config.json', bytesOf([1, 2])),
      ).toThrow('not a Whyee configuration export');
      expect(() =>
        parseTransferArchive(
          'Whyee.config.json',
          bytesOf({ ...baseBundle(), format: 'other' }),
        ),
      ).toThrow('not a Whyee configuration export');
      expect(() =>
        parseTransferArchive(
          'Whyee.config.json',
          bytesOf({ ...baseBundle(), version: 99 }),
        ),
      ).toThrow('Unsupported Whyee configuration version: 99.');
    });

    it.each([
      ['exportedAt', { exportedAt: 5 }],
      ['workspaces', { workspaces: {} }],
      ['globals', { globals: [] }],
    ])('rejects a bundle with malformed %s', (_field, override) => {
      expect(() =>
        parseTransferArchive(
          'Whyee.config.json',
          bytesOf({ ...baseBundle(), ...override }),
        ),
      ).toThrow('manifest is incomplete');
    });

    it('rejects corrupt ZIPs and ZIPs without a valid manifest', () => {
      expect(() =>
        parseTransferArchive('Whyee.config.zip', strToU8('not a zip')),
      ).toThrow('corrupt or unsupported');
      expect(() => parseZip({ 'other.json': {} })).toThrow('no Whyee manifest');
      expect(() => parseZip({ 'manifest.json': manifest('flat') })).toThrow(
        'invalid Whyee manifest',
      );
      expect(() => parseZip({ 'manifest.json': [] })).toThrow(
        'invalid Whyee manifest',
      );
    });

    it('rejects ZIPs that expand beyond the supported size', () => {
      // A namespace import is an interop copy; spy on the shared CommonJS module instead.
      const fflate = jest.requireActual<typeof import('fflate')>('fflate');
      const unzip = jest
        .spyOn(fflate, 'unzipSync')
        .mockReturnValue({
          'manifest.json': { byteLength: 100 * 1024 * 1024 + 1 },
        } as unknown as ReturnType<typeof fflate.unzipSync>);
      try {
        expect(() =>
          parseTransferArchive('Whyee.config.zip', strToU8('zip')),
        ).toThrow('expands beyond the supported size');
      } finally {
        unzip.mockRestore();
      }
    });

    it('rejects a combined ZIP missing its bundle file', () => {
      expect(() => parseZip({ 'manifest.json': manifest('combined') })).toThrow(
        'Whyee.config.json is not valid JSON.',
      );
    });

    it.each([
      ['workspaces/../escape.json', 'unsafe file path'],
      ['/root.json', 'unsafe file path'],
      ['\\root.json', 'unsafe file path'],
      ['notes.txt', 'Unexpected file in Whyee archive: notes.txt.'],
    ])('rejects archive entry %p', (path, message) => {
      expect(() =>
        parseZip({ 'manifest.json': manifest(), [path]: {} }),
      ).toThrow(message);
    });

    it.each([
      [{ id: 'other', name: 'User', records: {} }, 'does not match its workspace'],
      [{ id: 'user', records: {} }, 'does not match its workspace'],
      [['user'], 'does not match its workspace'],
      [{ id: 'user', name: 'User', records: [] }, 'is missing records'],
    ])('rejects malformed logged-data file %#', (value, message) => {
      expect(() =>
        parseZip({
          'manifest.json': manifest(),
          'workspaces/user/logged-data.json': value,
        }),
      ).toThrow(message);
    });

    it('rejects category files without both categories and groups', () => {
      expect(() =>
        parseZip({
          'manifest.json': manifest(),
          'workspaces/user/categories-groups.json': {
            id: 'user',
            name: 'User',
            categories: [],
          },
        }),
      ).toThrow('is missing categories or groups');
    });
  });

  describe('validateTransferBundle', () => {
    const invalid = (
      mutate: (bundle: ReturnType<typeof baseBundle>) => void,
      message: string,
    ) => {
      const bundle = structuredClone(baseBundle());
      mutate(bundle);
      expect(() => validateTransferBundle(bundle)).toThrow(message);
    };
    type Bundle = ReturnType<typeof baseBundle>;
    const space = (bundle: Bundle) => bundle.workspaces[0];

    it('accepts legacy categories without virtual series and valid references', () => {
      const bundle = structuredClone(baseBundle());
      delete (space(bundle).categories![0] as { virtualSeries?: unknown })
        .virtualSeries;
      expect(() => validateTransferBundle(bundle)).not.toThrow();
      space(bundle).categories![0].virtualSeries = [
        {
          id: 'category-mood:value',
          name: 'Mood',
          sourceCategoryId: 'category-mood',
          field: 'value',
          aggregation: 'mean',
        },
      ];
      expect(() => validateTransferBundle(bundle)).not.toThrow();
    });

    it.each<[string, (bundle: Bundle) => void, string]>([
      ['an unsafe id', (b) => { space(b).id = 'bad id'; }, 'safe ID and a name'],
      ['a blank name', (b) => { space(b).name = '  '; }, 'safe ID and a name'],
      ['non-string notes', (b) => { (space(b) as { notes?: unknown }).notes = 5; }, 'invalid workspace details'],
      ['non-boolean hidden', (b) => { (space(b) as { hidden?: unknown }).hidden = 'yes'; }, 'invalid workspace details'],
      ['duplicate workspaces', (b) => { b.workspaces.push(structuredClone(space(b))); }, 'Duplicate workspace ID: user.'],
      ['categories without groups', (b) => { delete space(b).groups; }, 'categories and groups together'],
      ['groups without categories', (b) => { delete space(b).categories; }, 'categories and groups together'],
      ['a duplicate category', (b) => { space(b).categories!.push(structuredClone(space(b).categories![0])); }, 'missing or duplicate category ID'],
      ['a category without id', (b) => { space(b).categories![0].id = ''; }, 'missing or duplicate category ID'],
      ['a null category', (b) => { (space(b).categories as unknown[]).push(null); }, 'missing or duplicate category ID'],
      ['a foreign virtual series', (b) => {
        space(b).categories![0].virtualSeries = [
          { id: 'x', name: 'X', sourceCategoryId: 'elsewhere', field: 'value', aggregation: 'mean' },
        ];
      }, 'Mood contains an invalid virtual-series reference.'],
      ['a duplicate group', (b) => { space(b).groups!.push(structuredClone(space(b).groups![0])); }, 'missing or duplicate group ID'],
      ['a null group', (b) => { (space(b).groups as unknown[]).push(null); }, 'missing or duplicate group ID'],
      ['a group with an unknown category', (b) => { space(b).groups![0].categoryIds.push('ghost'); }, 'General references a category not included in User.'],
      ['a record key mismatch', (b) => {
        const records = space(b).records!;
        records.renamed = records['2026-09-16:0:category-mood'];
        delete records['2026-09-16:0:category-mood'];
      }, 'invalid logged-data key'],
      ['a record for an unknown category', (b) => {
        const record = { ...space(b).records!['2026-09-16:0:category-mood'], categoryId: 'ghost', key: '2026-09-16:0:ghost' };
        space(b).records = { [record.key]: record };
      }, 'logged data for an unknown category'],
    ])('rejects %s', (_label, mutate, message) => invalid(mutate, message));

    it('allows records for categories outside a records-only workspace', () => {
      const bundle = structuredClone(baseBundle());
      delete space(bundle).categories;
      delete space(bundle).groups;
      expect(() => validateTransferBundle(bundle)).not.toThrow();
    });

    it.each([
      ['correlationOffset', Number.NaN],
      ['correlationOffset', -1],
      ['correlationOffset', 367],
      ['topCorrelationThreshold', Number.POSITIVE_INFINITY],
      ['topCorrelationThreshold', -0.1],
      ['topCorrelationThreshold', 1.1],
      ['summaryLookback', Number.NaN],
      ['summaryLookback', 0],
      ['summaryLookback', 367],
    ])('rejects analysis setting %s = %p', (field, value) => {
      invalid((bundle) => {
        (bundle.globals.analysisSettings as unknown as Record<string, unknown>)[
          field
        ] = value;
      }, 'analysis settings outside supported ranges');
    });

    it('accepts analysis settings on the range boundaries', () => {
      const bundle = structuredClone(baseBundle());
      Object.assign(bundle.globals.analysisSettings!, {
        correlationOffset: 366,
        topCorrelationThreshold: 1,
        summaryLookback: 1,
      });
      expect(() => validateTransferBundle(bundle)).not.toThrow();
      Object.assign(bundle.globals.analysisSettings!, {
        correlationOffset: 0,
        topCorrelationThreshold: 0,
        summaryLookback: 366,
      });
      expect(() => validateTransferBundle(bundle)).not.toThrow();
    });

    it.each([
      [{ activeWorkspaceId: 5, categoryIndexExpanded: true }],
      [{ activeWorkspaceId: '', categoryIndexExpanded: true }],
      [{ activeWorkspaceId: 'user', categoryIndexExpanded: 'yes' }],
    ])('rejects invalid app preferences %#', (preferences) => {
      invalid((bundle) => {
        bundle.globals.appPreferences = preferences as never;
      }, 'invalid app preferences');
    });
  });

  describe('buildImportPlan', () => {
    const key = '2026-09-16:0:category-mood';

    it('leaves untouched local workspaces and missing sections as they are', () => {
      const other = { ...structuredClone(workspace), id: 'other', name: 'Other' };
      const recordsOnly = createTransferBundle([workspace], globals, {
        workspaces: { user: { categoriesAndGroups: false, loggedData: true } },
        analysisSettings: false,
        appPreferences: false,
      });
      const merged = buildImportPlan([workspace, other], globals, recordsOnly, 'merge');
      expect(merged.workspaces[1]).toBe(other);
      expect(merged.workspaces[0].categories).toBe(workspace.categories);
      expect(merged.workspaces[0].groups).toBe(workspace.groups);
      expect(merged.globals).toBe(globals);
      expect(merged.conflicts).toEqual([]);

      const categoriesOnly = createTransferBundle([workspace], globals, {
        workspaces: { user: { categoriesAndGroups: true, loggedData: false } },
        analysisSettings: false,
        appPreferences: false,
      });
      expect(
        buildImportPlan([workspace], globals, categoriesOnly, 'merge').workspaces[0]
          .records,
      ).toBe(workspace.records);
      expect(
        buildImportPlan([workspace], globals, categoriesOnly, 'overwrite')
          .workspaces[0].records,
      ).toBe(workspace.records);
    });

    it('keeps local-only categories when merging', () => {
      const local = structuredClone(workspace);
      local.categories.push({ ...local.categories[0], id: 'category-local' });
      const plan = buildImportPlan(
        [local],
        globals,
        createTransferBundle([workspace], globals, selection),
        'merge',
      );
      expect(plan.workspaces[0].categories.map((category) => category.id)).toEqual(
        ['category-mood', 'category-local'],
      );
    });

    it('adds new records and keeps identical ones without conflicts', () => {
      const incoming = structuredClone(workspace);
      const added = {
        ...incoming.records[key],
        key: '2026-09-17:0:category-mood',
        dateKey: '2026-09-17',
      };
      incoming.records[added.key] = added;
      const plan = buildImportPlan(
        [workspace],
        globals,
        createTransferBundle([incoming], globals, selection),
        'merge',
      );
      expect(plan.conflicts).toEqual([]);
      expect(Object.keys(plan.workspaces[0].records).sort()).toEqual([
        key,
        added.key,
      ]);
    });

    it('labels item conflicts by imported name, then local name, then id', () => {
      const local = structuredClone(workspace);
      const incoming = structuredClone(workspace);
      incoming.categories[0] = { ...incoming.categories[0], name: '', enabled: false };
      incoming.groups[0] = { ...incoming.groups[0], name: '', expanded: false };
      local.groups[0].name = '';
      const plan = buildImportPlan(
        [local],
        globals,
        createTransferBundle([incoming], globals, selection),
        'merge',
      );
      expect(
        plan.conflicts.map((conflict) => [conflict.section, conflict.label]),
      ).toEqual([
        ['category', 'Mood'],
        ['group', 'default-group'],
      ]);
      expect(plan.conflicts[1].changedFields).toEqual(['expanded']);
    });

    it('merges differing global settings field by field', () => {
      const importedGlobals = {
        analysisSettings: { ...globals.analysisSettings, correlationOffset: 3 },
        appPreferences: { ...globals.appPreferences, categoryIndexExpanded: false },
      };
      const bundle = createTransferBundle([], importedGlobals, {
        workspaces: {},
        analysisSettings: true,
        appPreferences: true,
      });
      const plan = buildImportPlan([workspace], globals, bundle, 'merge', 'local', {
        'global:appPreferences:categoryIndexExpanded': 'imported',
      });
      expect(
        plan.conflicts.map((conflict) => [conflict.id, conflict.changedFields]),
      ).toEqual([
        ['global:analysisSettings:correlationOffset', ['value']],
        ['global:appPreferences:categoryIndexExpanded', ['value']],
      ]);
      expect(plan.globals.analysisSettings.correlationOffset).toBe(7);
      expect(plan.globals.appPreferences.categoryIndexExpanded).toBe(false);

      const overwrite = buildImportPlan([workspace], globals, bundle, 'overwrite');
      expect(overwrite.globals).toEqual(importedGlobals);
      expect(overwrite.conflicts).toEqual([]);
    });

    it('refuses to create a new workspace from a partial export', () => {
      const partial = createTransferBundle(
        [{ ...structuredClone(workspace), id: 'fresh', name: 'Fresh' }],
        globals,
        {
          workspaces: { fresh: { categoriesAndGroups: true, loggedData: false } },
          analysisSettings: false,
          appPreferences: false,
        },
      );
      expect(() => buildImportPlan([workspace], globals, partial, 'merge')).toThrow(
        'Cannot create unknown workspace Fresh from a partial export.',
      );
    });

    it('creates new workspaces with default notes and visibility', () => {
      const fresh = createTransferBundle(
        [{ ...structuredClone(workspace), id: 'fresh', name: 'Fresh' }],
        globals,
        {
          workspaces: { fresh: { categoriesAndGroups: true, loggedData: true } },
          analysisSettings: false,
          appPreferences: false,
        },
      );
      expect(
        buildImportPlan([workspace], globals, fresh, 'merge').workspaces[1],
      ).toEqual(expect.objectContaining({ id: 'fresh', notes: '', hidden: false }));
    });
  });

  it('keeps imported workspaces whose target is unknown or unspecified', () => {
    const bundle = baseBundle();
    expect(
      remapImportedWorkspaces(bundle, { user: 'gone' }, []).workspaces[0],
    ).toBe(bundle.workspaces[0]);
    expect(remapImportedWorkspaces(bundle, {}, []).workspaces[0]).toEqual(
      bundle.workspaces[0],
    );
  });
});
