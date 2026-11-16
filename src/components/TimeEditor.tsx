import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { calendarDayDiff, formatHumanDate, parseTimeOfDay } from '../lib/dates';
import { formatClockTime } from '../lib/durationFormat';
import { resolveRolloverDate } from '../lib/durationTimers';
import { colors } from '../theme/tokens';
import { styles } from './categoryInputStyles';
import { SystemTimeField } from './SystemTimeField';

// The page swipe gesture otherwise captures mouse drags meant to select text.
const keepPointerInInput =
  Platform.OS === 'web'
    ? {
        onPointerDown: (event: { stopPropagation: () => void }) =>
          event.stopPropagation(),
      }
    : {};

export const TimeEditor = ({
  label,
  timestamp,
  showMilliseconds,
  is24Hour = true,
  minTimestamp,
  maxTimestamp,
  rejectMessage,
  onChange,
  onDateChange,
  onReject,
  disabled = false,
  showDateButton = false,
  hideDayOffset = false,
  compact = false,
  allowRollover = true,
  trailing = null,
}: {
  label: string;
  timestamp?: string;
  showMilliseconds: boolean;
  is24Hour?: boolean;
  minTimestamp?: string;
  maxTimestamp?: string;
  rejectMessage: string;
  onChange: (value: Date) => void;
  onDateChange?: (value: Date) => void;
  onReject: (message: string) => void;
  disabled?: boolean;
  showDateButton?: boolean;
  hideDayOffset?: boolean;
  compact?: boolean;
  allowRollover?: boolean;
  trailing?: ReactNode;
}) => {
  const canonicalText = (source?: string) => {
    const date = source ? new Date(source) : new Date();
    return formatClockTime(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
      showMilliseconds,
      is24Hour,
    );
  };
  const [text, setText] = useState(() => canonicalText(timestamp));
  const [invalid, setInvalid] = useState(false);
  // Refs so a blur fired right after typing reads the latest text, not a stale closure.
  const latestText = useRef(text);
  const dirty = useRef(false);

  useEffect(() => {
    if (invalid || dirty.current) return;
    setText(canonicalText(timestamp));
  }, [showMilliseconds, is24Hour, timestamp]);

  const withinBounds = (candidate: Date): boolean => {
    const time = candidate.getTime();
    if (minTimestamp && time < Date.parse(minTimestamp)) return false;
    if (maxTimestamp && time > Date.parse(maxTimestamp)) return false;
    return true;
  };
  const commit = (
    nextHours: number,
    nextMinutes: number,
    nextSeconds: number,
    nextMilliseconds: number,
  ): boolean => {
    const base = timestamp ? new Date(timestamp) : new Date();
    const timeOfDay = {
      hours: nextHours,
      minutes: nextMinutes,
      seconds: nextSeconds,
      milliseconds: nextMilliseconds,
    };
    let date: Date | null;
    if (allowRollover) {
      date = resolveRolloverDate(base, timeOfDay, {
        minTimestamp: minTimestamp ? Date.parse(minTimestamp) : undefined,
        maxTimestamp: maxTimestamp ? Date.parse(maxTimestamp) : undefined,
      });
    } else {
      const sameDay = new Date(base);
      sameDay.setHours(nextHours, nextMinutes, nextSeconds, nextMilliseconds);
      date = withinBounds(sameDay) ? sameDay : null;
    }
    if (!date) {
      onReject(rejectMessage);
      return false;
    }
    onReject('');
    const formatted = formatClockTime(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
      showMilliseconds,
      is24Hour,
    );
    latestText.current = formatted;
    setText(formatted);
    onChange(date);
    return true;
  };
  const pickerValue = timestamp ? new Date(timestamp) : new Date();
  const editText = (value: string) => {
    latestText.current = value;
    dirty.current = true;
    setText(value);
    setInvalid(false);
  };
  // Typing a bare hour in 12-hour mode keeps whichever half of the day the value is already in.
  const submitText = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const parsed = parseTimeOfDay(latestText.current, {
      is24Hour,
      fallbackMeridiem: pickerValue.getHours() < 12 ? 'AM' : 'PM',
    });
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(
      !commit(
        parsed.hours,
        parsed.minutes,
        parsed.seconds,
        parsed.milliseconds,
      ),
    );
  };
  const dayOffset =
    showDateButton && !hideDayOffset && minTimestamp && timestamp
      ? calendarDayDiff(new Date(minTimestamp), pickerValue)
      : 0;
  return (
    <View style={styles.timeEditor}>
      <Text style={[styles.help, compact && styles.helpCompact]}>{label}</Text>
      <View style={styles.timeInputRow}>
        <TextInput
          editable={!disabled}
          value={text}
          onChangeText={editText}
          onBlur={submitText}
          onSubmitEditing={submitText}
          selectTextOnFocus={false}
          {...keepPointerInInput}
          placeholder={
            showMilliseconds
              ? 'HH:MM:SS.mmm'
              : is24Hour
                ? 'HH:MM:SS'
                : 'HH:MM:SS AM/PM'
          }
          placeholderTextColor={colors.placeholder}
          style={[
            styles.timeInput,
            styles.timeInputFlex,
            compact && styles.timeInputCompact,
            invalid && styles.timeInputInvalid,
          ]}
        />
        <SystemTimeField
          accessibilityLabel={`Open system time picker for ${label}`}
          disabled={disabled}
          is24Hour={is24Hour}
          mode="time"
          onChange={(value) => {
            dirty.current = false;
            setInvalid(
              !commit(
                value.getHours(),
                value.getMinutes(),
                value.getSeconds(),
                value.getMilliseconds(),
              ),
            );
          }}
          value={pickerValue}
        />
        {showDateButton ? (
          <SystemTimeField
            accessibilityLabel={`Edit date for ${label}`}
            compact
            disabled={disabled}
            mode="date"
            onChange={(dateOnly) => {
              const merged = new Date(pickerValue);
              merged.setFullYear(
                dateOnly.getFullYear(),
                dateOnly.getMonth(),
                dateOnly.getDate(),
              );
              if (!withinBounds(merged)) {
                onReject(rejectMessage);
                return;
              }
              onReject('');
              (onDateChange ?? onChange)(merged);
            }}
            value={pickerValue}
          />
        ) : null}
        {trailing}
      </View>
      {dayOffset > 0 ? (
        <Text style={styles.dayOffset}>
          +{dayOffset} day{dayOffset === 1 ? '' : 's'} (
          {formatHumanDate(pickerValue)})
        </Text>
      ) : null}
    </View>
  );
};
