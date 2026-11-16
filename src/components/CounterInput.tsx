import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { confirmAction } from '../lib/confirm';
import { buildEntry } from '../lib/entries';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';
import { styles } from './categoryInputStyles';

export const CounterInput = ({
  category,
  entry,
  entries,
  index,
  dateKey,
  isLast,
  onChange,
  onAddEntry,
}: {
  category: Extract<CategoryDefinition, { kind: 'counter' }>;
  entry: CategorySelectionRecord | null;
  entries: CategorySelectionRecord[];
  index: number;
  dateKey: string;
  isLast: boolean;
  onChange: (entry: CategorySelectionRecord) => void;
  onAddEntry: (initial?: Partial<CategorySelectionRecord>) => void;
}) => {
  const value = entry?.value ?? 0;
  const [draft, setDraft] = useState<string | null>(null);
  const update = (next: number) => {
    setDraft(null);
    onChange(buildEntry(category, entry, index, dateKey, { value: next }));
  };
  const reset = () =>
    confirmAction(
      'Reset counter?',
      'Set this counter back to zero?',
      'Reset',
      () => update(0),
    );
  const cumulative = entries.reduce(
    (sum, candidate) => sum + candidate.value,
    0,
  );
  const showCumulative = isLast && entries.length > 1;
  return (
    <View>
      <View style={styles.primaryValueRow}>
        {category.counter.editable ? (
          <TextInput
            accessibilityLabel={`${category.name} value`}
            value={draft ?? `${showCumulative ? cumulative : value}`}
            keyboardType="numbers-and-punctuation"
            onChangeText={(text) => {
              setDraft(text);
              const parsed = Number(text);
              if (text.trim() && Number.isFinite(parsed)) update(parsed);
            }}
            onBlur={() => setDraft(null)}
            style={styles.counterValueInput}
          />
        ) : (
          <Text style={styles.counterValue}>
            {showCumulative ? cumulative : value}
          </Text>
        )}
        {showCumulative ? (
          <Text style={styles.secondaryValue}>({value})</Text>
        ) : null}
      </View>
      <View style={styles.counterButtons}>
        {category.counter.steps.map((step) => (
          <Pressable
            key={step}
            onPress={() => update(value + step)}
            style={styles.actionButton}
          >
            <Text style={styles.actionText}>
              {step > 0 ? `+${step}` : step}
            </Text>
          </Pressable>
        ))}
        {category.counter.resetEnabled && isLast ? (
          <Pressable onPress={reset} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : null}
        {category.counter.splitEnabled && isLast ? (
          <Pressable onPress={() => onAddEntry()} style={styles.actionButton}>
            <Text style={styles.actionText}>Split</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};
