import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { unzipSync } from 'fflate';
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

  await fireEvent.press(screen.getByText('Export'));
  await waitFor(() => expect(saveTransferArchives).toHaveBeenCalledTimes(1));
  expect((saveTransferArchives as jest.Mock).mock.calls[0][0][0].fileName).toBe(
    'Whyee.config.zip',
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});

describe('ExportDataModal choices', () => {
  const open = async () => {
    const props = {
      visible: true,
      workspaces: [transferWorkspace],
      globals: transferGlobals,
      onClose: jest.fn(),
    };
    const screen = await render(React.createElement(ExportDataModal, props));
    const checked = (label: string) =>
      screen.getByLabelText(label).props.accessibilityState.checked;
    const exportButton = () => screen.getByRole('button', { name: /^export(ing)?$/i });
    return { screen, props, checked, exportButton };
  };

  beforeEach(() => (saveTransferArchives as jest.Mock).mockReset());

  it('toggles a workspace and its sections together and apart', async () => {
    const { screen, checked } = await open();
    await fireEvent.press(screen.getByLabelText('User workspace'));
    expect(checked('User workspace')).toBe(false);
    expect(screen.queryByLabelText('User logged data')).toBeNull();

    await fireEvent.press(screen.getByLabelText('User workspace'));
    expect(checked('User categories and groups')).toBe(true);
    expect(checked('User logged data')).toBe(true);

    await fireEvent.press(screen.getByLabelText('User categories and groups'));
    expect(checked('User categories and groups')).toBe(false);
    expect(checked('User workspace')).toBe(true);
    await fireEvent.press(screen.getByLabelText('User logged data'));
    expect(checked('User workspace')).toBe(false);
  });

  it('disables export until something is selected', async () => {
    const { screen, exportButton, props } = await open();
    await fireEvent.press(screen.getByLabelText('User workspace'));
    await fireEvent.press(screen.getByLabelText('Analysis and statistics settings'));
    expect(exportButton().props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(screen.getByLabelText('App preferences'));
    expect(exportButton().props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(exportButton());
    expect(saveTransferArchives).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('App preferences'));
    await fireEvent.press(exportButton());
    const [archives] = (saveTransferArchives as jest.Mock).mock.calls[0];
    expect(archives).toHaveLength(1);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('exports individual files', async () => {
    (saveTransferArchives as jest.Mock).mockResolvedValue(undefined);
    const { screen } = await open();
    await fireEvent.press(screen.getByText('Individual files'));
    expect(screen.getByText('Individual files').parent?.props.accessibilityState.checked).toBe(
      true,
    );
    await fireEvent.press(screen.getByText('Export'));
    const [[archive]] = (saveTransferArchives as jest.Mock).mock.calls[0];
    // Combined zips hold a manifest and one bundle; individual zips split every section out.
    expect(Object.keys(unzipSync(archive.bytes)).length).toBeGreaterThan(2);
  });

  it('shows progress while saving and keeps the modal open on failure', async () => {
    let fail: (reason: unknown) => void = () => {};
    (saveTransferArchives as jest.Mock).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { screen, props, exportButton } = await open();
    const pressed = fireEvent.press(exportButton());
    await waitFor(() => expect(screen.getByText('Exporting')).toBeTruthy());
    expect(exportButton().props.accessibilityState?.disabled).toBe(true);
    await act(async () => fail(new Error('Storage full')));
    await pressed;
    expect(screen.getByText('Storage full')).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();

    (saveTransferArchives as jest.Mock).mockRejectedValueOnce('nope');
    await fireEvent.press(exportButton());
    expect(screen.getByText('Export failed.')).toBeTruthy();
  });

  it('resets choices when reopened and closes from the header', async () => {
    const { screen, props, checked } = await open();
    await fireEvent.press(screen.getByLabelText('App preferences'));
    await fireEvent.press(screen.getByText('Individual files'));
    await screen.rerender(React.createElement(ExportDataModal, { ...props, visible: false }));
    await screen.rerender(React.createElement(ExportDataModal, { ...props, visible: true }));
    expect(checked('App preferences')).toBe(true);
    expect(screen.getByText('Combined').parent?.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Close export data'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
