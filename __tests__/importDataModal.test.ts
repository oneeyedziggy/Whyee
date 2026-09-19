import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ImportDataModal } from '../src/components/ImportDataModal';
import {
  createTransferArchives,
  createTransferBundle,
} from '../src/lib/dataTransfer';
import { pickTransferFile } from '../src/lib/dataTransferFile';
import { transferGlobals, transferWorkspace } from './dataTransferFixtures';

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

  fireEvent.press(screen.getByText('Choose Whyee export'));
  await waitFor(() =>
    expect(screen.getByText('Whyee.config.zip')).toBeTruthy(),
  );
  expect(screen.getByText('Merge')).toBeTruthy();
  expect(screen.getByText('Overwrite')).toBeTruthy();

  fireEvent.press(screen.getByText('Merge selected data'));
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

  fireEvent.press(screen.getByText('Choose Whyee export'));
  await waitFor(() => expect(screen.getByText('Vacation')).toBeTruthy());
  expect(
    screen.getByText('New workspace').parent?.props.accessibilityState.selected,
  ).toBe(true);

  fireEvent.press(screen.getByText('User'));
  await waitFor(() =>
    expect(
      screen.getByText('User').parent?.props.accessibilityState.selected,
    ).toBe(true),
  );
  fireEvent.press(screen.getByText('Merge selected data'));

  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaces: [expect.objectContaining({ id: 'user', name: 'User' })],
    }),
  );
});
