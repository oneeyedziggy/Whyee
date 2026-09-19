import {
  Alert,
  Button,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState } from 'react';
import { expandNotificationSchedule } from '../lib/notificationSchedule';
import { notificationService } from '../lib/notificationService';
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
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    times: [{ id: `${category.id}-time-1`, hour: 9, minute: 0 }],
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
  const toggleWeekday = (weekday: number) =>
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((value) => value !== weekday)
        : [...current.weekdays, weekday].sort((left, right) => left - right),
    }));
  const updateTime = (id: string, text: string) => {
    const parsed = parseTime(text);
    if (!parsed) return;
    setDraft((current) => ({
      ...current,
      times: current.times.map((time) =>
        time.id === id ? { ...time, ...parsed } : time,
      ),
    }));
  };
  const save = async () => {
    if (draft.enabled && !category.enabled) {
      Alert.alert(
        'Category is disabled',
        'Enable the category before scheduling reminders.',
      );
      return;
    }
    if (!draft.weekdays.length || !draft.times.length) {
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
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        accessible
        accessibilityLabel={`Set notification for ${category.name}`}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
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
          <Text style={styles.label}>Days</Text>
          <View style={styles.days}>
            {weekdays.map(([label, weekday]) => (
              <Pressable
                accessibilityLabel={`${label}, ${draft.weekdays.includes(weekday) ? 'selected' : 'not selected'}`}
                key={weekday}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: draft.weekdays.includes(weekday),
                }}
                onPress={() => toggleWeekday(weekday)}
                style={[
                  styles.day,
                  draft.weekdays.includes(weekday) && styles.daySelected,
                ]}
              >
                <Text style={styles.dayText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Times</Text>
          {draft.times.map((time) => (
            <View key={time.id} style={styles.timeRow}>
              <TextInput
                accessibilityLabel={`Reminder time ${formatTime(time)}`}
                defaultValue={formatTime(time)}
                onEndEditing={(event) =>
                  updateTime(time.id, event.nativeEvent.text)
                }
                placeholder="09:00"
                placeholderTextColor={colors.placeholder}
                keyboardType="numbers-and-punctuation"
                style={styles.timeInput}
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    gap: 12,
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 8,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  categoryName: { color: colors.muted, fontSize: 15 },
  label: { color: colors.text, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  days: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  day: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
  },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.text, fontSize: 12 },
  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  timeInput: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 8,
    width: 100,
  },
  hint: { color: colors.muted, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
});
