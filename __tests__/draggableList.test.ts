import React from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DraggableList } from '../src/components/DraggableList';

type JsonNode = {
  type: string;
  props: { style?: unknown; testID?: string };
  children: Array<JsonNode | string> | null;
};

const event = {} as GestureResponderEvent;
const gesture = (values: Partial<PanResponderGestureState>) =>
  values as PanResponderGestureState;
let config: PanResponderCallbacks;

beforeEach(() => {
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
    config = callbacks;
    return create(callbacks);
  });
});

afterEach(() => jest.restoreAllMocks());

const items = ['a', 'b', 'c'];

const renderList = async () => {
  const onDrop = jest.fn();
  const onDragChange = jest.fn();
  const screen = await render(
    React.createElement(DraggableList<string>, {
      items,
      keyFor: (item) => `key-${item}`,
      fallbackHeightFor: () => 40,
      gapStyle: { marginVertical: 3 },
      onDrop,
      onDragChange,
      renderItem: (item, { index, held, panHandlers }) =>
        React.createElement(
          View,
          { testID: `row-${item}`, ...panHandlers },
          React.createElement(Text, null, `${item}:${index}:${held ? 'held' : 'idle'}`),
        ),
    }),
  );
  return { screen, onDrop, onDragChange };
};

type Screen = Awaited<ReturnType<typeof renderList>>['screen'];

const walk = (node: JsonNode | string | null, visit: (node: JsonNode) => void) => {
  if (!node || typeof node === 'string') return;
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
};

// Drop gaps are the only dashed views in the list.
const gapHeights = (screen: Screen) => {
  const heights: number[] = [];
  walk(screen.toJSON() as JsonNode, (node) => {
    const style: ViewStyle =
      StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {};
    if (style.borderStyle === 'dashed') {
      expect(style.marginVertical).toBe(3);
      heights.push(style.height as number);
    }
  });
  return heights;
};

// The layout wrapper is two levels above the rendered row.
const wrapperStyle = (screen: Screen, item: string) =>
  StyleSheet.flatten(screen.getByTestId(`row-${item}`).parent!.parent!.props.style);

it('renders idle rows with no drop gap', async () => {
  const { screen } = await renderList();
  expect(screen.getByText('a:0:idle')).toBeTruthy();
  expect(screen.getByText('c:2:idle')).toBeTruthy();
  expect(gapHeights(screen)).toEqual([]);
  expect(wrapperStyle(screen, 'a')).toBeUndefined();
});

it('lifts the grabbed row, moves the gap and drops at the list end', async () => {
  const { screen, onDrop, onDragChange } = await renderList();
  for (const [index, item] of items.entries()) {
    await fireEvent(screen.getByTestId(`row-${item}`), 'layout', {
      nativeEvent: { layout: { x: 0, y: index * 60, width: 300, height: 50 } },
    });
  }

  await act(async () => {
    expect(
      screen.getByTestId('row-a').props.onStartShouldSetResponder(event),
    ).toBe(true);
    config.onPanResponderGrant!(event, gesture({ y0: 25 }));
  });
  expect(onDragChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByText('a:0:held')).toBeTruthy();
  expect(wrapperStyle(screen, 'a')).toMatchObject({ height: 0, zIndex: 20 });
  // The gap stays in the held row's own slot, rendered before the next row.
  expect(gapHeights(screen)).toEqual([50]);
  expect(
    screen.getByTestId('row-b').parent!.parent!.children,
  ).toHaveLength(2);

  await act(async () => config.onPanResponderMove!(event, gesture({ moveY: 205 })));
  expect(gapHeights(screen)).toEqual([50]);
  expect(
    screen.getByTestId('row-b').parent!.parent!.children,
  ).toHaveLength(1);

  await act(async () => config.onPanResponderRelease!(event, gesture({})));
  expect(onDrop).toHaveBeenCalledWith(0, 3);
  expect(onDragChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByText('a:0:idle')).toBeTruthy();
  expect(gapHeights(screen)).toEqual([]);
});
