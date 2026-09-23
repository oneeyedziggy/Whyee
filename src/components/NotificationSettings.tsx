import {
  Alert,
  Button,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { expandNotificationSchedule } from '../lib/notificationSchedule';
import { notificationService } from '../lib/notificationService';
import { SystemTimeField } from './SystemTimeField';
import type {
  CategoryDefinition,
  NotificationSchedule,
  NotificationTime,
} from '../types/category';
import { colors } from '../theme/tokens';

const weekdays = [
  ['Sun', 1],
  ['Mon', 2],
  ['Tue', 3],
  ['Wed', 4],
  ['Thu', 5],
  ['Fri', 6],
  ['Sat', 7],
] as const;

const defaultSchedule = (category: CategoryDefinition): NotificationSchedule =>
  category.notificationSchedule ?? {
    enabled: false,
    times: [
      {
        id: `${category.id}-time-1`,
        hour: 9,
        minute: 0,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  };

const formatTime = (time: NotificationTime): string =>
  `${`${time.hour}`.padStart(2, '0')}:${`${time.minute}`.padStart(2, '0')}`;

const parseTime = (text: string): { hour: number; minute: number } | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
};

export const NotificationSettings = ({
  category,
  visible,
  onClose,
  onUpdate,
}: {
  category: CategoryDefinition;
  visible: boolean;
  onClose: () => void;
  onUpdate: (category: CategoryDefinition) => void;
}) => {
  const [draft, setDraft] = useState(() => defaultSchedule(category));
  const [saving, setSaving] = useState(false);
  const toggleWeekday = (timeId: string, weekday: number) =>
    setDraft((current) => ({
      ...current,
      times: current.times.map((time) =>
        time.id !== timeId
          ? time
          : {
              ...time,
              weekdays: time.weekdays.includes(weekday)
                ? time.weekdays.filter((value) => value !== weekday)
                : [...time.weekdays, weekday].sort(
                    (left, right) => left - right,
                  ),
            },
      ),
    }));
  const setTime = (id: string, hour: number, minute: number) =>
    setDraft((current) => ({
      ...current,
      times: current.times.map((time) =>
        time.id === id ? { ...time, hour, minute } : time,
      ),
    }));
  const updateTime = (id: string, text: string) => {
    const parsed = parseTime(text);
    if (!parsed) return;
    setTime(id, parsed.hour, parsed.minute);
  };
  const save = async () => {
    if (draft.enabled && !category.enabled) {
      Alert.alert(
        'Category is disabled',
        'Enable the category before scheduling reminders.',
      );
      return;
    }
    if (
      !draft.times.length ||
      draft.times.some((time) => !time.weekdays.length)
    ) {
      Alert.alert('Choose a schedule', 'Select at least one day and one time.');
      return;
    }
    if (draft.times.length > 1 && !category.allowMultiplePerDay) {
      Alert.alert(
        'Multiple entries are disabled',
        'Enable Allow multiple per day before adding more than one reminder.',
      );
      return;
    }
    const specs = expandNotificationSchedule(draft);
    if (specs.length > 64) {
      Alert.alert(
        'Schedule is too large',
        'Reduce the number of days or times.',
      );
      return;
    }
    setSaving(true);
    try {
      if (draft.enabled && !(await notificationService.requestPermission())) {
        Alert.alert(
          'Notifications are disabled',
          'Allow notifications in system settings, then try again.',
        );
        return;
      }
      await notificationService.cancelCategory(category.id);
      if (draft.enabled)
        await notificationService.scheduleCategory(category, specs);
      onUpdate({ ...category, notificationSchedule: draft });
    } catch {
      // notificationService already logs a warning and no-ops (e.g. Expo Go on SDK 53+ lacks
      // Android notification support there); still save the schedule so it applies once built.
      onUpdate({ ...category, notificationSchedule: draft });
    } finally {
      setSaving(false);
    }
  };
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <View
        accessible
        accessibilityLabel={`Set notification for ${category.name}`}
        style={[styles.backdrop, { paddingTop: insets.top + 16 }]}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={styles.sheet}
          keyboardDismissMode="on-drag"
          style={styles.sheetScroll}
        >
          <Pressable
            accessibilityLabel="Close set notification dialog"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <X color={colors.muted} size={20} />
          </Pressable>
          <Text style={styles.title}>Set notification</Text>
          <Text style={styles.categoryName}>{category.name}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Enabled</Text>
            <Switch
              accessibilityLabel={`Notifications for ${category.name}`}
              accessibilityState={{ checked: draft.enabled }}
              value={draft.enabled}
              onValueChange={(enabled) =>
                setDraft((current) => ({ ...current, enabled }))
              }
            />
          </View>
          <Text style={styles.label}>Times</Text>
          {draft.times.map((time) => (
            <View key={time.id} style={styles.timeGroup}>
              <View style={styles.timeRow}>
                <TextInput
                  accessibilityLabel={`Reminder time ${formatTime(time)}`}
                  defaultValue={formatTime(time)}
                  onEndEditing={(event) =>
                    updateTime(time.id, event.nativeEvent.text)
                  }
                  placeholder="09:00"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.timeInput, styles.timeInputFlex]}
                />
                <SystemTimeField
                  accessibilityLabel={`Open system picker for reminder time ${formatTime(time)}`}
                  is24Hour={
                    category.kind === 'duration'
                      ? category.duration.use24HourClock !== false
                      : true
                  }
                  mode="time"
                  onChange={(value) =>
                    setTime(time.id, value.getHours(), value.getMinutes())
                  }
                  value={new Date(0, 0, 0, time.hour, time.minute)}
                />
                {draft.times.length > 1 ? (
                  <Button
                    title="Remove"
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        times: current.times.filter(
                          (candidate) => candidate.id !== time.id,
                        ),
                      }))
                    }
                  />
                ) : null}
              </View>
              <Text style={styles.daysLabel}>Days</Text>
              <View style={styles.days}>
                {weekdays.map(([label, weekday]) => {
                  const selected = time.weekdays.includes(weekday);
                  return (
                    <Pressable
                      accessibilityLabel={`${label}, ${selected ? 'selected' : 'not selected'}`}
                      key={weekday}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => toggleWeekday(time.id, weekday)}
                      style={styles.dayOuter}
                    >
                      <View style={[styles.day, selected && styles.dayThick]}>
                        <View
                          style={[
                            styles.dayFill,
                            selected && styles.dayFillSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              selected && styles.dayTextSelected,
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Button
            title="Add time"
            disabled={!category.allowMultiplePerDay}
            onPress={() =>
              setDraft((current) => ({
                ...current,
                times: [
                  ...current.times,
                  {
                    id: `${category.id}-time-${Date.now()}`,
                    hour: 12,
                    minute: 0,
                    weekdays: current.times[0]?.weekdays.length
                      ? [...current.times[0].weekdays]
                      : [1, 2, 3, 4, 5, 6, 7],
                  },
                ],
              }))
            }
          />
          {!category.allowMultiplePerDay ? (
            <Text style={styles.hint}>
              Enable multiple per day to add more than one reminder.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button title="Cancel" onPress={onClose} />
            <Button
              title={saving ? 'Saving...' : 'Save'}
              disabled={saving}
              onPress={save}
            />
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetScroll: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    alignSelf: 'center',
    borderRadius: 8,
  },
  sheet: {
    gap: 12,
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
    padding: 6,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  categoryName: { color: colors.muted, fontSize: 15 },
  label: { color: colors.text, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  days: { flexDirection: 'row', flexWrap: 'nowrap', gap: 3 },
  daysLabel: { color: colors.muted, fontSize: 11, marginTop: 4 },
  timeGroup: { gap: 6 },
  // Fixed square footprint regardless of selection so the row never reflows; only the inner
  // border thickness/gap and fill/text colors change between selected and unselected.
  dayOuter: {
    width: 36,
    height: 36,
  },
  day: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  dayThick: { borderWidth: 3, borderColor: colors.primary, padding: 1 },
  dayFill: {
    flex: 1,
    width: '100%',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dayFillSelected: { backgroundColor: colors.primary },
  dayText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  dayTextSelected: { color: '#ffffff' },
  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  timeInput: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 8,
    width: 100,
  },
  timeInputFlex: { flexGrow: 0 },
  hint: { color: colors.muted, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
});
