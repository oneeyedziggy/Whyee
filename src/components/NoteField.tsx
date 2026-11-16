import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { scoreSentiment } from '../lib/sentiment';
import { colors } from '../theme/tokens';
import { styles } from './categoryInputStyles';

const SENTIMENT_DEBOUNCE_MS = 900;

export const NoteField = ({
  value,
  score,
  sentimentEnabled,
  placeholder,
  onChangeText,
  onScore,
}: {
  value: string;
  score?: number;
  sentimentEnabled: boolean;
  placeholder: string;
  onChangeText: (text: string) => void;
  onScore: (score: number, text: string) => void;
}) => {
  const [scoring, setScoring] = useState(false);
  const [text, setText] = useState(value);
  // The record round-trips a render behind, so the input owns its own text.
  const emitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const handleChange = (next: string) => {
    emitted.current = next;
    setText(next);
    onChangeText(next);
    if (!sentimentEnabled) return;
    if (timer.current) clearTimeout(timer.current);
    setScoring(true);
    timer.current = setTimeout(() => {
      setScoring(false);
      onScore(next.trim() ? scoreSentiment(next) : 0, next);
    }, SENTIMENT_DEBOUNCE_MS);
  };
  return (
    <View style={styles.noteField}>
      <TextInput
        multiline
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={styles.notesInput}
      />
      {sentimentEnabled ? (
        <View style={styles.sentimentRow}>
          <Text style={styles.sentimentLabel}>Sentiment</Text>
          {scoring ? (
            <ActivityIndicator
              accessibilityLabel="Calculating sentiment"
              color={colors.primary}
              size="small"
            />
          ) : (
            <Text style={styles.sentimentScore}>
              {value.trim() ? (score ?? 0).toFixed(2) : '—'}
            </Text>
          )}
          <Text style={styles.sentimentLegend}>
            −5 negative · 0 neutral · +5 positive
          </Text>
        </View>
      ) : null}
    </View>
  );
};
