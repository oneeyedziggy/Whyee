import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { registerConfirmHost, type ConfirmRequest } from '../lib/confirm';
import { colors } from '../theme/tokens';

export const ConfirmDialog = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  useEffect(() => registerConfirmHost(setRequest), []);
  const close = () => setRequest(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !request) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      request.onConfirm();
      close();
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [request]);

  return (
    <Modal
      visible={Boolean(request)}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent={Platform.OS === 'android'}
      navigationBarTranslucent={Platform.OS === 'android'}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Dismiss confirmation"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessible
          accessibilityLabel={request?.title}
          accessibilityViewIsModal
          style={styles.dialog}
        >
          <Text style={styles.title}>{request?.title}</Text>
          <Text style={styles.message}>{request?.message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                request?.onConfirm();
                close();
              }}
              style={styles.confirm}
            >
              <Text style={styles.confirmText}>{request?.confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 35, 59, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    elevation: 8,
    maxWidth: 420,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    width: '100%',
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  message: { color: colors.muted, fontSize: 14, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  cancel: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  confirm: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
