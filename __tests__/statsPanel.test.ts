import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StatsPanel } from '../src/components/StatsPanel';
import { styles as appStyles } from '../src/appStyles';
import type { StatisticsSettings } from '../src/lib/statistics';

const mockChildProps: Record<string, Record<string, unknown>> = {};
jest.mock('../src/components/InfoLink', () => ({ InfoLink: () => null }));
jest.mock('../src/components/ChartsPanel', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    ChartsPanel: (props: Record<string, unknown>) => {
      mockChildProps.ChartsPanel = props;
      return jest.requireActual('react').createElement(MockText, null, 'ChartsPanel');
    },
  };
});
jest.mock('../src/components/SummaryPanel', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    SummaryPanel: (props: Record<string, unknown>) => {
      mockChildProps.SummaryPanel = props;
      return jest.requireActual('react').createElement(MockText, null, 'SummaryPanel');
    },
  };
});
jest.mock('../src/components/TopCorrelationsPanel', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    TopCorrelationsPanel: (props: Record<string, unknown>) => {
      mockChildProps.TopCorrelationsPanel = props;
      return jest
        .requireActual('react')
        .createElement(MockText, null, 'TopCorrelationsPanel');
    },
  };
});
jest.mock('../src/components/CorrelationPanel', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    CorrelationPanel: (props: Record<string, unknown>) => {
      mockChildProps.CorrelationPanel = props;
      return jest
        .requireActual('react')
        .createElement(MockText, null, 'CorrelationPanel');
    },
  };
});

type Props = React.ComponentProps<typeof StatsPanel>;

const allSectionsOff: StatisticsSettings = {
  'chart.section': false,
  'summary.section': false,
  'correlation.section': false,
  'correlation.top-matches': false,
};

const renderStats = async (props: Partial<Props> = {}) => {
  const callbacks = {
    onChartSelectionChange: jest.fn(),
    setTopCorrelationThreshold: jest.fn(),
    setCorrelationOffset: jest.fn(),
    setStatisticsSettingsOpen: jest.fn(),
  };
  const screen = await render(
    React.createElement(StatsPanel, {
      workspaceId: 'ws-1',
      chartSelectionHydrated: true,
      statsRenderStage: 5,
      statisticsSettings: {},
      enabledCategories: [],
      records: {},
      safeSummaryLookback: 14,
      orderedRows: [],
      loading: false,
      offsets: [0, 1],
      safeCorrelationOffset: 2,
      safeTopCorrelationThreshold: 0.6,
      ...callbacks,
      ...props,
    }),
  );
  return { screen, ...callbacks };
};

type Screen = Awaited<ReturnType<typeof renderStats>>['screen'];
type HostNode = { props: { style?: unknown }; children: Array<HostNode | string> };

const countGaps = (node: HostNode | string): number =>
  typeof node === 'string'
    ? 0
    : (node.props.style === appStyles.sectionGap ? 1 : 0) +
      node.children.reduce((sum, child) => sum + countGaps(child), 0);

// Rendered section names in order, plus how many spacer gaps separate them.
const layout = (screen: Screen) => ({
  sections: screen
    .queryAllByText(
      /^(ChartsPanel|SummaryPanel|TopCorrelationsPanel|CorrelationPanel|Statistics paused)$/,
    )
    .map((node) => node.children.join('')),
  gaps: countGaps(screen.root as unknown as HostNode),
});

beforeEach(() => {
  Object.keys(mockChildProps).forEach((key) => delete mockChildProps[key]);
});

