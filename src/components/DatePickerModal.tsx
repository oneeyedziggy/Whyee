import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { getLocalDateKey } from '../lib/dates';
import { colors } from '../theme/tokens';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DatePickerModalProps {
  visible: boolean;
  date: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const buildWeeks = (monthDate: Date): (Date | null)[][] => {
  const firstOfMonth = startOfMonth(monthDate);
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0,
  ).getDate();
  const cells: (Date | null)[] = Array.from(
    { length: firstOfMonth.getDay() },
    () => null,
  );
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
};

export const DatePickerModal = ({
  visible,
  date,
  onSelect,
  onClose,
}: DatePickerModalProps) => {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(date));

  useEffect(() => {
    if (visible) setViewMonth(startOfMonth(date));
  }, [visible, date]);

  const selectedKey = getLocalDateKey(date);
  const todayKey = getLocalDateKey(new Date());
  const weeks = buildWeeks(viewMonth);
  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close date picker"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[styles.dialog, desktop && styles.dialogDesktop]}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Previous month"
              accessibilityRole="button"
              onPress={() =>
                setViewMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              style={styles.navButton}
            >
              <ChevronLeft color={colors.primary} size={20} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              accessibilityLabel="Next month"
              accessibilityRole="button"
              onPress={() =>
                setViewMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              style={styles.navButton}
            >
              <ChevronRight color={colors.primary} size={20} />
            </Pressable>
          </View>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {week.map((day, dayIndex) => {
                if (!day) {
                  return <View key={dayIndex} style={styles.dayCell} />;
                }
                const dayKey = getLocalDateKey(day);
                const isSelected = dayKey === selectedKey;
                const isToday = dayKey === todayKey;
                return (
                  <Pressable
                    key={dayIndex}
                    accessibilityLabel={day.toDateString()}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: isSelected,
                    }}
                    onPress={() => {
                      onSelect(day);
                      onClose();
                    }}
                    style={[
                      styles.dayCell,
                      styles.dayButton,
                      isToday && styles.dayToday,
                      isSelected && styles.daySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onSelect(new Date());
              onClose();
            }}
            style={styles.todayButton}
          >
            <Text style={styles.todayButtonText}>Jump to today</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    flex: 1,
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    width: '86%',
  },
  dialogDesktop: { width: 340 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    alignItems: 'center',
    aspectRatio: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  dayButton: { borderRadius: 8 },
  dayToday: { borderColor: colors.primary, borderWidth: 1 },
  daySelected: { backgroundColor: colors.primary },
  dayText: { color: colors.text, fontSize: 13 },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  todayButton: { alignItems: 'center', marginTop: 10, paddingVertical: 8 },
  todayButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
