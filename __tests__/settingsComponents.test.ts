import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
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

    await fireEvent.changeText(
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

    await fireEvent.press(screen.getByText('Open category settings'));
    await fireEvent(
      screen.getByLabelText('Enable Historical chart'),
      'valueChange',
      false,
    );

    expect(onOpenCategorySettings).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ 'chart.section': false }),
    );
  });

  it('filters statistics settings and expands matching sections on demand', async () => {
    const onChange = jest.fn();
    const settings = createDefaultStatisticsSettings();
    const screen = await render(
      React.createElement(StatisticsSettings, {
        visible: true,
        settings,
        onChange,
        onOpenCategorySettings: jest.fn(),
        onClose: jest.fn(),
      }),
    );
    const search = screen.getByLabelText('Search statistics settings');
    expect(
      screen.getByLabelText('Collapse Chart statistics settings'),
    ).toBeTruthy();

    await fireEvent.changeText(search, '  DAY-OF-MONTH ');
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Collapse Chart statistics settings'),
      ).toBeNull(),
    );
    expect(screen.queryByLabelText('Enable Calendar statistics')).toBeNull();

    await fireEvent.press(
      screen.getByLabelText('Expand Calendar statistics statistics settings'),
    );
    await fireEvent(
      screen.getByLabelText('Enable Calendar statistics'),
      'valueChange',
      true,
    );
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      'calendar.section': true,
    });

    await fireEvent.press(
      screen.getByLabelText('Collapse Calendar statistics statistics settings'),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('Enable Calendar statistics')).toBeNull(),
    );

    await fireEvent.changeText(search, 'no such statistic');
    await waitFor(() =>
      expect(
        screen.getByText('No statistics settings match that search.'),
      ).toBeTruthy(),
    );

    await fireEvent.changeText(search, '');
    await waitFor(() =>
      expect(
        screen.getByLabelText('Expand Calendar statistics statistics settings'),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByText('No statistics settings match that search.'),
    ).toBeNull();
  });

  it('shows an empty state when no documentation matches', async () => {
    const screen = await render(
      React.createElement(DocumentationModal, {
        visible: true,
        onClose: jest.fn(),
      }),
    );

    await fireEvent.changeText(
      screen.getByLabelText('Search documentation'),
      'zzz-not-documented',
    );

    await waitFor(() =>
      expect(
        screen.getByText('No documentation matches that search.'),
      ).toBeTruthy(),
    );
  });

  it('scrolls to the measured offset of the initial section when reopened', async () => {
    const scrollTo = jest
      .spyOn(
        ScrollView.prototype as unknown as { scrollTo: () => void },
        'scrollTo',
      )
      .mockImplementation(() => undefined);
    const props = {
      visible: true,
      initialSection: 'duration' as const,
      onClose: jest.fn(),
    };
    try {
      const screen = await render(React.createElement(DocumentationModal, props));
      await waitFor(() =>
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false }),
      );

      await fireEvent(screen.getByText('Duration tracking'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 420, width: 300, height: 200 } },
      });
      await screen.rerender(
        React.createElement(DocumentationModal, { ...props, visible: false }),
      );
      await screen.rerender(React.createElement(DocumentationModal, props));
      await waitFor(() =>
        expect(scrollTo).toHaveBeenLastCalledWith({ y: 420, animated: false }),
      );
    } finally {
      scrollTo.mockRestore();
    }
  });
});