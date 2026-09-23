import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/tokens';

export interface ContextMenuItem {
  key: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
  screenWidth: number;
}

// Only one ContextMenu should be open at a time; opening one closes any others.
const openMenuCloseHandlers = new Set<() => void>();
const closeOtherMenus = (except: () => void) => {
  openMenuCloseHandlers.forEach((close) => {
    if (close !== except) close();
  });
};

// Small custom dropdown menu (no library): trigger + backdrop-modal popup, dismissed on outside tap.
export const ContextMenu = ({
  items,
  accessibilityLabel,
  renderTrigger,
  triggerStyle,
}: {
  items: ContextMenuItem[];
  accessibilityLabel: string;
  renderTrigger: (open: () => void) => ReactNode;
  triggerStyle?: StyleProp<ViewStyle>;
}) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<View>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    closeOtherMenus(close);
    openMenuCloseHandlers.add(close);
    return () => {
      openMenuCloseHandlers.delete(close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({
        x,
        y,
        width,
        height,
        screenWidth: Dimensions.get('window').width,
      });
      setOpen(true);
    });
  };

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={openMenu}
        ref={triggerRef}
        style={triggerStyle}
      >
        {renderTrigger(openMenu)}
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent={Platform.OS === 'android'}
        transparent
        visible={open}
      >
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={close}
          style={styles.backdrop}
        >
          <View
            style={[
              styles.menu,
              anchor
                ? {
                    position: 'absolute',
                    top: anchor.y + anchor.height + 4,
                    right: anchor.screenWidth - (anchor.x + anchor.width),
                  }
                : null,
            ]}
          >
            {items.map((item) => (
              <ContextMenuRow
                key={item.key}
                item={item}
                onSelect={() => {
                  close();
                  item.onPress();
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const ContextMenuRow = ({
  item,
  onSelect,
}: {
  item: ContextMenuItem;
  onSelect: () => void;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole="menuitem"
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      onPress={onSelect}
      style={[styles.item, hovered && styles.itemHovered]}
    >
      <Text
        style={[
          styles.itemText,
          item.destructive && styles.itemTextDestructive,
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 180,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  item: { paddingHorizontal: 14, paddingVertical: 10 },
  itemHovered: { backgroundColor: colors.canvas },
  itemText: { color: colors.text, fontSize: 15 },
  itemTextDestructive: { color: colors.danger },
});
