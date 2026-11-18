import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HoverTitle } from './HoverTitle';
import { confirmAction } from '../lib/confirm';
import { getLocalTimeStamp, nowOnDateKey } from '../lib/dates';
import { buildEntry } from '../lib/entries';
import {
  entryDurationMs,
  formatClockTime,
  formatDuration,
} from '../lib/durationFormat';
import {
  applyDurationPrecision,
  editDurationStartTime,
  editDurationStopTime,
  getDurationEditBounds,
  getDurationIntervals,
  resumeDurationRecord,
  stopDurationRecord,
} from '../lib/durationTimers';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import { styles } from './categoryInputStyles';
import { TimeEditor } from './TimeEditor';

type DurationCategory = Extract<CategoryDefinition, { kind: 'duration' }>;
type TimeField = 'startTime' | 'stopTime';

// TimeEditor already enforces the min/max bounds; this catches records whose own stamps disagree
// with their runs, which the duration helpers refuse to edit.
const commitTimeEdit = (
  record: CategorySelectionRecord,
  field: TimeField,
  value: Date,
  showMilliseconds: boolean,
  manualDate: boolean,
  rejectMessage: string,
  onChange: (entry: CategorySelectionRecord) => void,
  onReject: (message: string) => void,
) => {
  const edited =
    field === 'stopTime'
      ? editDurationStopTime(record, value, showMilliseconds)
      : editDurationStartTime(record, value, showMilliseconds);
  if (!edited) {
    onReject(rejectMessage);
    return;
  }
  onReject('');
  onChange(manualDate ? { ...edited, stopDateManual: true } : edited);
};

const DeleteLapButton = ({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => void;
}) => (
  <HoverTitle text={`Delete ${label}`}>
    <Pressable
      accessibilityHint="Removes this lap and its recorded time from today's entry"
      accessibilityLabel={`Delete ${label}`}
      accessibilityRole="button"
      onPress={() =>
        confirmAction(
          'Delete lap?',
          `This removes ${label} and its recorded time from today's entry.`,
          'Delete',
          onDelete,
        )
      }
      style={styles.lapRemove}
    >
      <Text style={styles.lapRemoveIcon}>{'\u2715'}</Text>
    </Pressable>
  </HoverTitle>
);

const LapRow = ({
  label,
  durationMs,
  cumulativeMs,
  showCumulative,
  showMilliseconds,
  onDelete,
}: {
  label: string;
  durationMs: number;
  cumulativeMs: number;
  showCumulative: boolean;
  showMilliseconds: boolean;
  onDelete?: () => void;
}) => (
  <View style={styles.lapRow}>
    <Text style={styles.lapLabel}>{label}</Text>
    <Text style={styles.lapValue}>
      {formatDuration(
        applyDurationPrecision(durationMs, showMilliseconds),
        showMilliseconds,
      )}
    </Text>
    <Text style={styles.lapCumulative}>
      {showCumulative
        ? `(${formatDuration(
            applyDurationPrecision(cumulativeMs, showMilliseconds),
            showMilliseconds,
          )})`
        : ''}
    </Text>
    {onDelete ? <DeleteLapButton label={label} onDelete={onDelete} /> : null}
  </View>
);

const LapTimeFields = ({
  label,
  lap,
  showMilliseconds,
  is24Hour,
  disabled,
  onChange,
  onReject,
  onDelete,
}: {
  label: string;
  lap: CategorySelectionRecord;
  showMilliseconds: boolean;
  is24Hour: boolean;
  disabled: boolean;
  onChange: (entry: CategorySelectionRecord) => void;
  onReject: (message: string) => void;
  onDelete?: () => void;
}) => {
  const bounds = getDurationEditBounds(lap);
  const rejectMessage = (field: TimeField) =>
    field === 'startTime'
      ? `${label} start cannot be later than its stop time.`
      : `${label} stop cannot be earlier than its start time.`;
  const edit = (field: TimeField, value: Date, manualDate = false) =>
    commitTimeEdit(
      lap,
      field,
      value,
      showMilliseconds,
      manualDate,
      rejectMessage(field),
      onChange,
      onReject,
    );
  return (
    <View style={styles.lapTimeFields}>
      <TimeEditor
        label={`${label} start`}
        timestamp={bounds.startTime}
        showMilliseconds={showMilliseconds}
        is24Hour={is24Hour}
        maxTimestamp={bounds.startMax}
        onChange={(value) => edit('startTime', value)}
        onReject={onReject}
        rejectMessage={rejectMessage('startTime')}
        disabled={disabled}
        showDateButton
        hideDayOffset
        compact
      />
      <TimeEditor
        label={`${label} end`}
        timestamp={lap.stopTime}
        showMilliseconds={showMilliseconds}
        is24Hour={is24Hour}
        minTimestamp={bounds.stopMin}
        onChange={(value) => edit('stopTime', value)}
        onDateChange={(value) => edit('stopTime', value, true)}
        allowRollover={!lap.stopDateManual}
        onReject={onReject}
        rejectMessage={rejectMessage('stopTime')}
        disabled={disabled}
        showDateButton
        hideDayOffset
        compact
        trailing={
          onDelete ? (
            <DeleteLapButton label={label} onDelete={onDelete} />
          ) : null
        }
      />
    </View>
  );
};

