import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { getLocalDateKey } from '../lib/dates';
import { applyNotificationResponse } from '../lib/notificationEntry';
import { notificationService } from '../lib/notificationService';
import { expandNotificationSchedule } from '../lib/notificationSchedule';
import type { NotificationResponseData } from '../lib/notificationService';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../types/category';

interface UseNotificationSyncArgs {
  hydrated: boolean;
  categoriesByWorkspace: Record<string, CategoryDefinition[]>;
  recordsByWorkspace: Record<string, Record<string, CategorySelectionRecord>>;
  setRecordsByWorkspace: Dispatch<
    SetStateAction<Record<string, Record<string, CategorySelectionRecord>>>
  >;
  setActiveWorkspaceId: Dispatch<SetStateAction<string>>;
  setSelectedDate: Dispatch<SetStateAction<Date>>;
  setSelectedCategoryId: Dispatch<SetStateAction<string>>;
  setPage: (next: 'daily' | 'stats') => void;
  scrollToCategory: (categoryId: string) => void;
  activeWorkspaceId: string;
  selectedDateKey: string;
}

export const useNotificationSync = ({
  hydrated,
  categoriesByWorkspace,
  recordsByWorkspace,
  setRecordsByWorkspace,
  setActiveWorkspaceId,
  setSelectedDate,
  setSelectedCategoryId,
  setPage,
  scrollToCategory,
  activeWorkspaceId,
  selectedDateKey,
}: UseNotificationSyncArgs) => {
  const notificationReconcileRan = useRef(false);
  const [pendingFocusCategoryId, setPendingFocusCategoryId] = useState('');
  const handledNotificationResponseIds = useRef(new Set<string>());

  useEffect(() => {
    if (!hydrated || notificationReconcileRan.current) return;
    notificationReconcileRan.current = true;
    (async () => {
      if (!(await notificationService.checkAvailability())) return;
      for (const workspaceCategories of Object.values(categoriesByWorkspace)) {
        for (const category of workspaceCategories) {
          if (!category.enabled || !category.notificationSchedule?.enabled)
            continue;
          const specs = expandNotificationSchedule(
            category.notificationSchedule,
          );
          try {
            await notificationService.cancelCategory(category.id);
            if (specs.length)
              await notificationService.scheduleCategory(category, specs);
          } catch (error) {
            console.warn(
              `Failed to reconcile notifications for category ${category.id}`,
              error,
            );
          }
        }
      }
    })();
  }, [categoriesByWorkspace, hydrated]);

  const handleNotificationResponse = (data: NotificationResponseData) => {
    if (data.requestId) {
      if (handledNotificationResponseIds.current.has(data.requestId)) return;
      handledNotificationResponseIds.current.add(data.requestId);
    }
    let match: [string, CategoryDefinition] | undefined;
    for (const [workspaceId, workspaceCategories] of Object.entries(
      categoriesByWorkspace,
    )) {
      const candidate = workspaceCategories.find(
        (category) => category.id === data.categoryId,
      );
      if (candidate) {
        match = [workspaceId, candidate];
        break;
      }
    }
    if (!match) return;
    const [workspaceId, category] = match;
    if (!data.isDefaultTap) {
      const today = getLocalDateKey();
      const workspaceRecords = recordsByWorkspace[workspaceId] ?? {};
      const existingEntries = Object.values(workspaceRecords).filter(
        (record) =>
          record.categoryId === category.id && record.dateKey === today,
      );
      const result = applyNotificationResponse(category, existingEntries, {
        actionIdentifier: data.actionIdentifier,
        userText: data.userText,
      });
      if (result.kind !== 'invalid') {
        setRecordsByWorkspace((current) => ({
          ...current,
          [workspaceId]: {
            ...(current[workspaceId] ?? {}),
            [result.entry.key]: result.entry,
          },
        }));
      }
    }
    setActiveWorkspaceId(workspaceId);
    setSelectedDate(new Date());
    setSelectedCategoryId(category.id);
    setPage('daily');
    setPendingFocusCategoryId(category.id);
  };

  const handleNotificationResponseRef = useRef(handleNotificationResponse);
  handleNotificationResponseRef.current = handleNotificationResponse;

  useEffect(() => {
    let active = true;
    const subscription = notificationService.addResponseListener((response) =>
      handleNotificationResponseRef.current(response),
    );
    notificationService.getLastResponse().then((response) => {
      if (active && response) handleNotificationResponseRef.current(response);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingFocusCategoryId) return;
    const frame = requestAnimationFrame(() => {
      scrollToCategory(pendingFocusCategoryId);
      setPendingFocusCategoryId('');
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeWorkspaceId,
    pendingFocusCategoryId,
    scrollToCategory,
    selectedDateKey,
  ]);
};
