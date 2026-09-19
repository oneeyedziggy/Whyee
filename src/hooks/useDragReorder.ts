import { useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderInstance,
} from 'react-native';

// Style for the wrapper that holds the dragged row in place: collapsing it to
// zero height (while keeping the same element mounted) lets the other rows
// reflow around it without ever unmounting the responder mid-gesture. It also
// has to out-rank its siblings so the row floats above them.
const HELD_WRAPPER_STYLE = {
  height: 0,
  overflow: 'visible' as const,
  zIndex: 20,
  elevation: 20,
};

// Turns a raw drop boundary (as produced by useDragReorder's onDrop) into the
// actual splice target, accounting for the dragged item's own removal.
export const moveToDropIndex = <T>(
  items: T[],
  from: number,
  to: number,
): T[] => {
  if (from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(to, items.length));
  const insertAt = target > from ? target - 1 : target;
  if (insertAt === from) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(insertAt, 0, moved);
  return next;
};

// Drag-to-reorder for a vertical list of rows with possibly-uneven heights.
// The dragged row must stay mounted for the whole gesture (see registerHeight/
// panHandlersFor usage below) or the OS/RN responder session gets terminated
// mid-drag, which is what silently breaks reordering.
export interface UseDragReorderOptions {
  length: number;
  keyFor: (index: number) => string;
  fallbackHeightFor: (index: number) => number;
  // `to` is a boundary index (0..length) in the pre-drag list, not a final array index.
  onDrop: (from: number, to: number) => void;
  onDragChange?: (dragging: boolean) => void;
  minBoundary?: number;
}

export const useDragReorder = ({
  length,
  keyFor,
  fallbackHeightFor,
  onDrop,
  onDragChange,
  minBoundary = 0,
}: UseDragReorderOptions) => {
  const heights = useRef<Record<string, number>>({});
  const layout = useRef<{ offsets: number[]; sizes: number[] }>({
    offsets: [],
    sizes: [],
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState(fallbackHeightFor(0));
  const translate = useRef(new Animated.Value(0)).current;
  const dragState = useRef({ index: -1, drop: -1, startY: 0 });
  // The responder below is created once, so every callback has to read the
  // current props through this ref instead of a stale render closure.
  const options = useRef<UseDragReorderOptions>({
    length,
    keyFor,
    fallbackHeightFor,
    onDrop,
    onDragChange,
    minBoundary,
  });
  options.current = {
    length,
    keyFor,
    fallbackHeightFor,
    onDrop,
    onDragChange,
    minBoundary,
  };

  const measure = () => {
    const current = options.current;
    let running = 0;
    const offsets: number[] = [];
    const sizes: number[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const height =
        heights.current[current.keyFor(index)] ??
        current.fallbackHeightFor(index);
      offsets.push(running);
      sizes.push(height);
      running += height;
    }
    layout.current = { offsets, sizes };
  };

  const boundaryFor = (pointerY: number): number => {
    const { length: count, minBoundary: floor = 0 } = options.current;
    const { offsets, sizes } = layout.current;
    for (let index = floor; index < count; index += 1) {
      if (pointerY < offsets[index] + sizes[index] / 2) return index;
    }
    return count;
  };

  const commit = () => {
    const { index, drop } = dragState.current;
    dragState.current = { index: -1, drop: -1, startY: 0 };
    setDragIndex(null);
    setDropIndex(null);
    translate.setValue(0);
    options.current.onDragChange?.(false);
    if (index >= 0 && drop >= 0) options.current.onDrop(index, drop);
  };

  // Stable identity so memoized rows are not invalidated by every render.
  const registerHeight = useRef((key: string, height: number) => {
    // Layout reported mid-drag reflects the collapsed row and the drop gap, so
    // it would corrupt the measurements used for the next gesture.
    if (dragState.current.index >= 0) return;
    heights.current[key] = height;
  }).current;

  // A single PanResponder for the whole list: re-creating it per render (which
  // happens on every drop-index change) resets its internal gesture state and
  // makes `dy` snap back to zero mid-drag.
  const pendingIndex = useRef(0);
  const responder = useRef<PanResponderInstance | null>(null);
  if (!responder.current) {
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the gesture away from any enclosing ScrollView.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (_event, gesture) => {
        const index = pendingIndex.current;
        measure();
        dragState.current = { index, drop: index, startY: gesture.y0 };
        setDragHeight(
          layout.current.sizes[index] ??
            options.current.fallbackHeightFor(index),
        );
        setDragIndex(index);
        setDropIndex(index);
        translate.setValue(0);
        options.current.onDragChange?.(true);
      },
      // Absolute pointer position, not `gestureState.dy`: `dy` accumulates
      // per-event deltas, so any move event coalesced away while the list
      // re-renders is lost for good and the row falls ever further behind.
      onPanResponderMove: (_event, gesture) => {
        const { index, startY } = dragState.current;
        if (index < 0) return;
        const { offsets, sizes } = layout.current;
        const delta = gesture.moveY - startY;
        const pointerY = offsets[index] + sizes[index] / 2 + delta;
        const boundary = Math.max(
          options.current.minBoundary ?? 0,
          boundaryFor(pointerY),
        );
        if (boundary !== dragState.current.drop) {
          dragState.current = { ...dragState.current, drop: boundary };
          setDropIndex(boundary);
        }
        // A gap rendered above the held row pushes its collapsed wrapper down
        // by one gap height, which has to be cancelled out here.
        const shift = dragState.current.drop < index ? sizes[index] : 0;
        translate.setValue(delta - shift);
      },
      onPanResponderRelease: commit,
      onPanResponderTerminate: commit,
    });
  }

  // Cached per index so the handle keeps the same props object across renders.
  const handlerCache = useRef(
    new Map<number, PanResponderInstance['panHandlers']>(),
  ).current;
  const panHandlersFor = (
    index: number,
  ): PanResponderInstance['panHandlers'] => {
    const cached = handlerCache.get(index);
    if (cached) return cached;
    const handlers = responder.current!.panHandlers;
    const claimed = {
      ...handlers,
      onStartShouldSetResponder: (event: GestureResponderEvent) => {
        pendingIndex.current = index;
        return handlers.onStartShouldSetResponder?.(event) ?? false;
      },
      onMoveShouldSetResponder: (event: GestureResponderEvent) => {
        pendingIndex.current = index;
        return handlers.onMoveShouldSetResponder?.(event) ?? false;
      },
    };
    handlerCache.set(index, claimed);
    return claimed;
  };

  // `dropIndex` is a boundary in the pre-drag list, where the dragged row's own
  // index and the boundary just after it both mean "no move". Collapsing those
  // two onto the one after keeps the gap parked in the row's original slot (the
  // list would otherwise close up and jump on pickup) and makes the gap appear
  // symmetrically when dragging up or down.
  const gapIndex =
    dragIndex === null
      ? null
      : dropIndex === dragIndex
        ? dragIndex + 1
        : dropIndex;
  const isGapBefore = (index: number) => gapIndex === index;

  const heldRowStyle = useRef({
    transform: [{ translateY: translate }],
    zIndex: 20,
    elevation: 20,
  }).current;

  return {
    dragIndex,
    dropIndex,
    dragHeight,
    registerHeight,
    panHandlersFor,
    isGapBefore,
    heldWrapperStyle: HELD_WRAPPER_STYLE,
    heldRowStyle,
  };
};