export const DurationInput = ({
  category,
  entry,
  index,
  dateKey,
  isLast,
  laps = [],
  onChange,
  onDeleteLap,
  onAddEntry,
  blocked,
  carryoverMode = false,
}: {
  category: DurationCategory;
  entry: CategorySelectionRecord | null;
  index: number;
  dateKey: string;
  isLast: boolean;
  laps?: CategorySelectionRecord[];
  onDeleteLap?: (entry: CategorySelectionRecord) => void;
  onChange: (entry: CategorySelectionRecord) => void;
  // Only Split adds entries, and carryover mode hides it.
  onAddEntry?: (initial?: Partial<CategorySelectionRecord>) => void;
  blocked: boolean;
  carryoverMode?: boolean;
}) => {
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const { showMilliseconds } = category.duration;
  const is24Hour = category.duration.use24HourClock !== false;
  const running = Boolean(entry?.startTime && !entry.stopTime);
  const patchEntry = (patch: Partial<CategorySelectionRecord>) =>
    onChange(buildEntry(category, entry, index, dateKey, patch));
  useEffect(() => {
    if (!running || !category.duration.animate) return undefined;
    const timer = setInterval(
      () => setNow(Date.now()),
      showMilliseconds ? 37 : 1000,
    );
    return () => clearInterval(timer);
  }, [category.duration.animate, showMilliseconds, running]);
  // Restarting keeps whatever has already been banked; only Reset clears it. Only the very first
  // start (nothing banked or run yet) is pinned to the viewed date — later restarts resume from
  // the real current moment, otherwise each stop/start cycle would add another day's worth of delta.
  const start = () => {
    const isFreshStart =
      !entry?.startTime && !entry?.stopTime && !entry?.durationRuns?.length;
    const startedAt = isFreshStart ? nowOnDateKey(dateKey) : new Date();
    setNow(Date.now());
    setNotice('');
    patchEntry({
      // Banked runs pin the entry's time to the first run; otherwise it follows this start.
      ...(entry?.durationRuns?.length
        ? {}
        : { localTime: getLocalTimeStamp(startedAt) }),
      startTime: startedAt.toISOString(),
      stopTime: undefined,
    });
  };
  // Stop and Split are only enabled while running, so a started entry always exists.
  const stop = () => {
    const next = stopDurationRecord(entry!, new Date(), showMilliseconds);
    if (next) onChange(next);
  };
  // The resume buttons only render for a stopped entry.
  const resume = (withGap: boolean) => {
    const next = resumeDurationRecord(
      entry!,
      withGap ? new Date() : new Date(entry!.stopTime!),
      showMilliseconds,
    );
    if (!next) {
      setNotice('Cannot resume: check the start and stop times.');
      return;
    }
    setNow(Date.now());
    setNotice('');
    onChange(next);
  };
  const reset = () => {
    if (!entry) return;
    setNotice('');
    patchEntry({
      startTime: undefined,
      stopTime: undefined,
      durationMs: 0,
      durationMsExact: 0,
      durationRuns: [],
      stopDateManual: undefined,
      value: 0,
    });
  };
  const split = () => {
    stop();
    const splitStart = nowOnDateKey(dateKey);
    onAddEntry?.({
      startTime: splitStart.toISOString(),
      localTime: getLocalTimeStamp(splitStart),
    });
  };
  const bankedMs = (entry?.durationRuns ?? []).reduce(
    (sum, run) => sum + run.durationMs,
    0,
  );
  const lapMs = running ? now - Date.parse(entry!.startTime!) : 0;
  const totalMs = bankedMs + lapMs;
  const bounds = entry ? getDurationEditBounds(entry) : {};
  const lapTotals = laps.map((lap, lapIndex) =>
    laps
      .slice(0, lapIndex + 1)
      .reduce((sum, candidate) => sum + entryDurationMs(candidate), 0),
  );
  const precedingMs = lapTotals.length ? lapTotals[lapTotals.length - 1] : 0;
  const rejectMessages = {
    startTime: 'Start time cannot be later than the stop time.',
    stopTime: 'Stop time cannot be earlier than the start time.',
  };
  // The time fields only render for a started entry.
  const editTimestamp = (field: TimeField, value: Date, manualDate = false) =>
    commitTimeEdit(
      entry!,
      field,
      value,
      showMilliseconds,
      manualDate,
      rejectMessages[field],
      onChange,
      setNotice,
    );
  const readout = (milliseconds: number) =>
    formatDuration(
      applyDurationPrecision(milliseconds, showMilliseconds),
      showMilliseconds,
    );
  const clock = (iso: string) => {
    const date = new Date(iso);
    return formatClockTime(
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
      showMilliseconds,
      is24Hour,
    );
  };
  const runs =
    entry && !category.duration.splitEnabled
      ? getDurationIntervals(entry, now)
      : [];
  const stopped = Boolean(entry?.stopTime);
  const orderedLaps = laps
    .map((lap, lapIndex) => ({ lap, lapIndex }))
    .reverse();
  return (
    <View>
      <View style={styles.primaryValueRow}>
        <Text style={styles.durationValue}>{readout(totalMs)}</Text>
        {precedingMs > 0 ? (
          <Text style={styles.secondaryValue}>
            ({readout(precedingMs + totalMs)})
          </Text>
        ) : null}
      </View>
      {orderedLaps.map(({ lap, lapIndex }) => (
        <LapRow
          key={lap.key}
          label={`Lap ${lapIndex + 1}`}
          durationMs={entryDurationMs(lap)}
          cumulativeMs={lapTotals[lapIndex]}
          showCumulative={lapIndex > 0}
          showMilliseconds={showMilliseconds}
          onDelete={onDeleteLap ? () => onDeleteLap(lap) : undefined}
        />
      ))}
      {runs.length > 1
        ? runs
            .map((run, runIndex) => (
              <View key={run.startTime}>
                <View style={styles.lapRow}>
                  <Text style={styles.lapLabel}>
                    Run {runIndex + 1} {clock(run.startTime)}–
                    {running && runIndex === runs.length - 1
                      ? 'now'
                      : clock(run.stopTime)}
                  </Text>
                  <Text style={styles.lapValue}>{readout(run.durationMs)}</Text>
                </View>
                {runIndex > 0 &&
                Date.parse(run.startTime) >
                  Date.parse(runs[runIndex - 1].stopTime) ? (
                  <View style={styles.lapRow}>
                    <Text style={[styles.lapLabel, styles.gapLabel]}>Gap</Text>
                    <Text style={[styles.lapValue, styles.gapValue]}>
                      {readout(
                        Math.max(
                          0,
                          Date.parse(run.startTime) -
                            Date.parse(runs[runIndex - 1].stopTime),
                        ),
                      )}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))
            .reverse()
        : null}
      <View
        style={[
          styles.durationButtons,
          carryoverMode && styles.durationButtonsCarryover,
        ]}
      >
        {!carryoverMode && stopped ? (
          <>
            <TimerButton
              label="Resume w/ gap"
              disabled={blocked}
              onPress={() => resume(true)}
            />
            <TimerButton
              label="Resume w/o gap"
              disabled={blocked}
              onPress={() => resume(false)}
            />
          </>
        ) : !carryoverMode ? (
          <TimerButton
            label="Start"
            disabled={running || blocked}
            onPress={start}
          />
        ) : null}
        <TimerButton
          label="Stop"
          disabled={!running || blocked}
          onPress={stop}
          style={carryoverMode ? styles.actionButtonCarryover : undefined}
        />
        {!carryoverMode && category.duration.splitEnabled && isLast ? (
          <TimerButton
            label="Split"
            disabled={!running || blocked}
            onPress={split}
          />
        ) : null}
        {!carryoverMode && category.duration.resetEnabled && isLast ? (
          <Pressable
            disabled={blocked}
            onPress={reset}
            style={[styles.resetButton, blocked && styles.disabledButton]}
          >
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {entry?.startTime ? (
        <View style={styles.timeFields}>
          <TimeEditor
            label="Start time"
            timestamp={bounds.startTime}
            showMilliseconds={showMilliseconds}
            is24Hour={is24Hour}
            maxTimestamp={bounds.startMax}
            onChange={(value) => editTimestamp('startTime', value)}
            onReject={setNotice}
            rejectMessage={rejectMessages.startTime}
            disabled={blocked}
            showDateButton
            hideDayOffset
          />
          <TimeEditor
            label="Stop time"
            timestamp={entry.stopTime}
            showMilliseconds={showMilliseconds}
            is24Hour={is24Hour}
            minTimestamp={bounds.stopMin}
            onChange={(value) => editTimestamp('stopTime', value)}
            onDateChange={(value) => editTimestamp('stopTime', value, true)}
            allowRollover={!entry.stopDateManual}
            onReject={setNotice}
            rejectMessage={rejectMessages.stopTime}
            disabled={blocked || running}
            showDateButton
            hideDayOffset={carryoverMode}
          />
        </View>
      ) : null}
      {orderedLaps.map(({ lap, lapIndex }) => (
        <LapTimeFields
          key={lap.key}
          label={`Lap ${lapIndex + 1}`}
          lap={lap}
          showMilliseconds={showMilliseconds}
          is24Hour={is24Hour}
          disabled={blocked}
          onChange={onChange}
          onReject={setNotice}
          onDelete={onDeleteLap ? () => onDeleteLap(lap) : undefined}
        />
      ))}
    </View>
  );
};

const TimerButton = ({
  label,
  disabled,
  onPress,
  style,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  style?: object;
}) => (
  <Pressable
    disabled={disabled}
    onPress={onPress}
    style={[styles.actionButton, style, disabled && styles.disabledButton]}
  >
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>
);
