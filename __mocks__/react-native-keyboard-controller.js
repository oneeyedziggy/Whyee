// Manual mock for Jest: react-native-keyboard-controller ships native modules that aren't
// available in the test environment, so tests get a lightweight RN ScrollView-based stand-in.
const React = require('react');
const { ScrollView } = require('react-native');

const KeyboardAwareScrollView = React.forwardRef((props, ref) =>
  React.createElement(ScrollView, { ...props, ref }),
);

module.exports = {
  KeyboardProvider: ({ children }) => children,
  KeyboardContext: React.createContext({}),
  KeyboardAwareScrollView,
  KeyboardAvoidingView: ScrollView,
  KeyboardStickyView: ({ children }) => children,
  KeyboardToolbar: () => null,
  DefaultKeyboardToolbarTheme: {},
  KeyboardChatScrollView: KeyboardAwareScrollView,
  OverKeyboardView: ({ children }) => children,
  KeyboardExtender: () => null,
  useKeyboardAnimation: () => ({
    height: { value: 0 },
    progress: { value: 0 },
  }),
  useKeyboardHandler: () => {},
  useReanimatedKeyboardAnimation: () => ({
    height: { value: 0 },
    progress: { value: 0 },
  }),
};
