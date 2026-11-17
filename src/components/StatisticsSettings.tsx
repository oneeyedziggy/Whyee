import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AppButton } from './AppButton';
import { InfoLink } from './InfoLink';
import { SystemScreen } from './SystemScreen';
import { ToggleSwitch } from './ToggleSwitch';
import {
  isStatisticEnabled,
  statisticsRegistry,
  type StatisticsSectionId,
  type StatisticsSettings as StatisticsSettingsState,
} from '../lib/statistics';
import { colors, typeScale } from '../theme/tokens';

interface StatisticsSettingsProps {
  visible: boolean;
  settings: StatisticsSettingsState;
  onChange: (settings: StatisticsSettingsState) => void;
  onOpenCategorySettings: () => void;
  onClose: () => void;
}

const sectionTitles: Record<StatisticsSectionId, string> = {
  chart: 'Chart',
  summary: 'Category statistics',
  correlation: 'Correlation matrix',
  'virtual-series': 'Virtual-series detail',
  calendar: 'Calendar statistics',
};

export const StatisticsSettings = ({
  visible,
  settings,
  onChange,
  onOpenCategorySettings,
  onClose,
}: StatisticsSettingsProps) => {
  const [query, setQuery] = useState('');
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const dialogWidth = Math.min(760, Math.round(width * 0.72));
  const [expanded, setExpanded] = useState<Set<StatisticsSectionId>>(
    () => new Set(['chart', 'summary', 'correlation']),
  );
  const sections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (Object.keys(sectionTitles) as StatisticsSectionId[])
      .map((section) => ({
        section,
        items: statisticsRegistry.filter((item) => item.section === section),
      }))
      .filter(({ section, items }) => {
        if (!normalizedQuery) return true;
        return [
          sectionTitles[section],
          ...items.flatMap((item) => [item.label, item.description]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [query]);

  const toggle = (id: (typeof statisticsRegistry)[number]['id']) =>
    onChange({ ...settings, [id]: !isStatisticEnabled(settings, id) });

  return (
    <Modal
      visible={visible}
      animationType={desktop ? 'fade' : 'slide'}
      transparent={desktop}
      statusBarTranslucent={!desktop && Platform.OS === 'android'}
      onRequestClose={onClose}
      presentationStyle={desktop ? 'overFullScreen' : 'fullScreen'}
    >
      <SystemScreen
        enabled={!desktop}
        style={desktop ? styles.backdrop : styles.fill}
      >
        {desktop ? (
          <Pressable
            accessibilityLabel="Close statistics settings"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          style={[
            styles.root,
            desktop && styles.desktopDialog,
            desktop && {
              width: dialogWidth,
              height: Math.round(height * 0.86),
            },
          ]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Statistics settings</Text>
              <Text style={styles.subtitle}>
                Disabled sections do not calculate.
              </Text>
            </View>
            <AppButton title="Done" onPress={onClose} />
          </View>
          <TextInput
            accessibilityLabel="Search statistics settings"
            value={query}
            onChangeText={setQuery}
            placeholder="Search statistics"
            placeholderTextColor={colors.placeholder}
            style={styles.search}
          />
          <KeyboardAwareScrollView
            style={styles.scroller}
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <Pressable
              onPress={onOpenCategorySettings}
              style={styles.categoryLink}
            >
              <Text style={styles.categoryLinkText}>
                Category settings control category and virtual-series inclusion.
              </Text>
              <Text style={styles.categoryLinkAction}>
                Open category settings
              </Text>
            </Pressable>
            {sections.map(({ section, items }) => {
              const isExpanded = expanded.has(section);
              return (
                <View key={section} style={styles.section}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${sectionTitles[section]} statistics settings`}
                    onPress={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(section)) next.delete(section);
                        else next.add(section);
                        return next;
                      })
                    }
                    style={styles.sectionHeader}
                  >
                    <Text style={styles.sectionTitle}>
                      {isExpanded ? '−' : '+'} {sectionTitles[section]}
                    </Text>
                    <InfoLink
                      section={items[0].documentationSection}
                      label={`More information about ${sectionTitles[section]}`}
                    />
                  </Pressable>
                  {isExpanded
                    ? items.map((item) => (
                        <View key={item.id} style={styles.item}>
                          <View style={styles.itemCopy}>
                            <Text style={styles.itemLabel}>{item.label}</Text>
                            <Text style={styles.itemDescription}>
                              {item.description}
                            </Text>
                          </View>
                          <ToggleSwitch
                            accessibilityLabel={`Enable ${item.label}`}
                            value={isStatisticEnabled(settings, item.id)}
                            onValueChange={() => toggle(item.id)}
                          />
                        </View>
                      ))
                    : null}
                </View>
              );
            })}
            {!sections.length ? (
              <Text style={styles.empty}>
                No statistics settings match that search.
              </Text>
            ) : null}
          </KeyboardAwareScrollView>
        </View>
      </SystemScreen>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  fill: { flex: 1 },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    flex: 1,
    justifyContent: 'center',
  },
  desktopDialog: {
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
    paddingTop: 24,
  },
  header: {
    alignItems: 'center',
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: typeScale.screenTitle,
    fontWeight: '700',
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  search: {
    flexShrink: 0,
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
  scroller: { flex: 1, minHeight: 0 },
  content: { gap: 12, padding: 18, paddingTop: 4, paddingBottom: 36 },
  categoryLink: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  categoryLinkText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  categoryLinkAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  sectionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  item: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  itemCopy: { flex: 1 },
  itemLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  itemDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    padding: 18,
    textAlign: 'center',
  },
});
