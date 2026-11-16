import type { NotificationService } from './notificationService';

export const notificationService: NotificationService = {
  checkAvailability: async () => false,
  requestPermission: async () => false,
  scheduleCategory: async () => [],
  cancelCategory: async () => undefined,
  addResponseListener: () => ({ remove: () => undefined }),
  getLastResponse: async () => null,
};
