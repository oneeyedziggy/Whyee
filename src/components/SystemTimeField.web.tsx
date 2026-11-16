// react-native-web renders through react-dom, so the browser's own date/time popovers are
// available here as a hidden overlaid input triggered by the same icon the native sheet uses.
import { useRef, type CSSProperties } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import { colors } from '../theme/tokens';
import { HoverTitle } from './HoverTitle';

export type SystemTimeFieldMode = 'time' | 'date' | 'datetime';

export interface SystemTimeFieldProps {
  mode: SystemTimeFieldMode;
  value: Date;
  onChange: (value: Date) => void;
  disabled?: boolean;
  is24Hour?: boolean;
  accessibilityLabel: string;
  compact?: boolean;
}

const pad = (value: number): string => value.toString().padStart(2, '0');

const toInputValue = (mode: SystemTimeFieldMode, value: Date): string =>
  mode === 'date'
    ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    : `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;

export const SystemTimeField = ({
  mode,
  value,
  onChange,
  disabled,
  accessibilityLabel,
  compact,
}: SystemTimeFieldProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const Icon = mode === 'date' ? Calendar : Clock;
  const apply = (raw: string) => {
    if (!raw) return;
    const next = new Date(value);
    if (mode === 'date') {
      const [year, month, day] = raw.split('-').map(Number);
      next.setFullYear(year, month - 1, day);
    } else {
      const [hours, minutes, seconds] = raw.split(':').map(Number);
      next.setHours(hours, minutes, seconds || 0, 0);
    }
    onChange(next);
  };
  const open = () => {
    // Disabled Pressables never fire onPress, and the input ref is attached while mounted.
    const input = inputRef.current as HTMLInputElement;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };
  return (
    <HoverTitle text={accessibilityLabel}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={disabled}
        onPress={open}
        style={[
          styles.button,
          compact && styles.buttonCompact,
          disabled && styles.buttonDisabled,
        ]}
      >
        <View style={styles.iconWrap}>
          <Icon
            color={disabled ? colors.muted : colors.primary}
            size={compact ? 14 : 18}
          />
        </View>
        <input
          aria-hidden
          disabled={disabled}
          onChange={(event) => apply(event.target.value)}
          // The focus/click fallback in open() must not bubble back into the Pressable.
          onClick={(event) => event.stopPropagation()}
          ref={inputRef}
          step={mode === 'date' ? undefined : 1}
          style={hiddenInput}
          tabIndex={-1}
          type={mode === 'date' ? 'date' : 'time'}
          value={toInputValue(mode, value)}
        />
      </Pressable>
    </HoverTitle>
  );
};

// Clicks go to the Pressable; the input only anchors and hosts the native popover.
const hiddenInput: CSSProperties = {
  border: 0,
  height: '100%',
  left: 0,
  opacity: 0,
  padding: 0,
  pointerEvents: 'none',
  position: 'absolute',
  top: 0,
  width: '100%',
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    cursor: 'pointer',
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 28,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  buttonCompact: { minHeight: 28, minWidth: 24, paddingHorizontal: 2 },
  buttonDisabled: { opacity: 0.5 },
  iconWrap: { pointerEvents: 'none' },
});
