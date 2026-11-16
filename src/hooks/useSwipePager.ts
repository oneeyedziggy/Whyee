import { useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const useSwipePager = (desktop: boolean, width: number) => {
  const [page, setPage] = useState<'daily' | 'stats'>('daily');
  const [statsMounted, setStatsMounted] = useState(desktop);
  const pageTranslate = useSharedValue(0);

  useEffect(() => {
    if (statsMounted) return undefined;
    const frame = requestAnimationFrame(() => setStatsMounted(true));
    return () => cancelAnimationFrame(frame);
  }, [statsMounted]);

  useEffect(() => {
    pageTranslate.value = withTiming(page === 'daily' ? 0 : -width, {
      duration: 220,
    });
  }, [page, pageTranslate, width]);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!desktop)
        .activeOffsetX([-20, 20])
        .failOffsetY([-15, 15])
        .onUpdate((event) => {
          if (desktop) return;
          const base = page === 'daily' ? 0 : -width;
          pageTranslate.value = clamp(base + event.translationX, -width, 0);
        })
        .onEnd((event) => {
          if (desktop) return;
          const flicked = Math.abs(event.velocityX) > 800;
          const shouldSwitch =
            Math.abs(event.translationX) > width * 0.3 || flicked;
          // A flick follows its velocity; otherwise follow the drag direction.
          const direction = flicked ? event.velocityX : event.translationX;
          const next = shouldSwitch
            ? direction < 0
              ? 'stats'
              : 'daily'
            : page;
          pageTranslate.value = withTiming(next === 'daily' ? 0 : -width, {
            duration: 220,
          });
          if (next !== page) runOnJS(setPage)(next);
        }),
    [desktop, page, pageTranslate, width],
  );

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageTranslate.value }],
  }));

  return { page, setPage, statsMounted, swipeGesture, pagerStyle };
};
