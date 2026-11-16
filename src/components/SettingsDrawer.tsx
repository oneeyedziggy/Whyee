import { Download, Upload, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, typeScale } from '../theme/tokens';
import { SystemScreen } from './SystemScreen';

interface SettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
}

const ActionRow = ({
  onPress,
  children,
}: {
  onPress: () => void;
  children: ReactNode;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      onPress={onPress}
      style={[styles.action, hovered && styles.actionHovered]}
    >
      {children}
    </Pressable>
  );
};

export const SettingsDrawer = ({
  visible,
  onClose,
  onExport,
  onImport,
}: SettingsDrawerProps) => (
  <Modal
    visible={visible}
    transparent
    statusBarTranslucent={Platform.OS === 'android'}
    animationType="fade"
    onRequestClose={onClose}
  >
    <SystemScreen backgroundColor="transparent" style={styles.root}>
      <Pressable
        accessibilityLabel="Close settings"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.backdrop}
      />
      <View style={styles.drawer}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable
            accessibilityLabel="Close settings"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.iconButton}
          >
            <X color={colors.text} size={21} />
          </Pressable>
        </View>
        <ActionRow onPress={onExport}>
          <Download color={colors.primary} size={21} />
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Export data</Text>
            <Text style={styles.actionDescription}>
              Save selected workspaces and settings.
            </Text>
          </View>
        </ActionRow>
        <ActionRow onPress={onImport}>
          <Upload color={colors.teal} size={21} />
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Import data</Text>
            <Text style={styles.actionDescription}>
              Restore or merge a Whyee export.
            </Text>
          </View>
        </ActionRow>
      </View>
    </SystemScreen>
  </Modal>
);

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: { backgroundColor: 'rgba(23, 32, 51, 0.35)', flex: 1 },
  drawer: {
    backgroundColor: colors.canvas,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 18,
    width: '84%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: typeScale.screenTitle,
    fontWeight: '700',
  },
  iconButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  action: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 16,
  },
  actionHovered: { backgroundColor: colors.primarySoft },
  actionCopy: { flex: 1 },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  actionDescription: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
