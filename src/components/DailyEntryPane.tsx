import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton } from './AppButton';

export const DailyEntryPane = ({
  children,
  onEditCategories,
}: PropsWithChildren<{ onEditCategories: () => void }>) => (
  <View testID="daily-entry-pane" style={styles.root}>
    <AppButton
      size="block"
      accessibilityLabel="Open category editor"
      title="Edit categories"
      onPress={onEditCategories}
    />
    {children}
  </View>
);

const styles = StyleSheet.create({ root: { gap: 12 } });
