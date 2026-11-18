import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as React from 'react';
import { HoverTitle } from './HoverTitle';
import { ToggleSwitch } from './ToggleSwitch';
import type { CategoryDefinition } from '../types/category';
import { colors, shadows } from '../theme/tokens';

export const Segment = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={[styles.segment, selected && styles.segmentSelected]}
  >
    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
      {label}
    </Text>
  </Pressable>
);

export const getCategorySummary = (category: CategoryDefinition): string => {
  if (category.kind === 'multiple-choice')
    return `${category.options.length} choices`;
  if (category.kind === 'number')
    return `${category.range.min} to ${category.range.max}`;
  if (category.kind === 'duration') return 'Start and stop timer';
  if (category.kind === 'notes') return 'Notes only';
  if (category.kind === 'event-time') return 'Time of event';
  return `${category.counter.steps.length} counter steps`;
};

export const NotesEditor = () => (
  <Text style={styles.caption}>
    This category stores notes and can optionally derive local sentiment.
  </Text>
);

const HintToggle = ({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityLabel={`What does ${label} mean?`}
    accessibilityRole="button"
    hitSlop={8}
    onPress={onPress}
    style={styles.hintButton}
  >
    <Text style={styles.hintIcon}>?</Text>
  </Pressable>
);

export const HintLabel = ({
  label,
  description,
}: {
  label: string;
  description: string;
}) => {
  const [showDescription, setShowDescription] = React.useState(false);
  return (
    <View>
      <View style={styles.hintLabelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        <HintToggle
          label={label}
          onPress={() => setShowDescription((current) => !current)}
        />
      </View>
      {showDescription ? (
        <Text style={styles.hintText}>{description}</Text>
      ) : null}
    </View>
  );
};

export const CompactSwitch = ({
  accessibilityLabel,
  value,
  disabled,
  onChange,
}: {
  accessibilityLabel: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) => {
  const subject = accessibilityLabel.replace(/^Enable(?: category)? /, '');
  return (
    <HoverTitle text={`${value ? 'Disable' : 'Enable'} ${subject}`}>
      <ToggleSwitch
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Turn ${value ? 'off' : 'on'} ${subject}.`}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </HoverTitle>
  );
};

export const AddButton = ({
  accessibilityLabel,
  accessibilityHint = 'Adds an item.',
  text,
  disabled = false,
  onPress,
}: {
  accessibilityLabel: string;
  accessibilityHint?: string;
  text?: string;
  disabled?: boolean;
  onPress: () => void;
}) => {
  const button = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.addButton, disabled && styles.addButtonDisabled]}
    >
      <Text style={styles.addIcon} selectable={false}>
        +
      </Text>
    </Pressable>
  );
  const tooltip = disabled ? accessibilityHint : accessibilityLabel;
  return text ? (
    <View style={styles.addActionRow}>
      <Text style={styles.addActionLabel}>{text}</Text>
      <HoverTitle text={tooltip}>{button}</HoverTitle>
    </View>
  ) : (
    <HoverTitle text={tooltip}>{button}</HoverTitle>
  );
};

export const SeriesToggleRow = ({
  label,
  description,
  inverse,
  main,
  nested,
  onInverseChange,
  onMainChange,
}: {
  label: string;
  description: string;
  inverse: boolean;
  main: boolean;
  nested?: boolean;
  onInverseChange: (value: boolean) => void;
  onMainChange: (value: boolean) => void;
}) => {
  const [showDescription, setShowDescription] = React.useState(false);
  return (
    <View style={nested && styles.seriesNested}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel} numberOfLines={2}>
          {label}
        </Text>
        <HintToggle
          label={label}
          onPress={() => setShowDescription((current) => !current)}
        />
        <View style={styles.leader}>
          <View style={styles.leaderLine} />
        </View>
        <View style={styles.seriesColumn}>
          <CompactSwitch
            accessibilityLabel={`Enable inverse correlation of ${label}`}
            value={inverse}
            onChange={onInverseChange}
          />
        </View>
        <View style={styles.seriesColumn}>
          <CompactSwitch
            accessibilityLabel={`Enable correlation of ${label}`}
            value={main}
            onChange={onMainChange}
          />
        </View>
      </View>
      {showDescription ? (
        <Text style={styles.hintText}>{description}</Text>
      ) : null}
    </View>
  );
};

export const SeriesToggleHeader = () => (
  <View style={styles.seriesHeader}>
    <Text style={[styles.seriesColumn, styles.seriesHeading]}>Inverse</Text>
    <Text style={[styles.seriesColumn, styles.seriesHeading]}>Main</Text>
  </View>
);

export const SwitchRow = ({
  label,
  value,
  disabled,
  description,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  description?: string;
  onChange: (value: boolean) => void;
}) => {
  const [showDescription, setShowDescription] = React.useState(false);
  return (
    <View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel} numberOfLines={2}>
          {label}
        </Text>
        {description ? (
          <HintToggle
            label={label}
            onPress={() => setShowDescription((current) => !current)}
          />
        ) : null}
        <View style={styles.leader}>
          <View style={styles.leaderLine} />
        </View>
        <ToggleSwitch
          accessibilityLabel={label}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
        />
      </View>
      {description && showDescription ? (
        <Text style={styles.hintText}>{description}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  caption: { color: colors.muted, fontSize: 12, marginTop: 2 },
  segment: {
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    flexBasis: '45%',
    flexGrow: 1,
    padding: 10,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: { color: colors.text, fontWeight: '700' },
  segmentTextSelected: { color: '#fff' },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  switchLabel: { color: colors.text, flexShrink: 1, fontSize: 13 },
  seriesHeader: { flexDirection: 'row', justifyContent: 'flex-end' },
  seriesColumn: { alignItems: 'center', width: 64 },
  seriesHeading: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  seriesNested: { paddingLeft: 12 },
  leader: { flex: 1, justifyContent: 'center', marginHorizontal: 8 },
  leaderLine: {
    borderBottomColor: '#c9d1dc',
    borderBottomWidth: 1,
    borderRadius: 1,
    borderStyle: 'dotted',
  },
  hintButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    marginLeft: 6,
    width: 18,
  },
  hintIcon: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  hintLabelRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 5 },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  addActionRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  addActionLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    boxShadow: shadows.soft,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  addButtonDisabled: { backgroundColor: '#6b7280' },
  addIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '400',
    includeFontPadding: false,
    textAlignVertical: 'center',
    top: -2.5,
  },
  hintText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
    paddingRight: 8,
  },
});
