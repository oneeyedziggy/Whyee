import type { CategoryDefinition } from '../types/category';
import type { NotificationRequestSpec } from './notificationSchedule';

export interface NotificationResponseData {
  categoryId: string;
  requestId?: string;
  actionIdentifier?: string;
  userText?: string;
}

export interface NotificationService {
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
  requestPermission: async () => false,
  scheduleCategory: async () => [],
  cancelCategory: async () => undefined,
  addResponseListener: () => ({ remove: () => undefined }),
  getLastResponse: async () => null,
};
