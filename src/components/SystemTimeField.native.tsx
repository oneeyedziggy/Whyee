import { Calendar, Clock } from 'lucide-react-native';
import { useState } from 'react';
import {
  Button,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { colors } from '../theme/tokens';

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

const iconFor = (mode: SystemTimeFieldMode) =>
  mode === 'date' ? Calendar : Clock;

// Android has no combined date+time dialog: chain a date picker into a time picker.
const openAndroid = (props: SystemTimeFieldProps) => {
  const { mode, value, onChange, is24Hour = true } = props;
  if (mode === 'time') {
    DateTimePickerAndroid.open({
      value,
      mode: 'time',
      is24Hour,
      onValueChange: (_event, next) => {
        if (next) onChange(next);
      },
    });
    return;
  }
  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    onValueChange: (_event, dateOnly) => {
      if (!dateOnly) return;
      if (mode === 'date') {
        onChange(dateOnly);
        return;
      }
      DateTimePickerAndroid.open({
        value: dateOnly,
        mode: 'time',
        is24Hour,
        onValueChange: (_timeEvent, next) => {
          if (next) onChange(next);
        },
      });
    },
  });
};

export const SystemTimeField = (props: SystemTimeFieldProps) => {
  const {
    mode,
    value,
    onChange,
    disabled,
    is24Hour = true,
    accessibilityLabel,
    compact,
  } = props;
  const [iosVisible, setIosVisible] = useState(false);
  const Icon = iconFor(mode);

  const open = () => {
    if (Platform.OS === 'android') {
      openAndroid(props);
      return;
    }
    setIosVisible(true);
  };

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={6}
        onPress={open}
        style={[
          styles.button,
          compact && styles.buttonCompact,
          disabled && styles.buttonDisabled,
        ]}
      >
        <View pointerEvents="none">
          <Icon
            color={disabled ? colors.muted : colors.primary}
            size={compact ? 14 : 18}
          />
        </View>
      </Pressable>
      {Platform.OS === 'ios' && iosVisible ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setIosVisible(false)}
          transparent
          visible={iosVisible}
        >
          <Pressable
            accessibilityLabel="Dismiss picker"
            onPress={() => setIosVisible(false)}
            style={styles.backdrop}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <DateTimePicker
                display="spinner"
                is24Hour={is24Hour}
                mode={
                  mode === 'date'
                    ? 'date'
                    : mode === 'time'
                      ? 'time'
                      : 'datetime'
                }
                onValueChange={(_event, next) => {
                  if (next) onChange(next);
                }}
                value={value}
              />
              {/* @react-native-community/datetimepicker's `is24Hour` prop only affects Android;
                  the iOS spinner follows the device locale, so this gives an explicit,
                  locale-independent AM/PM indicator + toggle for 12h mode. */}
              {mode !== 'date' && is24Hour === false ? (
                <View style={styles.meridiemRow}>
                  {(['AM', 'PM'] as const).map((meridiem) => {
                    const active =
                      (meridiem === 'AM') === value.getHours() < 12;
                    return (
                      <Pressable
                        accessibilityLabel={`Set ${meridiem}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        key={meridiem}
                        onPress={() => {
                          if (active) return;
                          const next = new Date(value);
                          next.setHours((value.getHours() + 12) % 24);
                          onChange(next);
                        }}
                        style={[
                          styles.meridiemButton,
                          active && styles.meridiemButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.meridiemText,
                            active && styles.meridiemTextActive,
                          ]}
                        >
                          {meridiem}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <View style={styles.sheetActions}>
                <Button title="Done" onPress={() => setIosVisible(false)} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 28,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  buttonCompact: { minHeight: 28, minWidth: 24, paddingHorizontal: 2 },
  buttonDisabled: { opacity: 0.5 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: { backgroundColor: colors.surface, padding: 12 },
  meridiemRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  meridiemButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  meridiemButtonActive: { backgroundColor: colors.primary },
  meridiemText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  meridiemTextActive: { color: '#ffffff' },
  sheetActions: { alignItems: 'flex-end', marginTop: 8 },
});
