import type { CategoryDefinition } from '../types/category';
import type { NotificationRequestSpec } from './notificationSchedule';

export interface NotificationResponseData {
  categoryId: string;
  requestId?: string;
  actionIdentifier?: string;
  userText?: string;
  // true when the user tapped the notification body itself, not an action button
  isDefaultTap?: boolean;
}

export interface NotificationService {
  // whether this build can actually load/use expo-notifications (false in unsupported builds)
  checkAvailability: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
  scheduleCategory: (
    category: CategoryDefinition,
    specs: NotificationRequestSpec[],
  ) => Promise<string[]>;
  cancelCategory: (categoryId: string) => Promise<void>;
  addResponseListener: (
    listener: (response: NotificationResponseData) => void,
  ) => { remove: () => void };
  getLastResponse: () => Promise<NotificationResponseData | null>;
}

export const notificationService: NotificationService = {
  checkAvailability: async () => false,
  requestPermission: async () => false,
  scheduleCategory: async () => [],
  cancelCategory: async () => undefined,
  addResponseListener: () => ({ remove: () => undefined }),
  getLastResponse: async () => null,
};
