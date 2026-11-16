import { act, renderHook } from '@testing-library/react-native';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import {
  moveToDropIndex,
  relativeRowOffsets,
  useDragReorder,
  type UseDragReorderOptions,
} from '../src/hooks/useDragReorder';

describe('relativeRowOffsets', () => {
  it('uses measured row positions instead of losing per-row spacing', () => {
    expect(relativeRowOffsets([800, 851, 902, 953], [44, 44, 44, 44])).toEqual([
      0, 51, 102, 153,
    ]);
  });

  it('falls back to cumulative heights until every row is measured', () => {
    expect(relativeRowOffsets([800, undefined, 902], [44, 51, 44])).toEqual([
      0, 44, 95,
    ]);
  });

  it('falls back when the measurements do not match the row count or are empty', () => {
    expect(relativeRowOffsets([10, 20], [5, 5, 5])).toEqual([0, 5, 10]);
    expect(relativeRowOffsets([], [])).toEqual([]);
  });
});

describe('moveToDropIndex', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves items down and up using pre-drag boundaries', () => {
    expect(moveToDropIndex(items, 0, 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveToDropIndex(items, 0, 4)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveToDropIndex(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns the same array for no-op drops and invalid sources', () => {
    expect(moveToDropIndex(items, 1, 1)).toBe(items);
    expect(moveToDropIndex(items, 1, 2)).toBe(items);
    expect(moveToDropIndex(items, -1, 2)).toBe(items);
    expect(moveToDropIndex(items, 4, 0)).toBe(items);
  });

  it('clamps out-of-range targets', () => {
    expect(moveToDropIndex(items, 2, -5)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveToDropIndex(items, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('useDragReorder', () => {
  let config: PanResponderCallbacks;
  const event = {} as GestureResponderEvent;
  const gesture = (values: Partial<PanResponderGestureState>) =>
    values as PanResponderGestureState;

  beforeEach(() => {
    const create = PanResponder.create.bind(PanResponder);
    jest.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
      config = callbacks;
      return create(callbacks);
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const keys = ['a', 'b', 'c'];
  const setup = async (overrides: Partial<UseDragReorderOptions> = {}) => {
    const props: UseDragReorderOptions = {
      length: keys.length,
      keyFor: (index) => keys[index],
      fallbackHeightFor: (index) => 30 + index,
      onDrop: jest.fn(),
      onDragChange: jest.fn(),
      ...overrides,
    };
    const rendered = await renderHook((options: UseDragReorderOptions) => useDragReorder(options), {
      initialProps: props,
    });
    return { ...rendered, props };
  };
  type Hook = ReturnType<typeof useDragReorder>;
  const measureRows = (result: { current: Hook }) => {
    // Rows sit 50px apart (40px tall plus spacing) starting at y=100.
    keys.forEach((key, index) => result.current.registerHeight(key, 100 + index * 50, 40));
  };
  const grab = (result: { current: Hook }, index: number, y0: number) =>
    act(async () => {
      expect(result.current.panHandlersFor(index).onStartShouldSetResponder!(event)).toBe(true);
      config.onPanResponderGrant!(event, gesture({ y0 }));
    });
  const moveTo = (moveY: number) =>
    act(async () => config.onPanResponderMove!(event, gesture({ moveY })));
  const translateY = (result: { current: Hook }) =>
    (
      result.current.heldRowStyle.transform[0].translateY as unknown as {
        __getValue: () => number;
      }
    ).__getValue();

  it('claims gestures and blocks parents from stealing them', async () => {
    await setup();

    expect(config.onStartShouldSetPanResponder!(event, gesture({}))).toBe(true);
    expect(config.onMoveShouldSetPanResponder!(event, gesture({}))).toBe(true);
    expect(config.onPanResponderTerminationRequest!(event, gesture({}))).toBe(false);
    expect(config.onShouldBlockNativeResponder!(event, gesture({}))).toBe(true);
    expect(PanResponder.create).toHaveBeenCalledTimes(1);
  });

  it('drags a row down using measured positions and drops it at the new boundary', async () => {
    const { result, props } = await setup();
    measureRows(result);
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.isGapBefore(1)).toBe(false);

    await grab(result, 0, 120);

    expect(props.onDragChange).toHaveBeenLastCalledWith(true);
    expect(result.current.dragIndex).toBe(0);
    expect(result.current.dropIndex).toBe(0);
    expect(result.current.dragHeight).toBe(40);
    // The gap stays parked right after the held row until it moves.
    expect(result.current.isGapBefore(1)).toBe(true);

    await moveTo(180);

    expect(result.current.dropIndex).toBe(2);
    expect(result.current.isGapBefore(2)).toBe(true);
    expect(translateY(result)).toBe(60);

    await act(async () => config.onPanResponderRelease!(event, gesture({})));

    expect(props.onDrop).toHaveBeenCalledWith(0, 2);
    expect(props.onDragChange).toHaveBeenLastCalledWith(false);
    expect(result.current.dragIndex).toBeNull();
    expect(result.current.dropIndex).toBeNull();
    expect(translateY(result)).toBe(0);
    expect(moveToDropIndex(keys, 0, 2)).toEqual(['b', 'a', 'c']);
  });

  it('cancels out the gap height when dragging above the original slot', async () => {
    const { result, props } = await setup();
    measureRows(result);

    await grab(result, 2, 220);
    await moveTo(100);

    expect(result.current.dropIndex).toBe(0);
    expect(result.current.isGapBefore(0)).toBe(true);
    expect(translateY(result)).toBe(-120 - 40);

    // Small moves within the same boundary keep the drop index stable.
    await moveTo(105);
    expect(result.current.dropIndex).toBe(0);
    expect(translateY(result)).toBe(-115 - 40);

    await act(async () => config.onPanResponderTerminate!(event, gesture({})));
    expect(props.onDrop).toHaveBeenCalledWith(2, 0);
  });

  it('clamps drops to the list end and to minBoundary', async () => {
    const { result, props, rerender } = await setup();
    measureRows(result);

    await grab(result, 0, 120);
    await moveTo(2000);
    expect(result.current.dropIndex).toBe(3);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));
    expect(props.onDrop).toHaveBeenLastCalledWith(0, 3);

    await rerender({ ...props, minBoundary: 1 });
    await grab(result, 2, 220);
    await moveTo(-2000);
    expect(result.current.dropIndex).toBe(1);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));
    expect(props.onDrop).toHaveBeenLastCalledWith(2, 1);
  });

  it('reports a no-op drop when released at the original slot', async () => {
    const { result, props } = await setup();
    measureRows(result);

    await grab(result, 1, 170);
    // Both boundaries around the held row mean "no move" and share one gap.
    await moveTo(168);
    expect(result.current.dropIndex).toBe(1);
    expect(result.current.isGapBefore(2)).toBe(true);
    await moveTo(172);
    expect(result.current.dropIndex).toBe(2);
    expect(result.current.isGapBefore(2)).toBe(true);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));

    expect(props.onDrop).toHaveBeenCalledWith(1, 2);
    expect(moveToDropIndex(keys, 1, 2)).toBe(keys);
  });

  it('ignores moves and releases that were never granted', async () => {
    const { result, props } = await setup();

    await moveTo(500);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));

    expect(result.current.dropIndex).toBeNull();
    expect(props.onDrop).not.toHaveBeenCalled();
    expect(props.onDragChange).toHaveBeenCalledWith(false);
  });

  it('works without an onDragChange callback', async () => {
    const { result, props } = await setup({ onDragChange: undefined });
    measureRows(result);

    await grab(result, 0, 120);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));

    expect(props.onDrop).toHaveBeenCalledWith(0, 0);
  });

  it('uses fallback heights for unmeasured rows and out-of-range handles', async () => {
    const { result, props } = await setup();

    await grab(result, 1, 0);
    expect(result.current.dragHeight).toBe(31);
    // Cumulative fallback offsets are 0, 30, 61; row 1's centre is at 45.5.
    await moveTo(40);
    expect(result.current.dropIndex).toBe(3);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));
    expect(props.onDrop).toHaveBeenLastCalledWith(1, 3);

    await grab(result, 5, 0);
    expect(result.current.dragHeight).toBe(35);
    await act(async () => config.onPanResponderTerminate!(event, gesture({})));
  });

  it('ignores layout reported mid-drag so the next gesture uses clean measurements', async () => {
    const { result, props } = await setup();
    measureRows(result);

    await grab(result, 0, 120);
    result.current.registerHeight('a', 0, 999);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));

    await grab(result, 0, 120);
    expect(result.current.dragHeight).toBe(40);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));
    expect(props.onDrop).toHaveBeenCalledTimes(2);
  });

  it('caches per-row handlers and routes move-start claims to the touched row', async () => {
    const { result, props } = await setup();
    measureRows(result);

    const first = result.current.panHandlersFor(2);
    expect(result.current.panHandlersFor(2)).toBe(first);
    expect(first.onMoveShouldSetResponder!(event)).toBe(true);
    await act(async () => config.onPanResponderGrant!(event, gesture({ y0: 220 })));
    expect(result.current.dragIndex).toBe(2);
    await act(async () => config.onPanResponderRelease!(event, gesture({})));
    expect(props.onDrop).toHaveBeenCalledWith(2, 2);
  });

  it('falls back to false when the responder lacks claim handlers', async () => {
    jest.mocked(PanResponder.create).mockImplementationOnce((callbacks) => {
      config = callbacks;
      return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
    });
    const { result } = await setup();

    const handlers = result.current.panHandlersFor(0);
    expect(handlers.onStartShouldSetResponder!(event)).toBe(false);
    expect(handlers.onMoveShouldSetResponder!(event)).toBe(false);
  });

  it('exposes stable held-row styling', async () => {
    const { result, rerender, props } = await setup();
    const { heldRowStyle, heldWrapperStyle, registerHeight } = result.current;

    await rerender({ ...props, length: 2 });

    expect(result.current.heldRowStyle).toBe(heldRowStyle);
    expect(result.current.registerHeight).toBe(registerHeight);
    expect(heldWrapperStyle).toEqual({ height: 0, overflow: 'visible', zIndex: 20, elevation: 20 });
    expect(heldRowStyle).toMatchObject({ zIndex: 20, elevation: 20 });
  });
});
