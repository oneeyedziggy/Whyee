import type { PropsWithChildren } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

interface SystemScreenProps extends PropsWithChildren {
  accessibilityViewIsModal?: boolean;
  backgroundColor?: string;
  edges?: Edge[];
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SystemScreen = ({
  accessibilityViewIsModal,
  backgroundColor = colors.canvas,
  children,
  edges = ['top', 'bottom'],
  enabled = true,
  style,
}: SystemScreenProps) => {
  if (!enabled)
    return (
      <View
        accessibilityViewIsModal={accessibilityViewIsModal}
        style={[styles.root, style]}
      >
        {children}
      </View>
    );

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView
        accessibilityViewIsModal={accessibilityViewIsModal}
        edges={edges}
        style={[styles.root, { backgroundColor }, style]}
      >
        {children}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({ root: { flex: 1 } });
