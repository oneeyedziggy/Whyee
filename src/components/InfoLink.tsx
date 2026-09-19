import { useState } from 'react';
import { DocumentationModal } from './DocumentationModal';
import type { DocumentationSectionId } from '../lib/documentation';
import { colors } from '../theme/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';

interface InfoLinkProps {
  section: DocumentationSectionId;
  label?: string;
}

export const InfoLink = ({
  section,
  label = 'More information',
}: InfoLinkProps) => {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={styles.button}
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
    borderColor: colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  icon: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
});
