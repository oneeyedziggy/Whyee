import { Alert, Platform } from 'react-native';

// Alert.alert is a no-op on react-native-web, so fall back to the DOM confirm there.
export const confirmAction = (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void => {
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
