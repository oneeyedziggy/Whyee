import { Pressable, Switch, Text, View } from 'react-native';
import * as React from 'react';
import type { CategoryDefinition } from '../types/category';
import { colors } from '../theme/tokens';
import { styles } from './CategoryEditor';

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
  return `${category.counter.steps.length} counter steps`;
};

export const NotesEditor = () => (
  <Text style={styles.caption}>
    This category stores notes and can optionally derive local sentiment.
  </Text>
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
          <Pressable
            accessibilityLabel={`What does ${label} mean?`}
            accessibilityRole="button"
            onPress={() => setShowDescription((current) => !current)}
            style={styles.hintButton}
          >
            <Text style={styles.hintIcon}>?</Text>
          </Pressable>
        ) : null}
        <View style={styles.leader}>
          <View style={styles.leaderLine} />
        </View>
        <Switch
          accessibilityLabel={label}
          accessibilityState={{ checked: value, disabled }}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primarySoft }}
          thumbColor={value ? colors.primary : '#fff'}
        />
      </View>
      {description && showDescription ? (
        <Text style={styles.hintText}>{description}</Text>
      ) : null}
    </View>
  );
};