describe('StatsPanel', () => {
  it('renders every default section with spacers once fully staged', async () => {
    const { screen } = await renderStats();
    expect(layout(screen)).toEqual({
      sections: [
        'ChartsPanel',
        'SummaryPanel',
        'TopCorrelationsPanel',
        'CorrelationPanel',
      ],
      gaps: 3,
    });
  });

  it('reveals sections progressively by render stage', async () => {
    const expectations: Array<[number, string[], number]> = [
      [0, [], 0],
      [1, ['ChartsPanel'], 0],
      [2, ['ChartsPanel', 'SummaryPanel'], 1],
      [3, ['ChartsPanel', 'SummaryPanel'], 2],
      [4, ['ChartsPanel', 'SummaryPanel', 'TopCorrelationsPanel'], 2],
    ];
    for (const [stage, sections, gaps] of expectations) {
      const { screen } = await renderStats({ statsRenderStage: stage });
      expect(layout(screen)).toEqual({ sections, gaps });
      await screen.unmount();
    }
  });

  it('passes data through to child panels', async () => {
    const categories = [{ id: 'c' }] as unknown as Props['enabledCategories'];
    const records = { r: { categoryId: 'c' } };
    const rows = [
      { label: 'A x B', leftCategoryId: 'a', rightCategoryId: 'b', cells: [] },
    ];
    const { setTopCorrelationThreshold, onChartSelectionChange } =
      await renderStats({
        enabledCategories: categories,
        records,
        orderedRows: rows,
        loading: true,
      });
    expect(mockChildProps.ChartsPanel).toMatchObject({
      categories,
      records,
      selectionHydrated: true,
      onSelectionChange: onChartSelectionChange,
    });
    expect(mockChildProps.SummaryPanel).toMatchObject({
      categories,
      records,
      recentDays: 14,
    });
    expect(mockChildProps.TopCorrelationsPanel).toMatchObject({
      rows,
      threshold: 0.6,
      onThresholdChange: setTopCorrelationThreshold,
    });
    expect(mockChildProps.CorrelationPanel).toMatchObject({
      rows,
      loading: true,
      offsets: [0, 1],
      offset: 2,
    });
  });

  it('clamps and rounds correlation offset changes to 0-366 days', async () => {
    const { setCorrelationOffset } = await renderStats();
    const onOffsetChange = mockChildProps.CorrelationPanel
      .onOffsetChange as (value: number) => void;
    onOffsetChange(500);
    onOffsetChange(-4);
    onOffsetChange(4.6);
    expect(setCorrelationOffset.mock.calls).toEqual([[366], [0], [5]]);
  });

  it('opens statistics settings from the header', async () => {
    const { screen, setStatisticsSettingsOpen } = await renderStats();
    await fireEvent.press(screen.getByText('Settings'));
    expect(setStatisticsSettingsOpen).toHaveBeenCalledWith(true);
  });

  it('omits the chart and its spacer when charts are disabled', async () => {
    const { screen } = await renderStats({
      statisticsSettings: { 'chart.section': false },
    });
    expect(layout(screen)).toEqual({
      sections: ['SummaryPanel', 'TopCorrelationsPanel', 'CorrelationPanel'],
      gaps: 2,
    });
  });

  it('drops every correlation spacer when the matrix is disabled', async () => {
    const { screen } = await renderStats({
      statisticsSettings: { 'correlation.section': false },
    });
    expect(layout(screen)).toEqual({
      sections: ['ChartsPanel', 'SummaryPanel', 'TopCorrelationsPanel'],
      gaps: 0,
    });
  });

  it('omits summary and top matches with their spacers', async () => {
    const { screen } = await renderStats({
      statisticsSettings: {
        'summary.section': false,
        'correlation.top-matches': false,
      },
    });
    expect(layout(screen)).toEqual({
      sections: ['ChartsPanel', 'CorrelationPanel'],
      gaps: 1,
    });
  });

  it('shows a paused prompt only when every section is disabled', async () => {
    const { screen, setStatisticsSettingsOpen } = await renderStats({
      statisticsSettings: allSectionsOff,
    });
    expect(layout(screen)).toEqual({ sections: ['Statistics paused'], gaps: 0 });
    await fireEvent.press(screen.getByText('Open statistics settings'));
    expect(setStatisticsSettingsOpen).toHaveBeenCalledWith(true);
  });

  it.each([
    'summary.section',
    'correlation.section',
    'correlation.top-matches',
  ] as const)('is not paused while %s is enabled', async (section) => {
    const { screen } = await renderStats({
      statisticsSettings: { ...allSectionsOff, [section]: true },
    });
    expect(screen.queryByText('Statistics paused')).toBeNull();
  });
});
