import { Check, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  createTransferArchives,
  createTransferBundle,
} from '../lib/dataTransfer';
import { saveTransferArchives } from '../lib/dataTransferFile';
import { colors, typeScale } from '../theme/tokens';
import { AppButton } from './AppButton';
import { SystemScreen } from './SystemScreen';
import type {
  ExportLayout,
  ExportSelection,
  GlobalTransferSnapshot,
  WorkspaceTransferSnapshot,
} from '../types/dataTransfer';

interface ExportDataModalProps {
  visible: boolean;
  workspaces: WorkspaceTransferSnapshot[];
  globals: GlobalTransferSnapshot;
  onClose: () => void;
}

const createSelection = (
  workspaces: WorkspaceTransferSnapshot[],
): ExportSelection => ({
  workspaces: Object.fromEntries(
    workspaces.map((workspace) => [
      workspace.id,
      { categoriesAndGroups: true, loggedData: true },
    ]),
  ),
  analysisSettings: true,
  appPreferences: true,
});

const Checkbox = ({
  label,
  checked,
  onPress,
  nested = false,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  nested?: boolean;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    onPress={onPress}
    style={[styles.checkboxRow, nested && styles.nested]}
  >
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked ? <Check color="#fff" size={14} strokeWidth={3} /> : null}
    </View>
    <Text style={[styles.checkboxLabel, !nested && styles.checkboxParent]}>
      {label}
    </Text>
  </Pressable>
);

export const ExportDataModal = ({
  visible,
  workspaces,
  globals,
  onClose,
}: ExportDataModalProps) => {
  const [selection, setSelection] = useState(() => createSelection(workspaces));
  const [layout, setLayout] = useState<ExportLayout>('combined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelection(createSelection(workspaces));
    setLayout('combined');
    setError('');
  }, [visible, workspaces]);

  const hasSelection = useMemo(
    () =>
      selection.analysisSettings ||
      selection.appPreferences ||
      Object.values(selection.workspaces).some(
        (workspace) => workspace.categoriesAndGroups || workspace.loggedData,
      ),
    [selection],
  );

  const toggleWorkspace = (workspaceId: string) => {
    const current = selection.workspaces[workspaceId];
    const nextChecked = !(current?.categoriesAndGroups || current?.loggedData);
    setSelection((value) => ({
      ...value,
      workspaces: {
        ...value.workspaces,
        [workspaceId]: {
          categoriesAndGroups: nextChecked,
          loggedData: nextChecked,
        },
      },
    }));
  };

  const toggleWorkspaceSection = (
    workspaceId: string,
    section: 'categoriesAndGroups' | 'loggedData',
  ) =>
    setSelection((value) => ({
      ...value,
      workspaces: {
        ...value.workspaces,
        [workspaceId]: {
          ...value.workspaces[workspaceId],
          [section]: !value.workspaces[workspaceId]?.[section],
        },
      },
    }));

  const exportData = async () => {
    setBusy(true);
    setError('');
    try {
      const bundle = createTransferBundle(workspaces, globals, selection);
      await saveTransferArchives(createTransferArchives(bundle, layout, true));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SystemScreen style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Export data</Text>
            <Text style={styles.subtitle}>
              Choose what belongs in this backup.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close export data"
            onPress={onClose}
            style={styles.iconButton}
          >
            <X color={colors.text} size={21} />
          </Pressable>
        </View>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.sectionTitle}>Workspaces</Text>
          {workspaces.map((workspace) => {
            const selected = selection.workspaces[workspace.id];
            const workspaceChecked = Boolean(
              selected?.categoriesAndGroups || selected?.loggedData,
            );
            return (
              <View key={workspace.id} style={styles.group}>
                <Checkbox
                  label={`${workspace.name} workspace`}
                  checked={workspaceChecked}
                  onPress={() => toggleWorkspace(workspace.id)}
                />
                {workspaceChecked ? (
                  <>
                    <Checkbox
                      label={`${workspace.name} categories and groups`}
                      checked={Boolean(selected?.categoriesAndGroups)}
                      nested
                      onPress={() =>
                        toggleWorkspaceSection(
                          workspace.id,
                          'categoriesAndGroups',
                        )
                      }
                    />
                    <Checkbox
                      label={`${workspace.name} logged data`}
                      checked={Boolean(selected?.loggedData)}
                      nested
                      onPress={() =>
                        toggleWorkspaceSection(workspace.id, 'loggedData')
                      }
                    />
                  </>
                ) : null}
              </View>
            );
          })}

          <Text style={styles.sectionTitle}>Global settings</Text>
          <View style={styles.group}>
            <Checkbox
              label="Analysis and statistics settings"
              checked={selection.analysisSettings}
              onPress={() =>
                setSelection((value) => ({
                  ...value,
                  analysisSettings: !value.analysisSettings,
                }))
              }
            />
            <Checkbox
              label="App preferences"
              checked={selection.appPreferences}
              onPress={() =>
                setSelection((value) => ({
                  ...value,
                  appPreferences: !value.appPreferences,
                }))
              }
            />
          </View>

          <Text style={styles.sectionTitle}>File organization</Text>
          <View style={styles.segmented}>
            {(['combined', 'individual'] as const).map((value) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: layout === value }}
                key={value}
                onPress={() => setLayout(value)}
                style={[
                  styles.segment,
                  layout === value && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    layout === value && styles.segmentTextActive,
                  ]}
                >
                  {value === 'combined' ? 'Combined' : 'Individual files'}
                </Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </KeyboardAwareScrollView>
        <AppButton
          size="utility"
          title={busy ? 'Exporting' : 'Export'}
          disabled={!hasSelection || busy}
          loading={busy}
          onPress={exportData}
        />
      </SystemScreen>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: colors.canvas, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 18,
  },
  headerCopy: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: typeScale.screenTitle,
    fontWeight: '700',
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  iconButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: { gap: 10, padding: 18, paddingBottom: 30, paddingTop: 4 },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    padding: 12,
  },
  nested: { borderTopColor: colors.border, borderTopWidth: 1, paddingLeft: 38 },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: { color: colors.text, flex: 1, fontSize: 14 },
  checkboxParent: { fontWeight: '700' },
  segmented: { flexDirection: 'row' },
  segment: {
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: colors.onPrimary },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
