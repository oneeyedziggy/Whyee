import type { NotificationService } from '../src/lib/notificationService';
import type { CategoryDefinition } from '../src/types/category';
import { allowConsole } from '../jest.setup';

type ResponseLike = {
  actionIdentifier: string;
  userText?: string;
  notification: {
    request: { identifier: string; content: { data?: Record<string, unknown> } };
  };
};

const createNotificationsMock = () => ({
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DAILY: 'daily' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async (_identifier: string, _actions: unknown[]) => null),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async (): Promise<unknown> => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async (): Promise<unknown> => ({ granted: false })),
  scheduleNotificationAsync: jest.fn(async (request: { content: { data: { timeId: string } } }) =>
    `id-${request.content.data.timeId}`,
  ),
  getAllScheduledNotificationsAsync: jest.fn(async (): Promise<unknown[]> => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(
    (_listener: (response: ResponseLike) => void) => ({ remove: jest.fn() }),
  ),
  getLastNotificationResponseAsync: jest.fn(async (): Promise<ResponseLike | null> => null),
});

const loadService = (
  factory: () => unknown,
): NotificationService => {
  jest.resetModules();
  jest.doMock('expo-notifications', factory);
  return (
    require('../src/lib/notificationService.native') as {
      notificationService: NotificationService;
    }
  ).notificationService;
};

const withMock = () => {
  const mock = createNotificationsMock();
  return { mock, service: loadService(() => mock) };
};

const category = (overrides: Record<string, unknown>): CategoryDefinition =>
  ({ id: 'cat-1', name: 'Mood', kind: 'notes', ...overrides }) as unknown as CategoryDefinition;

const response = (
  data: Record<string, unknown> | undefined,
  actionIdentifier = 'expo.modules.notifications.actions.DEFAULT',
): ResponseLike => ({
  actionIdentifier,
  userText: 'hello',
  notification: { request: { identifier: 'req-1', content: { data } } },
});

const unsupported = /Notifications are unavailable in this build/;

afterEach(() => {
  jest.dontMock('expo-notifications');
});

