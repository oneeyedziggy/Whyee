import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { ImportDataModal } from '../src/components/ImportDataModal';
import {
  buildImportPlan,
  createTransferArchives,
  createTransferBundle,
  remapImportedWorkspaces,
} from '../src/lib/dataTransfer';
import { pickTransferFile } from '../src/lib/dataTransferFile';
import type {
  ExportSelection,
  WorkspaceTransferSnapshot,
} from '../src/types/dataTransfer';
import { transferGlobals, transferWorkspace } from './dataTransferFixtures';

jest.mock('../src/lib/dataTransfer', () => {
  const actual = jest.requireActual('../src/lib/dataTransfer');
  return {
    ...actual,
    buildImportPlan: jest.fn(actual.buildImportPlan),
    remapImportedWorkspaces: jest.fn(actual.remapImportedWorkspaces),
  };
});

jest.mock('../src/lib/dataTransferFile', () => ({
  pickTransferFile: jest.fn(),
}));
jest.mock('lucide-react-native', () => ({
  FileUp: () => null,
  X: () => null,
}));

it('picks a valid archive and presents merge or overwrite', async () => {
  const bundle = createTransferBundle(
    [transferWorkspace],
    transferGlobals,
    {
      workspaces: {
        user: { categoriesAndGroups: true, loggedData: true },
      },
      analysisSettings: true,
      appPreferences: true,
    },
    '2026-09-16T12:00:00.000Z',
  );
  const archive = createTransferArchives(bundle)[0];
  (pickTransferFile as jest.Mock).mockResolvedValue({
    fileName: archive.fileName,
    bytes: archive.bytes,
  });
  const onApply = jest.fn();
  const screen = await render(
    React.createElement(ImportDataModal, {
      visible: true,
      workspaces: [transferWorkspace],
      globals: transferGlobals,
      onApply,
      onClose: jest.fn(),
    }),
  );

  await fireEvent.press(screen.getByText('Choose Whyee export'));
  await waitFor(() =>
    expect(screen.getByText('Whyee.config.zip')).toBeTruthy(),
  );
  expect(screen.getByText('Merge')).toBeTruthy();
  expect(screen.getByText('Overwrite')).toBeTruthy();

  await fireEvent.press(screen.getByText('Merge selected data'));
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ workspaces: expect.any(Array) }),
  );
});

it('defaults an unmatched imported workspace to "New workspace" and lets it be retargeted', async () => {
  const incoming = {
    ...structuredClone(transferWorkspace),
    id: 'vacation-2020',
    name: 'Vacation',
  };
  const bundle = createTransferBundle(
    [incoming],
    transferGlobals,
    {
      workspaces: {
        'vacation-2020': { categoriesAndGroups: true, loggedData: true },
      },
      analysisSettings: true,
      appPreferences: true,
    },
    '2026-09-16T12:00:00.000Z',
  );
  const archive = createTransferArchives(bundle)[0];
  (pickTransferFile as jest.Mock).mockResolvedValue({
    fileName: archive.fileName,
    bytes: archive.bytes,
  });
  const onApply = jest.fn();
  const screen = await render(
    React.createElement(ImportDataModal, {
      visible: true,
      workspaces: [transferWorkspace],
      globals: transferGlobals,
      onApply,
      onClose: jest.fn(),
    }),
  );

  await fireEvent.press(screen.getByText('Choose Whyee export'));
  await waitFor(() => expect(screen.getByText('Vacation')).toBeTruthy());
  expect(
    screen.getByText('New workspace').parent?.props.accessibilityState.selected,
  ).toBe(true);

  await fireEvent.press(screen.getByText('User'));
  await waitFor(() =>
    expect(
      screen.getByText('User').parent?.props.accessibilityState.selected,
    ).toBe(true),
  );
  await fireEvent.press(screen.getByText('Merge selected data'));

  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaces: [expect.objectContaining({ id: 'user', name: 'User' })],
    }),
  );
});

