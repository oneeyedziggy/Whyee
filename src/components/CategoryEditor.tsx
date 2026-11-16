import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryDefinition, CategoryGroup } from '../types/category';
import { CategoryDetails, GroupDetails } from './CategoryDetails';
import { DraggableCategoryList } from './CategoryList';
import { AppButton } from './AppButton';
import { InfoLink } from './InfoLink';
import { NotificationSettings } from './NotificationSettings';
import { styles } from './categoryEditorStyles';

interface CategoryEditorProps {
  visible: boolean;
  categories: CategoryDefinition[];
  groups: CategoryGroup[];
  selectedCategoryId: string;
  selectedGroupId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddGroup: () => void;
  onAddCategoryToGroup: (groupId: string) => void;
  onRestoreDefaults: () => void;
  onDeleteGroup: (groupId: string) => void;
  onDelete: (id: string) => void;
  onMoveCategory: (
    categoryId: string,
    targetGroupId: string,
    targetIndex: number,
  ) => void;
  onUpdate: (category: CategoryDefinition) => void;
  onSelectGroup: (groupId: string) => void;
  onUpdateGroup: (group: CategoryGroup) => void;
  onToggleGroupEnabled: (groupId: string, enabled: boolean) => void;
  entryCounts?: Record<string, number>;
  notificationSupported?: boolean;
}

export const CategoryEditor = ({
  visible,
  categories,
  groups,
  selectedCategoryId,
  selectedGroupId,
  onClose,
  onSelect,
  onAddGroup,
  onAddCategoryToGroup,
  onRestoreDefaults,
  onDeleteGroup,
  onDelete,
  onMoveCategory,
  onUpdate,
  onSelectGroup,
  onUpdateGroup,
  onToggleGroupEnabled,
  entryCounts,
  notificationSupported = true,
}: CategoryEditorProps) => {
  const selected = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const panelWidth = Math.min(560, Math.max(380, Math.round(width / 3)));
  const slide = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [dragging, setDragging] = useState(false);
  const [notificationCategoryId, setNotificationCategoryId] = useState('');
  const notificationCategory = categories.find(
    (category) => category.id === notificationCategoryId,
  );
  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [slide, visible]);
  return (
    <Modal
      visible={visible}
      animationType={desktop ? 'fade' : 'slide'}
      transparent={desktop}
      onRequestClose={onClose}
      presentationStyle={desktop ? 'overFullScreen' : 'pageSheet'}
      statusBarTranslucent={!desktop && Platform.OS === 'android'}
    >
      <SafeAreaView
        edges={desktop ? [] : ['top', 'bottom']}
        style={desktop ? styles.desktopBackdrop : styles.mobileModal}
      >
        {desktop ? (
          <Pressable
            accessibilityLabel="Close category editor"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Animated.View
          style={[
            styles.root,
            desktop && styles.desktopPanel,
            desktop && {
              width: panelWidth,
              opacity: slide,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-panelWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.heading, !desktop && styles.headingMobile]}>
            <View>
              <Text style={styles.headingTitle}>Category editor</Text>
              <Text style={styles.caption}>Select a category to edit it.</Text>
            </View>
            <InfoLink
              section="categories"
              label="Open category editor documentation"
            />
            <AppButton title="Done" onPress={onClose} />
          </View>
          <View style={styles.addRow}>
            <AppButton title="Add group" onPress={onAddGroup} />
            <AppButton title="Restore defaults" onPress={onRestoreDefaults} />
          </View>
          <ScrollView
            style={styles.categoryScroller}
            contentContainerStyle={styles.categoryList}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!dragging}
            showsVerticalScrollIndicator
          >
            <DraggableCategoryList
              groups={groups}
              categories={categories}
              selectedCategoryId={selectedGroup ? '' : selectedCategoryId}
              selectedGroupId={selectedGroupId}
              onSelect={(id) => {
                onSelectGroup('');
                onSelect(id);
              }}
              onSelectGroup={(id) => {
                onSelect('');
                onSelectGroup(id);
              }}
              onUpdateCategory={onUpdate}
              onUpdateGroup={onUpdateGroup}
              onToggleGroupEnabled={onToggleGroupEnabled}
              onAddCategoryToGroup={onAddCategoryToGroup}
              onDragChange={setDragging}
              onMove={onMoveCategory}
              onDelete={onDelete}
              onSetNotification={
                notificationSupported
                  ? (category) => setNotificationCategoryId(category.id)
                  : undefined
              }
            />
            {selected && !selectedGroup ? (
              <CategoryDetails
                category={selected}
                entryCount={entryCounts?.[selected.id] ?? 0}
                onUpdate={onUpdate}
                onDelete={() => onDelete(selected.id)}
                onDragChange={setDragging}
              />
            ) : null}
            {selectedGroup ? (
              <GroupDetails
                group={selectedGroup}
                onUpdate={onUpdateGroup}
                onToggleEnabled={(enabled) =>
                  onToggleGroupEnabled(selectedGroup.id, enabled)
                }
                onDelete={() => onDeleteGroup(selectedGroup.id)}
              />
            ) : null}
          </ScrollView>
          {notificationCategory ? (
            <NotificationSettings
              category={notificationCategory}
              visible
              onClose={() => setNotificationCategoryId('')}
              onUpdate={(category) => {
                onUpdate(category);
                setNotificationCategoryId('');
              }}
            />
          ) : null}
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
};