describe('notificationService (native) when expo-notifications cannot load', () => {
  it('degrades every call to a no-op and warns once', async () => {
    allowConsole('warn', unsupported);
    const warn = jest.spyOn(console, 'warn');
    const service = loadService(() => {
      throw new Error('Expo Go unsupported');
    });

    await expect(service.checkAvailability()).resolves.toBe(false);
    await expect(service.requestPermission()).resolves.toBe(false);
    await expect(service.scheduleCategory(category({}), [{ timeId: 't', hour: 1, minute: 2 }])).resolves.toEqual([]);
    await expect(service.cancelCategory('cat-1')).resolves.toBeUndefined();
    const subscription = service.addResponseListener(jest.fn());
    expect(subscription.remove()).toBeUndefined();
    await expect(service.getLastResponse()).resolves.toBeNull();

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('treats a throwing handler registration as unavailable', async () => {
    allowConsole('warn', unsupported);
    const mock = createNotificationsMock();
    mock.setNotificationHandler.mockImplementation(() => {
      throw new Error('handler failed');
    });
    const service = loadService(() => mock);
    await expect(service.checkAvailability()).resolves.toBe(false);
  });
});

describe('notificationService (native) with expo-notifications available', () => {
  it('loads once and registers a foreground handler that shows banners', async () => {
    const { mock, service } = withMock();
    await expect(service.checkAvailability()).resolves.toBe(true);
    await expect(service.checkAvailability()).resolves.toBe(true);
    expect(mock.setNotificationHandler).toHaveBeenCalledTimes(1);
    const { handleNotification } = mock.setNotificationHandler.mock.calls[0][0] as {
      handleNotification: () => Promise<unknown>;
    };
    await expect(handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  describe('requestPermission', () => {
    it('creates the Android channel and returns true when already granted', async () => {
      const { mock, service } = withMock();
      mock.getPermissionsAsync.mockResolvedValue({ granted: true });
      await expect(service.requestPermission()).resolves.toBe(true);
      expect(mock.setNotificationChannelAsync).toHaveBeenCalledWith(
        'category-reminders',
        expect.objectContaining({ importance: 4, sound: 'default' }),
      );
      expect(mock.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('accepts existing iOS provisional authorization', async () => {
      const { mock, service } = withMock();
      mock.getPermissionsAsync.mockResolvedValue({ granted: false, ios: { status: 3 } });
      await expect(service.requestPermission()).resolves.toBe(true);
      expect(mock.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('prompts when undetermined and returns the granted result', async () => {
      const { mock, service } = withMock();
      mock.getPermissionsAsync.mockResolvedValue({ granted: false, ios: { status: 0 } });
      mock.requestPermissionsAsync.mockResolvedValue({ granted: true });
      await expect(service.requestPermission()).resolves.toBe(true);
    });

    it('accepts provisional authorization from the prompt', async () => {
      const { mock, service } = withMock();
      mock.requestPermissionsAsync.mockResolvedValue({ granted: false, ios: { status: 3 } });
      await expect(service.requestPermission()).resolves.toBe(true);
    });

    it('returns false when the user denies permission', async () => {
      const { mock, service } = withMock();
      mock.requestPermissionsAsync.mockResolvedValue({ granted: false, ios: { status: 1 } });
      await expect(service.requestPermission()).resolves.toBe(false);
      mock.requestPermissionsAsync.mockResolvedValue({ granted: false });
      await expect(service.requestPermission()).resolves.toBe(false);
    });

    it('returns false and warns once when the native call throws', async () => {
      allowConsole('warn', unsupported);
      const warn = jest.spyOn(console, 'warn');
      const { mock, service } = withMock();
      mock.setNotificationChannelAsync.mockRejectedValue(new Error('no channel'));
      await expect(service.requestPermission()).resolves.toBe(false);
      await expect(service.requestPermission()).resolves.toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });

  describe('scheduleCategory', () => {
    it('registers choice actions and schedules weekly and daily triggers', async () => {
      const { mock, service } = withMock();
      const choice = category({
        id: 'my cat!',
        kind: 'multiple-choice',
        multiSelect: false,
        options: ['A', 'B', 'C', 'D'].map((label, index) => ({ id: label, label, value: index })),
      });
      const ids = await service.scheduleCategory(choice, [
        { timeId: 'w', hour: 8, minute: 30, weekday: 2 },
        { timeId: 'd', hour: 20, minute: 0 },
      ]);
      expect(ids).toEqual(['id-w', 'id-d']);
      const [identifier, actions] = mock.setNotificationCategoryAsync.mock.calls[0] as unknown as [
        string,
        Array<{ identifier: string; buttonTitle: string }>,
      ];
      expect(identifier).toBe('category_entry_my_cat_');
      expect(actions.map((action) => action.buttonTitle)).toEqual(['A', 'B', 'C']);
      const requests = mock.scheduleNotificationAsync.mock.calls.map((call) => call[0]) as unknown as Array<{
        content: { title: string; categoryIdentifier: string };
        trigger: Record<string, unknown>;
      }>;
      expect(requests[0].content).toEqual(
        expect.objectContaining({ title: 'Enter Mood', categoryIdentifier: 'category_entry_my_cat_' }),
      );
      expect(requests[0].trigger).toEqual({
        type: 'weekly',
        weekday: 2,
        hour: 8,
        minute: 30,
        channelId: 'category-reminders',
      });
      expect(requests[1].trigger).toEqual({
        type: 'daily',
        hour: 20,
        minute: 0,
        channelId: 'category-reminders',
      });
    });

    it.each([
      [
        'counter steps',
        { kind: 'counter', counter: { steps: [1, -2, 5, 10] } },
        ['+1', '-2', '+5'],
      ],
      ['number text input', { kind: 'number' }, ['Enter']],
      ['notes text input', { kind: 'notes' }, ['Enter']],
      ['event-time log action', { kind: 'event-time' }, ['Log now']],
      ['multi-select choice (no actions)', { kind: 'multiple-choice', multiSelect: true, options: [] }, []],
      ['duration (no actions)', { kind: 'duration' }, []],
    ])('registers %s', async (_label, overrides, titles) => {
      const { mock, service } = withMock();
      await service.scheduleCategory(category(overrides), []);
      const actions = mock.setNotificationCategoryAsync.mock.calls[0][1] as unknown as Array<{
        buttonTitle: string;
        textInput?: { placeholder: string };
      }>;
      expect(actions.map((action) => action.buttonTitle)).toEqual(titles);
      if (overrides.kind === 'number') {
        expect(actions[0].textInput?.placeholder).toBe('Enter a number');
      }
      if (overrides.kind === 'notes') {
        expect(actions[0].textInput?.placeholder).toBe('Write a note');
      }
    });

    it('still schedules when category registration fails', async () => {
      allowConsole('warn', unsupported);
      const { mock, service } = withMock();
      mock.setNotificationCategoryAsync.mockRejectedValue(new Error('no categories'));
      await expect(
        service.scheduleCategory(category({}), [{ timeId: 'd', hour: 1, minute: 0 }]),
      ).resolves.toEqual(['id-d']);
    });

    it('propagates scheduling failures to the caller', async () => {
      const { mock, service } = withMock();
      mock.scheduleNotificationAsync.mockRejectedValue(new Error('schedule failed'));
      await expect(
        service.scheduleCategory(category({}), [{ timeId: 'd', hour: 1, minute: 0 }]),
      ).rejects.toThrow('schedule failed');
    });
  });

  describe('cancelCategory', () => {
    it('cancels only notifications belonging to the category', async () => {
      const { mock, service } = withMock();
      mock.getAllScheduledNotificationsAsync.mockResolvedValue([
        { identifier: 'a', content: { data: { categoryId: 'cat-1' } } },
        { identifier: 'b', content: { data: { categoryId: 'other' } } },
        { identifier: 'c', content: {} },
        { identifier: 'd', content: { data: { categoryId: 'cat-1' } } },
      ]);
      await service.cancelCategory('cat-1');
      expect(mock.cancelScheduledNotificationAsync.mock.calls).toEqual([['a'], ['d']]);
    });

    it('swallows and warns on cancellation failure', async () => {
      allowConsole('warn', unsupported);
      const { mock, service } = withMock();
      mock.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('cancel failed'));
      await expect(service.cancelCategory('cat-1')).resolves.toBeUndefined();
    });
  });

  describe('responses', () => {
    it('forwards only category reminder responses to the listener', () => {
      const { mock, service } = withMock();
      const listener = jest.fn();
      const subscription = service.addResponseListener(listener);
      const nativeListener = mock.addNotificationResponseReceivedListener.mock.calls[0][0];

      nativeListener(response(undefined));
      nativeListener(response({ source: 'other', categoryId: 'cat-1' }));
      nativeListener(response({ source: 'category-reminder', categoryId: 7 }));
      expect(listener).not.toHaveBeenCalled();

      nativeListener(response({ source: 'category-reminder', categoryId: 'cat-1' }));
      nativeListener(response({ source: 'category-reminder', categoryId: 'cat-1' }, 'text'));
      expect(listener.mock.calls).toEqual([
        [
          {
            categoryId: 'cat-1',
            requestId: 'req-1',
            actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
            userText: 'hello',
            isDefaultTap: true,
          },
        ],
        [expect.objectContaining({ actionIdentifier: 'text', isDefaultTap: false })],
      ]);
      expect(subscription).toBe(
        mock.addNotificationResponseReceivedListener.mock.results[0].value,
      );
    });

    it('returns a no-op subscription when adding the listener throws', () => {
      allowConsole('warn', unsupported);
      const { mock, service } = withMock();
      mock.addNotificationResponseReceivedListener.mockImplementation(() => {
        throw new Error('listener failed');
      });
      expect(service.addResponseListener(jest.fn()).remove()).toBeUndefined();
    });

    it('returns null when there is no last response', async () => {
      const { service } = withMock();
      await expect(service.getLastResponse()).resolves.toBeNull();
    });

    it('maps the last response when present', async () => {
      const { mock, service } = withMock();
      mock.getLastNotificationResponseAsync.mockResolvedValue(
        response({ source: 'category-reminder', categoryId: 'cat-9' }, 'step:0'),
      );
      await expect(service.getLastResponse()).resolves.toEqual(
        expect.objectContaining({ categoryId: 'cat-9', actionIdentifier: 'step:0', isDefaultTap: false }),
      );
    });

    it('returns null when reading the last response fails', async () => {
      allowConsole('warn', unsupported);
      const { mock, service } = withMock();
      mock.getLastNotificationResponseAsync.mockRejectedValue(new Error('read failed'));
      await expect(service.getLastResponse()).resolves.toBeNull();
    });
  });
});
