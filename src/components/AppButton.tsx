import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, shadows } from '../theme/tokens';

export const AppButton = ({
  title,
  onPress,
  variant = 'primary',
  size = 'compact',
  disabled = false,
  loading = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
  size?: 'compact' | 'block' | 'utility';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}) => {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'block' && styles.block,
        size === 'utility' && styles.utility,
        variant === 'danger' && styles.danger,
        unavailable && styles.disabled,
        pressed && !unavailable && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.onPrimary} /> : null}
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 6,
    boxShadow: shadows.soft,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
  },
  block: { minHeight: 48, width: '100%' },
  utility: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    maxWidth: 520,
    minHeight: 48,
    width: '90%',
  },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  text: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
});
