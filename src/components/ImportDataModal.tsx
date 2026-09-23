import { FileUp, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  buildImportPlan,
  parseTransferArchive,
  remapImportedWorkspaces,
  resolveDefaultImportTarget,
} from '../lib/dataTransfer';
import { pickTransferFile } from '../lib/dataTransferFile';
import { colors } from '../theme/tokens';
import { WorkspacePicker } from './WorkspacePicker';
import { SystemScreen } from './SystemScreen';
import type {
  ConflictResolution,
  GlobalTransferSnapshot,
  ImportConflict,
  ImportMode,
  ImportPlan,
  ParsedTransferArchive,
  WorkspaceTransferSnapshot,
} from '../types/dataTransfer';

interface ImportDataModalProps {
  visible: boolean;
  workspaces: WorkspaceTransferSnapshot[];
  globals: GlobalTransferSnapshot;
  onApply: (plan: ImportPlan) => void;
  onClose: () => void;
}

type MergeChoice = ConflictResolution | 'review';

const previewValue = (value: unknown): string => {
  if (value === undefined) return 'Not set';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
};

const confirmOverwrite = (message: string, onConfirm: () => void): void => {
  if (Platform.OS === 'web') {
    const ask = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    if (!ask || ask(`Overwrite Whyee data?\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert('Overwrite Whyee data?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Overwrite', style: 'destructive', onPress: onConfirm },
  ]);
};

export const ImportDataModal = ({
  visible,
  workspaces,
  globals,
  onApply,
  onClose,
}: ImportDataModalProps) => {
  const [parsed, setParsed] = useState<ParsedTransferArchive | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [mergeChoice, setMergeChoice] = useState<MergeChoice>('imported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reviewConflicts, setReviewConflicts] = useState<ImportConflict[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [decisions, setDecisions] = useState<
    Record<string, ConflictResolution>
  >({});
  const [targets, setTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    setParsed(null);
    setMode('merge');
    setMergeChoice('imported');
    setError('');
    setReviewConflicts([]);
    setReviewIndex(0);
    setDecisions({});
    setTargets({});
  }, [visible]);

  const includedSummary = useMemo(() => {
    if (!parsed) return '';
    const workspaceSummary = parsed.bundle.workspaces
      .map((workspace) => {
        const sections = [
          workspace.categories
            ? `${workspace.categories.length} categories`
            : '',
          workspace.groups ? `${workspace.groups.length} groups` : '',
          workspace.records
            ? `${Object.keys(workspace.records).length} records`
            : '',
        ].filter(Boolean);
        return `${workspace.name}: ${sections.join(', ')}`;
      })
      .join('\n');
    const globalCount = Object.keys(parsed.bundle.globals).length;
    return [
      workspaceSummary,
      globalCount ? `${globalCount} global settings groups` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [parsed]);

  const pickFile = async () => {
    setBusy(true);
    setError('');
    try {
      const selected = await pickTransferFile();
      if (!selected) return;
      const archive = parseTransferArchive(selected.fileName, selected.bytes);
      setParsed(archive);
      setTargets(
        Object.fromEntries(
          archive.bundle.workspaces.map((workspace) => [
            workspace.id,
            resolveDefaultImportTarget(workspace, workspaces),
          ]),
        ),
      );
    } catch (reason) {
      setParsed(null);
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const applyPlan = (plan: ImportPlan) => {
    try {
      onApply(plan);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    }
  };

  const beginImport = () => {
    if (!parsed) return;
    setError('');
    try {
      const bundle = remapImportedWorkspaces(
        parsed.bundle,
        targets,
        workspaces,
      );
      if (mode === 'overwrite') {
        const plan = buildImportPlan(workspaces, globals, bundle, 'overwrite');
        confirmOverwrite(
          `This replaces the included sections from:\n${includedSummary}`,
          () => applyPlan(plan),
        );
        return;
      }
      const defaultResolution =
        mergeChoice === 'imported' ? 'imported' : 'local';
      const plan = buildImportPlan(
        workspaces,
        globals,
        bundle,
        'merge',
        defaultResolution,
      );
      if (mergeChoice !== 'review' || !plan.conflicts.length) {
        applyPlan(plan);
        return;
      }
      setReviewConflicts(plan.conflicts);
      setReviewIndex(0);
      setDecisions({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    }
  };

  const chooseConflict = (
    resolution: ConflictResolution,
    applyToRemaining: boolean,
  ) => {
    if (!parsed) return;
    const conflict = reviewConflicts[reviewIndex];
    const nextDecisions = { ...decisions, [conflict.id]: resolution };
    if (applyToRemaining) {
      for (const remaining of reviewConflicts.slice(reviewIndex + 1)) {
        nextDecisions[remaining.id] = resolution;
      }
    }
    const finished =
      applyToRemaining || reviewIndex === reviewConflicts.length - 1;
    if (!finished) {
      setDecisions(nextDecisions);
      setReviewIndex((index) => index + 1);
      return;
    }
    try {
      applyPlan(
        buildImportPlan(
          workspaces,
          globals,
          remapImportedWorkspaces(parsed.bundle, targets, workspaces),
          'merge',
          'local',
          nextDecisions,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
      setReviewConflicts([]);
    }
  };

  const conflict = reviewConflicts[reviewIndex];

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
            <Text style={styles.title}>Import data</Text>
            <Text style={styles.subtitle}>
              Restore a Whyee configuration export.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close import data"
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
          {!parsed ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={pickFile}
              style={styles.picker}
            >
              {busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <FileUp color={colors.primary} size={26} />
              )}
              <Text style={styles.pickerTitle}>
                {busy ? 'Opening file picker' : 'Choose Whyee export'}
              </Text>
              <Text style={styles.pickerDescription}>
                Select a Whyee.*.config.zip or Whyee.*.config.json file.
              </Text>
            </Pressable>
          ) : conflict ? (
            <View style={styles.conflictPanel}>
              <Text style={styles.sectionTitle}>
                Conflict {reviewIndex + 1} of {reviewConflicts.length}
              </Text>
              <Text style={styles.conflictTitle}>{conflict.label}</Text>
              <Text style={styles.delta}>
                Changed: {conflict.changedFields.join(', ')}
              </Text>
              <Text style={styles.valueLabel}>Local</Text>
              <Text style={styles.value}>
                {previewValue(conflict.localValue)}
              </Text>
              <Text style={styles.valueLabel}>Imported</Text>
              <Text style={styles.value}>
                {previewValue(conflict.importedValue)}
              </Text>
              <View style={styles.choiceRow}>
                <ChoiceButton
                  label="Keep local"
                  onPress={() => chooseConflict('local', false)}
                />
                <ChoiceButton
                  label="Use imported"
                  onPress={() => chooseConflict('imported', false)}
                  primary
                />
              </View>
              <View style={styles.choiceRow}>
                <ChoiceButton
                  label="Keep local for remaining"
                  onPress={() => chooseConflict('local', true)}
                />
                <ChoiceButton
                  label="Use imported for remaining"
                  onPress={() => chooseConflict('imported', true)}
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.preview}>
                <Text style={styles.previewName}>{parsed.fileName}</Text>
                <Text style={styles.previewSummary}>{includedSummary}</Text>
              </View>
              <Text style={styles.sectionTitle}>Import destination</Text>
              {parsed.bundle.workspaces.map((workspace) => {
                const claimedElsewhere = parsed.bundle.workspaces
                  .filter((other) => other.id !== workspace.id)
                  .map((other) => targets[other.id])
                  .filter((id): id is string => Boolean(id) && id !== 'new');
                return (
                  <View key={workspace.id} style={styles.targetRow}>
                    <Text style={styles.targetLabel}>{workspace.name}</Text>
                    <WorkspacePicker
                      options={[
                        ...workspaces.map((local) => ({
                          id: local.id,
                          label: local.name,
                        })),
                        { id: 'new', label: 'New workspace' },
                      ]}
                      selectedId={targets[workspace.id] ?? 'new'}
                      onSelect={(id) =>
                        setTargets((current) => ({
                          ...current,
                          [workspace.id]: id,
                        }))
                      }
                      disabledIds={claimedElsewhere}
                    />
                  </View>
                );
              })}
              <Text style={styles.sectionTitle}>Import behavior</Text>
              <View style={styles.segmented}>
                {(['merge', 'overwrite'] as const).map((value) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: mode === value }}
                    key={value}
                    onPress={() => setMode(value)}
                    style={[
                      styles.segment,
                      mode === value && styles.segmentActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        mode === value && styles.segmentTextActive,
                      ]}
                    >
                      {value === 'merge' ? 'Merge' : 'Overwrite'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {mode === 'merge' ? (
                <View style={styles.optionGroup}>
                  <Text style={styles.optionHeading}>When values conflict</Text>
                  {(
                    [
                      ['imported', 'Favor imported'],
                      ['local', 'Favor local'],
                      ['review', 'Review each conflict'],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: mergeChoice === value }}
                      key={value}
                      onPress={() => setMergeChoice(value)}
                      style={styles.radioRow}
                    >
                      <View
                        style={[
                          styles.radio,
                          mergeChoice === value && styles.radioSelected,
                        ]}
                      />
                      <Text style={styles.radioLabel}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.warning}>
                  Included sections replace their current values. Sections
                  absent from the file are preserved.
                </Text>
              )}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </KeyboardAwareScrollView>
        {parsed && !conflict ? (
          <Pressable
            accessibilityRole="button"
            onPress={beginImport}
            style={[
              styles.primaryButton,
              mode === 'overwrite' && styles.destructiveButton,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {mode === 'overwrite'
                ? 'Overwrite selected data'
                : 'Merge selected data'}
            </Text>
          </Pressable>
        ) : null}
      </SystemScreen>
    </Modal>
  );
};

const ChoiceButton = ({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.choiceButton, primary && styles.choiceButtonPrimary]}
  >
    <Text style={[styles.choiceText, primary && styles.choiceTextPrimary]}>
      {label}
    </Text>
  </Pressable>
);

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
  title: { color: colors.text, fontSize: 23, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  iconButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: { gap: 14, padding: 18, paddingBottom: 36, paddingTop: 4 },
  picker: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 28,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  pickerDescription: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  preview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  previewName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  previewSummary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  targetRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  targetLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  segmented: { flexDirection: 'row' },
  segment: {
    alignItems: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 11,
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: '#fff' },
  optionGroup: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  optionHeading: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  radioRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 42,
  },
  radio: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    width: 18,
  },
  radioSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 5,
  },
  radioLabel: { color: colors.text, fontSize: 14 },
  warning: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  conflictPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  conflictTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  delta: { color: colors.muted, fontSize: 13, marginBottom: 14, marginTop: 5 },
  valueLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  value: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 3 },
  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  choiceButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    padding: 7,
  },
  choiceButtonPrimary: { backgroundColor: colors.primary },
  choiceText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  choiceTextPrimary: { color: '#fff' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 7,
    justifyContent: 'center',
    marginBottom: 24,
    maxWidth: 520,
    minHeight: 46,
    width: '90%',
  },
  destructiveButton: { backgroundColor: colors.danger },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
