import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DocumentationModal } from '../src/components/DocumentationModal';
import { StatisticsSettings } from '../src/components/StatisticsSettings';
import { createDefaultStatisticsSettings } from '../src/lib/statistics';

describe('settings components', () => {
  it('filters bundled documentation locally', async () => {
    const screen = await render(
      React.createElement(DocumentationModal, {
        visible: true,
        initialSection: 'categories',
        onClose: jest.fn(),
      }),
    );

    fireEvent.changeText(
      screen.getByLabelText('Search documentation'),
      'sentiment',
    );

    await waitFor(() => {
      expect(screen.getByText('Notes and sentiment')).toBeTruthy();
      expect(screen.queryByText('Duration tracking')).toBeNull();
    });
  });

  it('opens category settings from statistics settings', async () => {
    const onOpenCategorySettings = jest.fn();
    const onChange = jest.fn();
    const screen = await render(
      React.createElement(StatisticsSettings, {
        visible: true,
        settings: createDefaultStatisticsSettings(),
        onChange,
        onOpenCategorySettings,
        onClose: jest.fn(),
      }),
    );

    fireEvent.press(screen.getByText('Open category settings'));
    fireEvent(
      screen.getByLabelText('Enable Historical chart'),
      'valueChange',
      false,
    );

    expect(onOpenCategorySettings).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ 'chart.section': false }),
    );
  });
});
