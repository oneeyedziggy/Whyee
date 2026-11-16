import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react-native';
import { AppButton } from './AppButton';
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
import { isDuplicateWorkspaceName } from '../lib/workspaces';
import { DraggableList } from './DraggableList';
import { colors, typeScale } from '../theme/tokens';
import type { WorkspaceMeta } from '../types/workspace';
import { SystemScreen } from './SystemScreen';

interface WorkspaceManagerModalProps {
  visible: boolean;
  workspaces: WorkspaceMeta[];
  onClose: () => void;
  onAdd: (name: string, notes: string) => void;
  onUpdate: (id: string, patch: Partial<WorkspaceMeta>) => void;
  onReorder: (from: number, to: number) => void;
  onDelete: (id: string) => void;
}

export const WorkspaceManagerModal = ({
  visible,
  workspaces,
  onClose,
  onAdd,
  onUpdate,
  onReorder,
  onDelete,
}: WorkspaceManagerModalProps) => {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [dragging, setDragging] = useState(false);
  const { width, height } = useWindowDimensions();
  const desktop = width >= 900;
  const dialogWidth = Math.min(760, Math.round(width * 0.72));
  const dialogHeight = Math.round(height * 0.86);

  useEffect(() => {
    if (!visible) {
      setName('');
      setNotes('');
    }
  }, [visible]);

  const trimmedName = name.trim();
  const duplicate = useMemo(
    () => Boolean(trimmedName) && isDuplicateWorkspaceName(workspaces, name),
    [name, trimmedName, workspaces],
  );
  const canAdd = Boolean(trimmedName) && !duplicate;

  const submit = () => {
    if (!canAdd) return;
    onAdd(trimmedName, notes.trim());
    setName('');
    setNotes('');
  };

  return (
    <Modal
      visible={visible}
      animationType={desktop ? 'fade' : 'slide'}
      transparent={desktop}
      statusBarTranslucent={!desktop && Platform.OS === 'android'}
      presentationStyle={desktop ? 'overFullScreen' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SystemScreen
        enabled={!desktop}
        style={desktop ? styles.backdrop : styles.fill}
      >
        {desktop ? (
          <Pressable
            accessibilityLabel="Close workspaces"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          accessibilityViewIsModal
          style={[
            styles.root,
            desktop && styles.desktopDialog,
            desktop && { width: dialogWidth, height: dialogHeight },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Workspaces</Text>
              <Text style={styles.subtitle}>
                Each workspace keeps its own categories and logged data.
              </Text>
            </View>
            <AppButton title="Done" onPress={onClose} />
          </View>
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
            scrollEnabled={!dragging}
          >
            <View style={styles.addCard}>
              <Text style={styles.cardTitle}>New workspace</Text>
              <Text style={styles.label}>Name</Text>
              <TextInput
                accessibilityLabel="New workspace name"
                value={name}
                onChangeText={setName}
                placeholder="Workspace name"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
              />
              <Text style={styles.label}>Notes</Text>
              <TextInput
                accessibilityLabel="New workspace notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Shown under the workspace bar"
                placeholderTextColor={colors.placeholder}
                multiline
                style={[styles.input, styles.notesInput]}
              />
              {duplicate ? (
                <Text style={styles.error}>
                  A workspace with that name already exists.
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdd }}
                disabled={!canAdd}
                onPress={submit}
                style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
              >
                <Text style={styles.addButtonText}>Add workspace</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Existing workspaces</Text>
            <WorkspaceRows
              workspaces={workspaces}
              onUpdate={onUpdate}
              onReorder={onReorder}
              onDelete={onDelete}
              onDragChange={setDragging}
            />
          </KeyboardAwareScrollView>
        </View>
      </SystemScreen>
    </Modal>
  );
};

const ROW_HEIGHT = 128;

const WorkspaceRows = ({
  workspaces,
  onUpdate,
  onReorder,
  onDelete,
  onDragChange,
}: {
  workspaces: WorkspaceMeta[];
  onUpdate: (id: string, patch: Partial<WorkspaceMeta>) => void;
  onReorder: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  onDragChange: (dragging: boolean) => void;
}) => {
  const canDelete = workspaces.length > 1;
  return (
    <DraggableList
      items={workspaces}
      keyFor={(workspace) => workspace.id}
      fallbackHeightFor={() => ROW_HEIGHT}
      gapStyle={styles.dropGap}
      onDragChange={onDragChange}
      onDrop={onReorder}
      renderItem={(workspace, { held, panHandlers }) => {
        const hidden = Boolean(workspace.hidden);
        return (
          <View style={[styles.row, held && styles.rowDragging]}>
            <View style={styles.rowTop}>
              <View
                accessibilityLabel={`Reorder ${workspace.name}`}
                accessibilityRole="adjustable"
                style={styles.dragHandle}
                {...panHandlers}
              >
                <Text style={styles.dragHandleText} selectable={false}>
                  ⠿
                </Text>
              </View>
              <TextInput
                accessibilityLabel={`Rename ${workspace.name}`}
                value={workspace.name}
                onChangeText={(next) => onUpdate(workspace.id, { name: next })}
                style={[styles.input, styles.nameInput]}
              />
              <Pressable
                accessibilityLabel={
                  hidden
                    ? `Show ${workspace.name} in the workspace bar`
                    : `Hide ${workspace.name} from the workspace bar`
                }
                accessibilityRole="button"
                onPress={() => onUpdate(workspace.id, { hidden: !hidden })}
                style={styles.iconButton}
              >
                {hidden ? (
                  <EyeOff color={colors.muted} size={19} />
                ) : (
                  <Eye color={colors.primary} size={19} />
                )}
              </Pressable>
              <Pressable
                accessibilityLabel={`Delete ${workspace.name}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canDelete }}
                disabled={!canDelete}
                onPress={() => onDelete(workspace.id)}
                style={[
                  styles.iconButton,
                  !canDelete && styles.iconButtonDisabled,
                ]}
              >
                <Trash2 color={colors.danger} size={19} />
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel={`Notes for ${workspace.name}`}
              value={workspace.notes ?? ''}
              onChangeText={(next) => onUpdate(workspace.id, { notes: next })}
              placeholder="Notes"
              placeholderTextColor={colors.placeholder}
              multiline
              style={[styles.input, styles.notesInput]}
            />
            {hidden ? (
              <Text style={styles.caption}>Hidden from the bar</Text>
            ) : null}
          </View>
        );
      }}
    />
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
    // flex-basis 0 (from the `flex: 0` shorthand) beats explicit height on the main axis; stay auto.
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    maxHeight: '86%',
    overflow: 'hidden',
  },
  header: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerCopy: { flex: 1 },
  title: {
    color: colors.text,
    fontSize: typeScale.screenTitle,
    fontWeight: '700',
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  iconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconButtonDisabled: { opacity: 0.35 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  addCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 12, marginTop: 10 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    color: colors.text,
    fontSize: 14,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  nameInput: { flex: 1, marginTop: 0 },
  notesInput: { minHeight: 46, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 6,
    marginTop: 12,
    paddingVertical: 10,
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 8,
  },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 10,
    padding: 10,
  },
  rowDragging: { borderColor: colors.primary, elevation: 3 },
  rowTop: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  dragHandle: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 28,
    ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : {}),
  },
  dragHandleText: { color: colors.muted, fontSize: 18 },
  dropGap: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    marginBottom: 10,
  },
  caption: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
