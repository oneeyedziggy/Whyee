import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import {
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from '@testing-library/react-native';
import { AppButton } from '../src/components/AppButton';
import { HoverTitle } from '../src/components/HoverTitle';
import { InfoLink } from '../src/components/InfoLink';
import { Panel } from '../src/components/Panel';
import { SettingsDrawer } from '../src/components/SettingsDrawer';
import { SortHeader } from '../src/components/SortHeader';
import { colors } from '../src/theme/tokens';

jest.mock('lucide-react-native', () => ({
  Download: () => null,
  Upload: () => null,
  X: () => null,
}));

type Host = ReturnType<RenderResult['getByRole']>;

const styleOf = (element: Host) => StyleSheet.flatten(element.props.style);

// Drives the Pressability responder directly so Pressable reports `pressed`.
const pressIn = (element: Host) =>
  fireEvent(element, 'responderGrant', {
    nativeEvent: {
      timestamp: Date.now(),
      pageX: 0,
      pageY: 0,
      locationX: 0,
      locationY: 0,
      touches: [],
      changedTouches: [],
      identifier: 1,
      target: 1,
    },
    persist: () => undefined,
    currentTarget: { measure: jest.fn() },
    dispatchConfig: { registrationName: 'onResponderGrant' },
  });

const asWeb = () => jest.replaceProperty(Platform, 'OS', 'web');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AppButton', () => {
  it('presses, dims while pressed and uses the title as its label', async () => {
    const onPress = jest.fn();
    const screen = await render(
      React.createElement(AppButton, { title: 'Save', onPress }),
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
    expect(styleOf(button).opacity).toBeUndefined();
    expect(JSON.stringify(screen.toJSON())).not.toContain('"ActivityIndicator"');

    await pressIn(button);
    expect(styleOf(screen.getByRole('button', { name: 'Save' })).opacity).toBe(
      0.82,
    );

    await fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses and dims when disabled', async () => {
    const onPress = jest.fn();
    const screen = await render(
      React.createElement(AppButton, {
        title: 'Delete',
        onPress,
        disabled: true,
        variant: 'danger',
        size: 'block',
        accessibilityLabel: 'Delete everything',
      }),
    );
    const button = screen.getByRole('button', { name: 'Delete everything' });
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    expect(styleOf(button)).toMatchObject({ opacity: 0.45, width: '100%' });

    await fireEvent.press(screen.getByText('Delete'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a busy spinner and blocks presses while loading', async () => {
    const onPress = jest.fn();
    const screen = await render(
      React.createElement(AppButton, {
        title: 'Export',
        onPress,
        loading: true,
        size: 'utility',
      }),
    );
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(JSON.stringify(screen.toJSON())).toContain('"ActivityIndicator"');

    await fireEvent.press(screen.getByText('Export'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('SortHeader', () => {
  const glyphs = (screen: RenderResult, name: RegExp) => {
    const content = screen.getByRole('button', { name }).children[0] as Host;
    const [up, down] = (content.children[1] as Host).children as Host[];
    return { up: styleOf(up), down: styleOf(down) };
  };

  it.each([
    ['asc', 'ascending', colors.text, '#b9c3cf'],
    ['desc', 'descending', '#b9c3cf', colors.text],
    ['default', 'unsorted', '#b9c3cf', '#b9c3cf'],
  ] as const)(
    'announces and highlights the %s direction',
    async (direction, spoken, upColor, downColor) => {
      const onPress = jest.fn();
      const screen = await render(
        React.createElement(SortHeader, { label: 'Lag', direction, onPress }),
      );
      const name = new RegExp(`^Lag, ${spoken}\\. Activate`);
      expect(glyphs(screen, name).up.borderBottomColor).toBe(upColor);
      expect(glyphs(screen, name).down.borderTopColor).toBe(downColor);

      await fireEvent.press(screen.getByText('Lag'));
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the hint as an accessibility hint without a wrapper on native', async () => {
    const screen = await render(
      React.createElement(SortHeader, {
        label: 'Value',
        direction: 'asc',
        onPress: jest.fn(),
        hint: 'Sort by value',
      }),
    );
    expect(screen.getByHintText('Sort by value')).toBeTruthy();
    expect(screen.toJSON()).toMatchObject({
      props: { accessibilityHint: 'Sort by value' },
    });
  });
});
describe('Panel', () => {
  it('renders the title, subtitle, info link and children', async () => {
    const screen = await render(
      React.createElement(
        Panel,
        { title: 'Weekly', subtitle: 'By weekday', infoSection: 'statistics' },
        React.createElement(Text, null, 'Body'),
      ),
    );
    expect(screen.getByText('Weekly')).toBeTruthy();
    expect(screen.getByText('By weekday')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByLabelText('More information about Weekly')).toBeTruthy();
  });

  it('omits the subtitle and info link when not provided', async () => {
    const screen = await render(
      React.createElement(
        Panel,
        { title: 'Plain' },
        React.createElement(Text, null, 'Body'),
      ),
    );
    expect(screen.getByText('Plain')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByText(/./)).toHaveLength(2);
  });
});

describe('HoverTitle', () => {
  const child = React.createElement(Text, null, 'Child');

  it('passes children straight through on native', async () => {
    const screen = await render(
      React.createElement(HoverTitle, { text: 'Tip', children: child }),
    );
    expect(screen.toJSON()).toMatchObject({ type: 'Text' });
  });

  it.each([
    [false, { display: 'inline-flex' }],
    [true, { display: 'flex', flex: '1 1 0%', minWidth: 0 }],
  ])('wraps children in a titled div on web (grow %s)', async (grow, style) => {
    asWeb();
    const screen = await render(
      React.createElement(HoverTitle, { text: 'Tip', grow, children: child }),
    );
    expect(screen.toJSON()).toMatchObject({
      type: 'div',
      props: { title: 'Tip', style },
    });
    expect(screen.getByText('Child')).toBeTruthy();
  });
});

describe('InfoLink', () => {
  it('opens the documentation at its section and closes it again', async () => {
    const screen = await render(
      React.createElement(InfoLink, { section: 'correlation' }),
    );
    const link = screen.getByRole('button', { name: 'More information' });
    expect(styleOf(link)).toMatchObject({ width: 44, height: 44 });
    expect(screen.queryByText('Documentation')).toBeNull();

    await fireEvent.press(link);
    await waitFor(() => expect(screen.getByText('Documentation')).toBeTruthy());

    await fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(screen.queryByText('Documentation')).toBeNull());
  });

  it('uses a custom label and the compact size', async () => {
    const screen = await render(
      React.createElement(InfoLink, {
        section: 'statistics',
        label: 'About stats',
        compact: true,
      }),
    );
    expect(
      styleOf(screen.getByRole('button', { name: 'About stats' })),
    ).toMatchObject({ width: 36, height: 36 });
  });
});

describe('SettingsDrawer', () => {
  it('routes export, import and both close controls', async () => {
    const props = {
      visible: true,
      onClose: jest.fn(),
      onExport: jest.fn(),
      onImport: jest.fn(),
    };
    const screen = await render(React.createElement(SettingsDrawer, props));

    await fireEvent.press(screen.getByText('Export data'));
    await fireEvent.press(screen.getByText('Import data'));
    const closers = screen.getAllByRole('button', { name: 'Close settings' });
    expect(closers).toHaveLength(2);
    for (const closer of closers) await fireEvent.press(closer);

    expect(props.onExport).toHaveBeenCalledTimes(1);
    expect(props.onImport).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing while hidden', async () => {
    const screen = await render(
      React.createElement(SettingsDrawer, {
        visible: false,
        onClose: jest.fn(),
        onExport: jest.fn(),
        onImport: jest.fn(),
      }),
    );
    expect(screen.queryByText('Settings')).toBeNull();
  });
});
