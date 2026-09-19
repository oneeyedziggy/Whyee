import { useState } from 'react';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react-native';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors } from '../theme/tokens';

export interface WorkspacePickerOption {
  id: string;
  label: string;
}

interface WorkspacePickerProps {
  options: WorkspacePickerOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabledIds?: string[];
  onManage?: () => void;
}

const EDGE_SLACK = 1;

export const WorkspacePicker = ({
  options,
  selectedId,
  onSelect,
  disabledIds = [],
  onManage,
}: WorkspacePickerProps) => {
  const [track, setTrack] = useState({ viewport: 0, content: 0, offset: 0 });
  const [scroller, setScroller] = useState<ScrollView | null>(null);
  const maxOffset = Math.max(0, track.content - track.viewport);
  const overflowing = maxOffset > EDGE_SLACK;
  const atStart = track.offset <= EDGE_SLACK;
  const atEnd = track.offset >= maxOffset - EDGE_SLACK;

  const page = (direction: -1 | 1) => {
    const step = track.viewport || 1;
    const next = Math.max(
      0,
      Math.min(maxOffset, track.offset + direction * step),
    );
    scroller?.scrollTo({ x: next, animated: true });
  };

  return (
    <View style={styles.row}>
      {overflowing ? (
        <Pressable
          accessibilityLabel="Show previous workspaces"
          accessibilityRole="button"
          accessibilityState={{ disabled: atStart }}
          disabled={atStart}
          onPress={() => page(-1)}
          style={[styles.chevron, atStart && styles.chevronDisabled]}
        >
          <ChevronLeft color={colors.primary} size={18} />
        </Pressable>
      ) : null}
      <ScrollView
        ref={setScroller}
        testID="workspace-track"
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={styles.track}
        onLayout={(event) =>
          setTrack((current) => ({
            ...current,
            viewport: event.nativeEvent.layout.width,
          }))
        }
        onContentSizeChange={(content) =>
          setTrack((current) => ({ ...current, content }))
        }
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
          setTrack((current) => ({
            ...current,
            offset: event.nativeEvent.contentOffset.x,
          }))
        }
      >
        {options.map((option) => {
          const active = option.id === selectedId;
          const disabled = !active && disabledIds.includes(option.id);
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(option.id)}
              style={[
                styles.button,
                active && styles.buttonActive,
                disabled && styles.buttonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.text,
                  active && styles.textActive,
                  disabled && styles.textDisabled,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {overflowing ? (
        <Pressable
          accessibilityLabel="Show more workspaces"
          accessibilityRole="button"
          accessibilityState={{ disabled: atEnd }}
          disabled={atEnd}
          onPress={() => page(1)}
          style={[styles.chevron, atEnd && styles.chevronDisabled]}
        >
          <ChevronRight color={colors.primary} size={18} />
        </Pressable>
      ) : null}
      {onManage ? (
        <Pressable
          accessibilityLabel="Manage workspaces"
          accessibilityRole="button"
          onPress={onManage}
          style={styles.addButton}
        >
          <Settings color={colors.primary} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    alignSelf: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    maxWidth: '100%',
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  track: { flexDirection: 'row' },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 15,
    paddingVertical: 6,
  },
  buttonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  buttonDisabled: { opacity: 0.4 },
  text: { color: colors.text, fontSize: 13, fontWeight: '700' },
  textActive: { color: '#fff' },
  textDisabled: { color: colors.muted },
  chevron: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    width: 44,
  },
  chevronDisabled: { opacity: 0.3 },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    height: 44,
    marginLeft: 6,
    width: 44,
  },
});
