import { Pressable, StyleSheet, View } from 'react-native';
import { shadows } from '../theme/tokens';

const TRACK_WIDTH = 32 * 0.85;
const TRACK_HEIGHT = 18 * 0.85;
// The ball overhangs the channel by a pixel on each side.
const BALL = TRACK_HEIGHT + 2;

// Custom toggle (not the platform Switch) so every screen shares one size, ball and shadow.
export const ToggleSwitch = ({
  accessibilityLabel,
  accessibilityHint,
  value,
  disabled,
  onValueChange,
}: {
  accessibilityLabel: string;
  accessibilityHint?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) => (
  <Pressable
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
    accessibilityRole="switch"
    accessibilityState={{ checked: value, disabled }}
    disabled={disabled}
    hitSlop={8}
    onPress={() => onValueChange(!value)}
    style={[
      styles.track,
      value && styles.trackOn,
      disabled && styles.disabled,
    ]}
    {...{ onValueChange }}
  >
    <View style={[styles.ball, value && styles.ballOn]} />
  </Pressable>
);

const styles = StyleSheet.create({
  track: {
    backgroundColor: '#8fa6c4',
    borderRadius: TRACK_HEIGHT / 2,
    boxShadow: shadows.soft,
    height: TRACK_HEIGHT,
    width: TRACK_WIDTH,
  },
  trackOn: { backgroundColor: 'rgb(33, 150, 243)' },
  disabled: { opacity: 0.5 },
  ball: {
    backgroundColor: '#fff',
    borderRadius: BALL / 2,
    boxShadow: shadows.soft,
    height: BALL,
    left: -1,
    position: 'absolute',
    top: -1,
    width: BALL,
  },
  ballOn: {
    backgroundColor: 'rgb(22, 103, 200)',
    left: TRACK_WIDTH - BALL + 1,
  },
});