describe('ImportDataModal flows', () => {
  const actual = jest.requireActual<typeof import('../src/lib/dataTransfer')>(
    '../src/lib/dataTransfer',
  );
  const allSections = (ids: string[]) => ({
    workspaces: Object.fromEntries(
      ids.map((id) => [id, { categoriesAndGroups: true, loggedData: true }]),
    ),
    analysisSettings: true,
    appPreferences: true,
  });
  const offerArchive = (
    workspaces: WorkspaceTransferSnapshot[],
    selection: ExportSelection = allSections(workspaces.map(({ id }) => id)),
  ) => {
    const bundle = createTransferBundle(
      workspaces,
      transferGlobals,
      selection,
      '2026-09-16T12:00:00.000Z',
    );
    const archive = createTransferArchives(bundle)[0];
    (pickTransferFile as jest.Mock).mockResolvedValue({
      fileName: archive.fileName,
      bytes: archive.bytes,
    });
  };
  const open = async (overrides: { onApply?: jest.Mock; onClose?: jest.Mock } = {}) => {
    const props = {
      visible: true,
      workspaces: [transferWorkspace],
      globals: transferGlobals,
      onApply: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
    const screen = await render(React.createElement(ImportDataModal, props));
    return { screen, props };
  };
  const pick = async (screen: Awaited<ReturnType<typeof render>>) => {
    await fireEvent.press(screen.getByText('Choose Whyee export'));
    await waitFor(() => expect(screen.getByText('Merge selected data')).toBeTruthy());
  };
  const conflict = (id: string, localValue: unknown, importedValue: unknown) => ({
    id,
    section: 'category' as const,
    label: `Conflict ${id}`,
    changedFields: ['name', 'range'],
    localValue,
    importedValue,
  });
  const reviewPlan = (conflicts: ReturnType<typeof conflict>[]) => {
    const finalPlan = { workspaces: [], globals: transferGlobals, conflicts: [] };
    (buildImportPlan as jest.Mock)
      .mockImplementationOnce(() => ({ ...finalPlan, conflicts }))
      .mockImplementationOnce(() => finalPlan);
    return finalPlan;
  };
  const chooseReview = async (screen: Awaited<ReturnType<typeof render>>) => {
    await fireEvent.press(screen.getByText('Review each conflict'));
    await fireEvent.press(screen.getByText('Merge selected data'));
  };

  beforeEach(() => {
    (buildImportPlan as jest.Mock).mockReset().mockImplementation(actual.buildImportPlan);
    (remapImportedWorkspaces as jest.Mock)
      .mockReset()
      .mockImplementation(actual.remapImportedWorkspaces);
    offerArchive([transferWorkspace]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows progress while the picker is open and stays put when cancelled', async () => {
    let finish: (value: null) => void = () => {};
    (pickTransferFile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { screen } = await open();
    const pressed = fireEvent.press(screen.getByText('Choose Whyee export'));
    await waitFor(() => expect(screen.getByText('Opening file picker')).toBeTruthy());
    expect(
      screen.getByText('Opening file picker').parent?.props.accessibilityState?.disabled,
    ).toBe(true);
    await act(async () => finish(null));
    await pressed;
    expect(screen.getByText('Choose Whyee export')).toBeTruthy();
    expect(screen.queryByText('Merge selected data')).toBeNull();
  });

  it('reports unreadable files and unknown picker failures', async () => {
    (pickTransferFile as jest.Mock).mockResolvedValueOnce({
      fileName: 'notes.txt',
      bytes: new Uint8Array(),
    });
    const { screen } = await open();
    await fireEvent.press(screen.getByText('Choose Whyee export'));
    expect(
      screen.getByText('Select a file named Whyee.*.config.json or Whyee.*.config.zip.'),
    ).toBeTruthy();

    (pickTransferFile as jest.Mock).mockRejectedValueOnce('permission denied');
    await fireEvent.press(screen.getByText('Choose Whyee export'));
    expect(screen.getByText('Import failed.')).toBeTruthy();
    expect(screen.queryByText(/Whyee.*config.json or/)).toBeNull();
  });

  it('summarises only the sections present in the file', async () => {
    const logs = { ...transferWorkspace, id: 'logs', name: 'Logs' };
    offerArchive([transferWorkspace, logs], {
      workspaces: {
        user: { categoriesAndGroups: true, loggedData: false },
        logs: { categoriesAndGroups: false, loggedData: true },
      },
      analysisSettings: false,
      appPreferences: false,
    });
    const { screen } = await open();
    await pick(screen);
    expect(screen.getByText('User: 1 categories, 1 groups\nLogs: 0 records')).toBeTruthy();
  });

  it('keeps two imported workspaces from targeting the same local one', async () => {
    const other = { ...transferWorkspace, id: 'travel', name: 'Travel' };
    offerArchive([transferWorkspace, other]);
    const { screen } = await open();
    await pick(screen);
    const [firstUser, secondUser] = screen
      .getAllByText('User')
      .filter((node) => node.parent?.props.accessibilityState);
    // The first workspace already maps to User, so the second cannot pick it too.
    expect(firstUser.parent?.props.accessibilityState).toMatchObject({ selected: true });
    expect(secondUser.parent?.props.accessibilityState).toMatchObject({
      selected: false,
      disabled: true,
    });
  });

  it('merges favoring local values', async () => {
    const { screen, props } = await open();
    await pick(screen);
    await fireEvent.press(screen.getByText('Favor local'));
    expect(screen.getByText('Favor local').parent?.props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByText('Merge selected data'));
    expect(buildImportPlan).toHaveBeenCalledWith(
      props.workspaces,
      transferGlobals,
      expect.anything(),
      'merge',
      'local',
    );
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('applies straight away when review finds nothing to review', async () => {
    const { screen, props } = await open();
    await pick(screen);
    await chooseReview(screen);
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ conflicts: [] }));
    expect(screen.queryByText(/^Conflict \d/)).toBeNull();
  });

  it('walks each conflict, previewing both values, before applying', async () => {
    const long = { notes: 'x'.repeat(300) };
    const finalPlan = reviewPlan([
      conflict('a', undefined, 'Calm'),
      conflict('b', long, { min: 0 }),
      conflict('c', 1, 2),
    ]);
    const { screen, props } = await open();
    await pick(screen);
    await chooseReview(screen);

    expect(screen.getByText('Conflict 1 of 3')).toBeTruthy();
    expect(screen.getByText('Changed: name, range')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByText('Calm')).toBeTruthy();
    expect(screen.queryByText('Merge selected data')).toBeNull();
    await fireEvent.press(screen.getByText('Use imported'));

    expect(screen.getByText('Conflict 2 of 3')).toBeTruthy();
    const preview = `${JSON.stringify(long).slice(0, 217)}...`;
    expect(screen.getByText(preview)).toBeTruthy();
    expect(screen.getByText('{"min":0}')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep local'));
    expect(props.onApply).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Use imported'));
    expect(buildImportPlan).toHaveBeenLastCalledWith(
      props.workspaces,
      transferGlobals,
      expect.anything(),
      'merge',
      'local',
      { a: 'imported', b: 'local', c: 'imported' },
    );
    expect(props.onApply).toHaveBeenCalledWith(finalPlan);
    expect(props.onClose).toHaveBeenCalled();
  });

  it.each([
    ['Keep local for remaining', 'local'],
    ['Use imported for remaining', 'imported'],
  ])('%s settles every later conflict at once', async (label, resolution) => {
    reviewPlan([conflict('a', 1, 2), conflict('b', 3, 4), conflict('c', 5, 6)]);
    const { screen, props } = await open();
    await pick(screen);
    await chooseReview(screen);
    await fireEvent.press(screen.getByText('Keep local'));
    await fireEvent.press(screen.getByText(label));
    expect(buildImportPlan).toHaveBeenLastCalledWith(
      props.workspaces,
      transferGlobals,
      expect.anything(),
      'merge',
      'local',
      { a: 'local', b: resolution, c: resolution },
    );
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });

  it('returns to the options with an error when the reviewed plan fails', async () => {
    (buildImportPlan as jest.Mock)
      .mockImplementationOnce(() => ({
        workspaces: [],
        globals: transferGlobals,
        conflicts: [conflict('a', 1, 2)],
      }))
      .mockImplementationOnce(() => {
        throw new Error('Plan is stale');
      });
    const { screen, props } = await open();
    await pick(screen);
    await chooseReview(screen);
    await fireEvent.press(screen.getByText('Keep local'));
    expect(screen.getByText('Plan is stale')).toBeTruthy();
    expect(screen.queryByText('Conflict 1 of 1')).toBeNull();
    expect(screen.getByText('Merge selected data')).toBeTruthy();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it('shows planning and apply failures without closing', async () => {
    (remapImportedWorkspaces as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Workspace vanished');
    });
    const onApply = jest
      .fn()
      .mockImplementationOnce(() => {
        throw 'disk full';
      });
    const { screen, props } = await open({ onApply });
    await pick(screen);
    await fireEvent.press(screen.getByText('Merge selected data'));
    expect(screen.getByText('Workspace vanished')).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Merge selected data'));
    expect(screen.getByText('Import failed.')).toBeTruthy();
    expect(screen.queryByText('Workspace vanished')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('asks before overwriting on native and only applies on confirm', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { screen, props } = await open();
    await pick(screen);
    await fireEvent.press(screen.getByText('Overwrite'));
    expect(screen.getByText(/Included sections replace/)).toBeTruthy();
    expect(screen.queryByText('Favor local')).toBeNull();
    await fireEvent.press(screen.getByText('Overwrite selected data'));
    expect(props.onApply).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Overwrite Whyee data?');
    expect(message).toContain('This replaces the included sections from:\nUser: 1 categories');
    expect(buttons?.map((button) => button.text)).toEqual(['Cancel', 'Overwrite']);
    await act(async () => buttons![1].onPress!());
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ conflicts: [] }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it.each([
    ['declines', () => false, 0],
    ['accepts', () => true, 1],
    ['has no confirm dialog', undefined, 1],
  ])('on web, overwrites only when the browser %s', async (_name, confirm, applied) => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const browser = globalThis as { confirm?: (text: string) => boolean };
    const confirmSpy = confirm ? jest.fn<boolean, [string]>(confirm) : undefined;
    browser.confirm = confirmSpy;
    try {
      const { screen, props } = await open();
      await pick(screen);
      await fireEvent.press(screen.getByText('Overwrite'));
      await act(async () => {
        await fireEvent.press(screen.getByText('Overwrite selected data'));
      });
      if (confirmSpy)
        expect(confirmSpy.mock.calls[0][0]).toMatch(/^Overwrite Whyee data\?\n\nThis replaces/);
      expect(props.onApply).toHaveBeenCalledTimes(applied);
    } finally {
      delete browser.confirm;
    }
  });

  it('starts over each time it reopens and closes from the header', async () => {
    const { screen, props } = await open();
    await pick(screen);
    await fireEvent.press(screen.getByText('Overwrite'));
    await screen.rerender(React.createElement(ImportDataModal, { ...props, visible: false }));
    await screen.rerender(React.createElement(ImportDataModal, { ...props, visible: true }));
    expect(screen.getByText('Choose Whyee export')).toBeTruthy();
    await pick(screen);
    expect(screen.getByText('Merge').parent?.props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByLabelText('Close import data'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
