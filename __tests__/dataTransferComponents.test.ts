import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingsDrawer } from '../src/components/SettingsDrawer';
jest.mock('lucide-react-native', () => ({
  Download: () => null,
  Upload: () => null,
  X: () => null,
}));

describe('data transfer components', () => {
  it('opens export and import from the settings drawer', async () => {
    const onExport = jest.fn();
    const onImport = jest.fn();
    const screen = await render(
      React.createElement(SettingsDrawer, {
        visible: true,
        onClose: jest.fn(),
        onExport,
        onImport,
      }),
    );

    await fireEvent.press(screen.getByText('Export data'));
    await fireEvent.press(screen.getByText('Import data'));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
