import { act, renderHook } from '@testing-library/react-native';
import { useSwipePager } from '../src/hooks/useSwipePager';

type PanEvent = { translationX: number; velocityX: number };
type PanBuilder = {
  enabledValue?: boolean;
  activeOffset?: number[];
  failOffset?: number[];
  update?: (event: PanEvent) => void;
  end?: (event: PanEvent) => void;
};

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      const builder: Record<string, unknown> = {};
      builder.enabled = (value: boolean) => ((builder.enabledValue = value), builder);
      builder.activeOffsetX = (value: number[]) => ((builder.activeOffset = value), builder);
      builder.failOffsetY = (value: number[]) => ((builder.failOffset = value), builder);
      builder.onUpdate = (handler: unknown) => ((builder.update = handler), builder);
      builder.onEnd = (handler: unknown) => ((builder.end = handler), builder);
      return builder;
    },
  },
}));

jest.mock('react-native-reanimated', () => {
  const { useRef } = require('react');
  return {
    clamp: (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (initial: number) => useRef({ value: initial }).current,
    withTiming: (value: number, config: { duration: number }) => ({
      animateTo: value,
      duration: config.duration,
    }),
  };
});

type Translate = { animateTo: number; duration: number } | number;
type Result = ReturnType<typeof useSwipePager>;

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const flushFrames = () =>
  act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });

beforeEach(() => {
  frames.clear();
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id as number);
  });
});

afterEach(() => jest.restoreAllMocks());

const gesture = (result: { current: Result }) =>
  result.current.swipeGesture as unknown as PanBuilder;
const translateX = (result: { current: Result }) =>
  (result.current.pagerStyle as unknown as { transform: [{ translateX: Translate }] })
    .transform[0].translateX;

const renderPager = (desktop: boolean, width = 400) =>
  renderHook(({ wide }: { wide: number }) => useSwipePager(desktop, wide), {
    initialProps: { wide: width },
  });

it('lazily mounts the stats page on the next frame for mobile layouts', async () => {
  const { result } = await renderPager(false);

  expect(result.current.page).toBe('daily');
  expect(result.current.statsMounted).toBe(false);
  expect(gesture(result)).toMatchObject({
    enabledValue: true,
    activeOffset: [-20, 20],
    failOffset: [-15, 15],
  });

  await flushFrames();

  expect(result.current.statsMounted).toBe(true);
  expect(frames.size).toBe(0);
});

it('cancels the pending mount frame on unmount', async () => {
  const { result, unmount } = await renderPager(false);
  expect(frames.size).toBe(1);

  await unmount();

  expect(frames.size).toBe(0);
  expect(result.current.statsMounted).toBe(false);
});

it('mounts stats immediately and ignores gestures on desktop', async () => {
  const { result } = await renderPager(true);

  expect(result.current.statsMounted).toBe(true);
  expect(frames.size).toBe(0);
  expect(gesture(result).enabledValue).toBe(false);
  const before = translateX(result);

  await act(async () => {
    gesture(result).update!({ translationX: -300, velocityX: 0 });
    gesture(result).end!({ translationX: -300, velocityX: -2000 });
  });

  expect(result.current.page).toBe('daily');
  expect(translateX(result)).toEqual(before);
});

it('animates to the page selected programmatically and when the width changes', async () => {
  const { result, rerender } = await renderPager(false, 400);
  expect(translateX(result)).toBe(0);

  // The style is read during render, so each effect update shows up on the following render.
  await act(async () => result.current.setPage('stats'));
  await rerender({ wide: 400 });
  expect(result.current.page).toBe('stats');
  expect(translateX(result)).toEqual({ animateTo: -400, duration: 220 });

  await rerender({ wide: 300 });
  await rerender({ wide: 300 });
  expect(translateX(result)).toEqual({ animateTo: -300, duration: 220 });
});

it('tracks the finger within bounds while dragging', async () => {
  const { result, rerender } = await renderPager(false, 400);

  gesture(result).update!({ translationX: -150, velocityX: 0 });
  await rerender({ wide: 400 });
  expect(translateX(result)).toBe(-150);

  gesture(result).update!({ translationX: 200, velocityX: 0 });
  await rerender({ wide: 400 });
  expect(translateX(result)).toBe(0);

  gesture(result).update!({ translationX: -900, velocityX: 0 });
  await rerender({ wide: 400 });
  expect(translateX(result)).toBe(-400);

  await act(async () => result.current.setPage('stats'));
  gesture(result).update!({ translationX: 100, velocityX: 0 });
  await rerender({ wide: 400 });
  expect(translateX(result)).toBe(-300);
});

const release = (result: { current: Result }, translationX: number, velocityX: number) =>
  act(async () => {
    gesture(result).update!({ translationX, velocityX });
    gesture(result).end!({ translationX, velocityX });
  });

it('switches pages once a drag passes 30% of the width, before the midpoint', async () => {
  const { result } = await renderPager(false, 400);

  await release(result, -150, 0);
  expect(result.current.page).toBe('stats');
  expect(translateX(result)).toEqual({ animateTo: -400, duration: 220 });

  await release(result, 150, 0);
  expect(result.current.page).toBe('daily');
  expect(translateX(result)).toEqual({ animateTo: 0, duration: 220 });
});

it('switches pages on a fast flick even when the drag is short', async () => {
  const { result } = await renderPager(false, 400);

  await release(result, -30, -900);
  expect(result.current.page).toBe('stats');

  await release(result, 30, 900);
  expect(result.current.page).toBe('daily');
});

it('follows the flick direction over a small opposing drag', async () => {
  const { result, rerender } = await renderPager(false, 400);

  await release(result, -40, 1200);
  await rerender({ wide: 400 });

  expect(result.current.page).toBe('daily');
  expect(translateX(result)).toEqual({ animateTo: 0, duration: 220 });
});

it('snaps back for short, slow drags and drags past the outer edge', async () => {
  const { result, rerender } = await renderPager(false, 400);

  await release(result, -100, -300);
  await rerender({ wide: 400 });
  expect(result.current.page).toBe('daily');
  expect(translateX(result)).toEqual({ animateTo: 0, duration: 220 });

  await release(result, 300, 0);
  await rerender({ wide: 400 });
  expect(result.current.page).toBe('daily');
  expect(translateX(result)).toEqual({ animateTo: 0, duration: 220 });
});
