import { LogBox } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';
import type { CategoryDefinition } from '../types/category';
import type { NotificationRequestSpec } from './notificationSchedule';
import type {
  NotificationResponseData,
  NotificationService,
} from './notificationService';

// Already handled gracefully below (falls back to a no-op); suppress the LogBox popup so it
// doesn't look like a crash while developing in Expo Go (SDK 53+ removed this there).
LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

const channelId = 'category-reminders';
const categoryPrefix = 'category_entry_';
let notificationsModule: typeof ExpoNotifications | null | undefined;
let warned = false;
// expo-notifications throws when actually used under Expo Go on SDK 53+ (Android push support was
// removed there; a development build is required). Log once and degrade to a no-op instead of
// crashing the caller.
const warnUnsupported = (error: unknown) => {
  if (warned) return;
  warned = true;
  console.warn(
    'Notifications are unavailable in this build (likely Expo Go on SDK 53+); use a development build to test scheduling.',
    error,
  );
};

const getNotifications = (): typeof ExpoNotifications | null => {
  if (notificationsModule !== undefined) return notificationsModule;
  try {
    const loaded = require('expo-notifications') as typeof ExpoNotifications;
    notificationsModule = loaded;
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (error) {
    notificationsModule = null;
    warnUnsupported(error);
  }
  return notificationsModule ?? null;
};

const nativeCategoryId = (categoryId: string): string =>
  `${categoryPrefix}${categoryId.replace(/[^A-Za-z0-9_]/g, '_')}`;

const getActions = (
  category: CategoryDefinition,
): ExpoNotifications.NotificationAction[] => {
  if (category.kind === 'multiple-choice' && !category.multiSelect) {
    return category.options.slice(0, 3).map((option, index) => ({
      identifier: `choice:${index}`,
      buttonTitle: option.label,
      options: { opensAppToForeground: true },
    }));
  }
  if (category.kind === 'counter') {
    return category.counter.steps.slice(0, 3).map((step, index) => ({
      identifier: `step:${index}`,
      buttonTitle: step > 0 ? `+${step}` : `${step}`,
      options: { opensAppToForeground: true },
    }));
  }
  if (category.kind === 'number' || category.kind === 'notes') {
    return [
      {
        identifier: 'text',
        buttonTitle: 'Enter',
        textInput: {
          placeholder:
            category.kind === 'number' ? 'Enter a number' : 'Write a note',
          submitButtonTitle: 'Save',
        },
        options: { opensAppToForeground: true },
      },
    ];
  }
  return [];
};

const registerCategory = async (
  notifications: typeof ExpoNotifications,
  category: CategoryDefinition,
): Promise<string> => {
  const identifier = nativeCategoryId(category.id);
  try {
    await notifications.setNotificationCategoryAsync(
      identifier,
      getActions(category),
    );
  } catch (error) {
    warnUnsupported(error);
  }
  return identifier;
};

const requestPermission = async (): Promise<boolean> => {
  const notifications = getNotifications();
  if (!notifications) return false;
  try {
    await notifications.setNotificationChannelAsync(channelId, {
      name: 'Category reminders',
      description: 'Recurring reminders to enter category data.',
      importance: notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    const current = await notifications.getPermissionsAsync();
    if (
      current.granted ||
      current.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    const requested = await notifications.requestPermissionsAsync();
    return (
      requested.granted ||
      requested.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    warnUnsupported(error);
    return false;
  }
};

const scheduleCategory = async (
  category: CategoryDefinition,
  specs: NotificationRequestSpec[],
): Promise<string[]> => {
  const notifications = getNotifications();
  if (!notifications) return [];
  // Do NOT catch-and-swallow here: a real scheduling failure must reach the caller
  // (NotificationSettings.save()) so it can tell the user instead of pretending success.
  const categoryIdentifier = await registerCategory(notifications, category);
  return Promise.all(
    specs.map((spec) =>
      notifications.scheduleNotificationAsync({
        content: {
          title: `Enter ${category.name}`,
          body: `Log today's ${category.name}.`,
          categoryIdentifier,
          data: {
            source: 'category-reminder',
            categoryId: category.id,
            timeId: spec.timeId,
          },
          sound: 'default',
        },
        trigger: spec.weekday
          ? {
              type: notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: spec.weekday,
              hour: spec.hour,
              minute: spec.minute,
              channelId,
            }
          : {
              type: notifications.SchedulableTriggerInputTypes.DAILY,
              hour: spec.hour,
              minute: spec.minute,
              channelId,
            },
      }),
    ),
  );
};

const checkAvailability = async (): Promise<boolean> =>
  getNotifications() !== null;

const cancelCategory = async (categoryId: string): Promise<void> => {
  const notifications = getNotifications();
  if (!notifications) return;
  try {
    const scheduled = await notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => request.content.data?.categoryId === categoryId)
        .map((request) =>
          notifications.cancelScheduledNotificationAsync(request.identifier),
        ),
    );
  } catch (error) {
    warnUnsupported(error);
  }
};

const toResponseData = (
  notifications: typeof ExpoNotifications,
  response: ExpoNotifications.NotificationResponse,
): NotificationResponseData | null => {
  const data = response.notification.request.content.data;
  if (
    !data ||
    data.source !== 'category-reminder' ||
    typeof data.categoryId !== 'string'
  ) {
    return null;
  }

  return {
    categoryId: data.categoryId,
    requestId: response.notification.request.identifier,
    actionIdentifier: response.actionIdentifier,
    userText: response.userText,
    isDefaultTap:
      response.actionIdentifier === notifications.DEFAULT_ACTION_IDENTIFIER,
  };
};

const addResponseListener = (
  listener: (response: NotificationResponseData) => void,
) => {
  const notifications = getNotifications();
  if (!notifications) return { remove: () => undefined };
  try {
    return notifications.addNotificationResponseReceivedListener((response) => {
      const data = toResponseData(notifications, response);
      if (data) listener(data);
    });
  } catch (error) {
    warnUnsupported(error);
    return { remove: () => undefined };
  }
};

const getLastResponse = async (): Promise<NotificationResponseData | null> => {
  const notifications = getNotifications();
  if (!notifications) return null;
  try {
    const response = await notifications.getLastNotificationResponseAsync();
    return response ? toResponseData(notifications, response) : null;
  } catch (error) {
    warnUnsupported(error);
    return null;
  }
};

export const notificationService: NotificationService = {
  checkAvailability,
  requestPermission,
  scheduleCategory,
  cancelCategory,
  addResponseListener,
  getLastResponse,
};
