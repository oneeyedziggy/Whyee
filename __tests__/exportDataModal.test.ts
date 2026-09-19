import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ExportDataModal } from '../src/components/ExportDataModal';
import { saveTransferArchives } from '../src/lib/dataTransferFile';
import { transferGlobals, transferWorkspace } from './dataTransferFixtures';

jest.mock('../src/lib/dataTransferFile', () => ({
  saveTransferArchives: jest.fn(),
}));
jest.mock('lucide-react-native', () => ({
  Check: () => null,
  X: () => null,
}));

it('defaults exports to all data, combined, and zipped', async () => {
  (saveTransferArchives as jest.Mock).mockResolvedValue(undefined);
  const onClose = jest.fn();
  const screen = await render(
    React.createElement(ExportDataModal, {
      visible: true,
      workspaces: [transferWorkspace],
      globals: transferGlobals,
      onClose,
    }),
  );

  expect(
    screen.getByLabelText('User workspace').props.accessibilityState.checked,
  ).toBe(true);
  expect(
    screen.getByText('Combined').parent?.props.accessibilityState.checked,
  ).toBe(true);

  fireEvent.press(screen.getByText('Export'));
  await waitFor(() => expect(saveTransferArchives).toHaveBeenCalledTimes(1));
  expect((saveTransferArchives as jest.Mock).mock.calls[0][0][0].fileName).toBe(
    'Whyee.config.zip',
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});
