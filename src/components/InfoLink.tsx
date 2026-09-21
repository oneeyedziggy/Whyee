import { useState } from 'react';
import { DocumentationModal } from './DocumentationModal';
import type { DocumentationSectionId } from '../lib/documentation';
import { colors } from '../theme/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';

interface InfoLinkProps {
  section: DocumentationSectionId;
  label?: string;
  compact?: boolean;
}

export const InfoLink = ({
  section,
  label = 'More information',
  compact = false,
}: InfoLinkProps) => {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={[styles.button, compact && styles.buttonCompact]}
      >
        <Text style={styles.icon}>i</Text>
      </Pressable>
      <DocumentationModal
        visible={visible}
        initialSection={section}
        onClose={() => setVisible(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  buttonCompact: { height: 36, width: 36 },
  icon: {
    borderColor: colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    height: 20,
    lineHeight: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    width: 20,
  },
});
