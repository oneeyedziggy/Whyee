import React from 'react';
import * as ReactNative from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { StatisticsSettings } from '../src/components/StatisticsSettings';
import { createDefaultStatisticsSettings } from '../src/lib/statistics';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1200, height: 800, scale: 1, fontScale: 1 }),
}));

it('gives the desktop dialog a viewport height without a zero flex basis', async () => {
  const screen = await render(
    React.createElement(StatisticsSettings, {
      visible: true,
      settings: createDefaultStatisticsSettings(),
      onChange: jest.fn(),
      onOpenCategorySettings: jest.fn(),
      onClose: jest.fn(),
    }),
  );
  const dialog = screen.getByLabelText('Search statistics settings').parent;
  expect(ReactNative.StyleSheet.flatten(dialog?.props.style)).toMatchObject({
    height: 688,
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
  });
  expect(screen.getByText('Done')).toBeTruthy();
  expect(screen.getByLabelText('Enable Historical chart')).toBeTruthy();
});

it('closes the desktop dialog from the backdrop and the Done button', async () => {
  const onClose = jest.fn();
  const screen = await render(
    React.createElement(StatisticsSettings, {
      visible: true,
      settings: createDefaultStatisticsSettings(),
      onChange: jest.fn(),
      onOpenCategorySettings: jest.fn(),
      onClose,
    }),
  );
  await fireEvent.press(screen.getByLabelText('Close statistics settings'));
  expect(onClose).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('Done'));
  expect(onClose).toHaveBeenCalledTimes(2);
});
