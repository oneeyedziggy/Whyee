import type { PropsWithChildren } from 'react';
import { Animated } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import {
  KeyboardContext,
  type KeyboardAnimationContext,
} from 'react-native-keyboard-controller';

const noop = () => {};
const nestedNoop = () => noop;

// react-native-keyboard-controller (through 1.22.5) doesn't export a real `KeyboardProvider`,
// but `useKeyboardContext` still warns in dev unless some non-default context value is supplied.
// Our usage (KeyboardAwareScrollView's auto-scroll + keyboardDismissMode) works off native
// event bindings regardless, so this just supplies an inert value to silence that warning.
export const KeyboardProvider = ({ children }: PropsWithChildren) => {
  const progress = useSharedValue(0);
  const height = useSharedValue(0);
  const layout =
    useSharedValue<KeyboardAnimationContext['layout']['value']>(null);
  const value: KeyboardAnimationContext = {
    enabled: true,
    animated: {
      progress: new Animated.Value(0),
      height: new Animated.Value(0) as Animated.AnimatedMultiplication<number>,
    },
    reanimated: { progress, height },
    layout,
    update: () => Promise.resolve(),
    setKeyboardHandlers: nestedNoop,
    setInputHandlers: nestedNoop,
    setEnabled: noop,
  };
  return (
    <KeyboardContext.Provider value={value}>
      {children}
    </KeyboardContext.Provider>
  );
};
