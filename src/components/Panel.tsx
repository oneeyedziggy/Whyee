import { type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { InfoLink } from './InfoLink';
import type { DocumentationSectionId } from '../lib/documentation';

interface PanelProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  infoSection?: DocumentationSectionId;
}

export const Panel = ({
  title,
  subtitle,
  infoSection,
  children,
}: PanelProps) => {
  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {infoSection ? (
          <InfoLink
            section={infoSection}
            label={`More information about ${title}`}
          />
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  content: { marginTop: 16 },
});
