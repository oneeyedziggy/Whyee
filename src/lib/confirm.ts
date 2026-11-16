import { Alert, Platform } from 'react-native';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

let host: ((request: ConfirmRequest) => void) | null = null;

// `ConfirmDialog` registers itself here so confirmations render with the app's own full-screen
// backdrop instead of the platform alert, whose scrim stops short of the system bars.
export const registerConfirmHost = (
  next: (request: ConfirmRequest) => void,
): (() => void) => {
  host = next;
  return () => {
    if (host === next) host = null;
  };
};

// Alert.alert is a no-op on react-native-web, so fall back to the DOM confirm there.
export const confirmAction = (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void => {
  if (host) {
    host({ title, message, confirmLabel, onConfirm });
    return;
  }
  if (Platform.OS === 'web') {
    const ask = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    if (!ask || ask(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
};
