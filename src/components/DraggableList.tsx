import { memo, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { GestureResponderHandlers, ViewStyle } from 'react-native';
import { useDragReorder } from '../hooks/useDragReorder';
import { colors } from '../theme/tokens';

export interface DraggableItemState {
  index: number;
  held: boolean;
  panHandlers: GestureResponderHandlers;
}

interface DraggableListProps<T> {
  items: T[];
  keyFor: (item: T, index: number) => string;
  // Spread `state.panHandlers` onto the drag handle inside the returned row.
  renderItem: (item: T, state: DraggableItemState) => ReactNode;
  // `to` is a boundary index (0..items.length) in the pre-drag list.
  onDrop: (from: number, to: number) => void;
  fallbackHeightFor: (index: number) => number;
  gapStyle?: ViewStyle;
  minBoundary?: number;
  onDragChange?: (dragging: boolean) => void;
}

export const DraggableList = <T,>({
  items,
  keyFor,
  renderItem,
  onDrop,
  fallbackHeightFor,
  gapStyle,
  minBoundary,
  onDragChange,
}: DraggableListProps<T>) => {
  const {
    dragIndex,
    dragHeight,
    registerHeight,
    panHandlersFor,
    isGapBefore,
    heldWrapperStyle,
    heldRowStyle,
  } = useDragReorder({
    length: items.length,
    keyFor: (index) => keyFor(items[index], index),
    fallbackHeightFor,
    minBoundary,
    onDragChange,
    onDrop,
  });

  return (
    <View>
      {items.map((item, index) => {
        const key = keyFor(item, index);
        return (
          <DraggableRow
            key={key}
            rowKey={key}
            item={item}
            index={index}
            held={dragIndex === index}
            gapHeight={isGapBefore(index) ? dragHeight : 0}
            gapStyle={gapStyle}
            renderItem={
              renderItem as (
                item: unknown,
                state: DraggableItemState,
              ) => ReactNode
            }
            registerHeight={registerHeight}
            panHandlers={panHandlersFor(index)}
            heldWrapperStyle={heldWrapperStyle}
            heldRowStyle={heldRowStyle}
          />
        );
      })}
      {isGapBefore(items.length) ? (
        <View style={[styles.gap, gapStyle, { height: dragHeight }]} />
      ) : null}
    </View>
  );
};

// Memoized so moving the drop gap re-renders a couple of rows instead of the
// whole list; `renderItem` must therefore be called inside the row, not above.
const DraggableRow = memo(
  ({
    rowKey,
    item,
    index,
    held,
    gapHeight,
    gapStyle,
    renderItem,
    registerHeight,
    panHandlers,
    heldWrapperStyle,
    heldRowStyle,
  }: {
    rowKey: string;
    item: unknown;
    index: number;
    held: boolean;
    gapHeight: number;
    gapStyle?: ViewStyle;
    renderItem: (item: unknown, state: DraggableItemState) => ReactNode;
    registerHeight: (key: string, height: number) => void;
    panHandlers: GestureResponderHandlers;
    heldWrapperStyle: ViewStyle;
    heldRowStyle: Animated.WithAnimatedObject<ViewStyle>;
  }) => (
    <View
      onLayout={(event) =>
        registerHeight(rowKey, event.nativeEvent.layout.height)
      }
      style={held ? heldWrapperStyle : undefined}
    >
      {gapHeight > 0 ? (
        <View style={[styles.gap, gapStyle, { height: gapHeight }]} />
      ) : null}
      <Animated.View style={held ? heldRowStyle : undefined}>
        {renderItem(item, { index, held, panHandlers })}
      </Animated.View>
    </View>
  ),
);

const styles = StyleSheet.create({
  gap: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
  },
});
