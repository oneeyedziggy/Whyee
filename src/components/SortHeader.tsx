import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import type { SortDirection } from '../lib/sort';
import { colors } from '../theme/tokens';
import { HoverTitle } from './HoverTitle';

export const SortHeader = ({
  label,
  direction,
  onPress,
  style,
  hint,
}: {
  label: string;
  direction: SortDirection;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  hint?: string;
}) => {
  const directionLabel =
    direction === 'asc'
      ? 'ascending'
      : direction === 'desc'
        ? 'descending'
        : 'unsorted';
  const accessibilityLabel = `${label}, ${directionLabel}. Activate to change sort order.`;

  const header = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.header, style]}
    >
      <View style={styles.content}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.glyphs}>
          <View
            style={[
              styles.triangleUp,
              direction === 'asc' && styles.triangleActive,
            ]}
          />
          <View
            style={[
              styles.triangleDown,
              direction === 'desc' && styles.triangleActive,
            ]}
          />
        </View>
      </View>
    </Pressable>
  );

  // react-native-web drops `title` on Pressable, so the hint tooltip needs a DOM wrapper.
  return hint ? <HoverTitle text={hint}>{header}</HoverTitle> : header;
};

const styles = StyleSheet.create({
  header: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  label: { color: colors.text, fontSize: 11, fontWeight: '700' },
  glyphs: {
    alignItems: 'center',
    flexDirection: 'column',
    marginLeft: 4,
  },
  // Pure CSS-triangle trick: a zero-size box with only one visible border edge.
  triangleUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#b9c3cf',
    marginBottom: 2,
  },
  triangleDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#b9c3cf',
  },
  triangleActive: {
    borderBottomColor: colors.text,
    borderTopColor: colors.text,
  },
});
