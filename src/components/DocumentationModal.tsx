import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  documentationSections,
  type DocumentationSectionId,
} from '../lib/documentation';
import { colors } from '../theme/tokens';
import { SystemScreen } from './SystemScreen';

interface DocumentationModalProps {
  visible: boolean;
  initialSection?: DocumentationSectionId;
  onClose: () => void;
}

export const DocumentationModal = ({
  visible,
  initialSection,
  onClose,
}: DocumentationModalProps) => {
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<
    Partial<Record<DocumentationSectionId, number>>
  >({});
  const [query, setQuery] = useState('');
  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return documentationSections;
    return documentationSections.filter((section) =>
      [
        section.title,
        section.summary,
        section.body,
        ...section.keywords,
        ...(section.details?.flatMap((detail) => [
          detail.term,
          detail.description,
        ]) ?? []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  useEffect(() => {
    if (!visible || !initialSection) return undefined;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: sectionOffsets.current[initialSection] ?? 0,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [filteredSections.length, initialSection, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SystemScreen accessibilityViewIsModal style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Documentation</Text>
            <Text style={styles.subtitle}>
              Concepts, controls, and statistics
            </Text>
          </View>
          <Button title="Done" onPress={onClose} />
        </View>
        <TextInput
          accessibilityLabel="Search documentation"
          value={query}
          onChangeText={setQuery}
          placeholder="Search concepts"
          placeholderTextColor={colors.placeholder}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {filteredSections.length ? (
            filteredSections.map((section) => (
              <View
                key={section.id}
                nativeID={section.id}
                onLayout={(event) => {
                  sectionOffsets.current[section.id] =
                    event.nativeEvent.layout.y;
                }}
                style={[
                  styles.section,
                  section.id === initialSection && styles.initialSection,
                ]}
              >
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionSummary}>{section.summary}</Text>
                <Text style={styles.body}>{section.body}</Text>
                {section.details?.length ? (
                  <View style={styles.detailList}>
                    {section.details.map((detail) => (
                      <View key={detail.term} style={styles.detailRow}>
                        <Text style={styles.detailTerm}>{detail.term}</Text>
                        <Text style={styles.detailDescription}>
                          {detail.description}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.empty}>
              No documentation matches that search.
            </Text>
          )}
          <View style={{ height }} />
        </ScrollView>
      </SystemScreen>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  title: { color: colors.text, fontSize: 23, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    color: colors.text,
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  content: { gap: 12, padding: 18, paddingTop: 4, paddingBottom: 36 },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  initialSection: { borderColor: colors.primary, borderWidth: 2 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sectionSummary: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  body: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 10 },
  detailList: {
    borderLeftColor: colors.border,
    borderLeftWidth: 2,
    gap: 8,
    marginTop: 12,
    paddingLeft: 12,
  },
  detailRow: { gap: 2 },
  detailTerm: { color: colors.text, fontSize: 13, fontWeight: '700' },
  detailDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    padding: 18,
    textAlign: 'center',
  },
});
