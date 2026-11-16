import { act, renderHook, waitFor } from '@testing-library/react-native';
import { allowConsole } from '../jest.setup';
import { useNotificationSync } from '../src/hooks/useNotificationSync';
import { applyNotificationResponse } from '../src/lib/notificationEntry';
import { expandNotificationSchedule } from '../src/lib/notificationSchedule';
import {
  notificationService,
  type NotificationResponseData,
} from '../src/lib/notificationService';
import type {
  CategoryDefinition,
  CategorySelectionRecord,
} from '../src/types/category';

jest.mock('../src/lib/notificationService', () => ({
  notificationService: {
    checkAvailability: jest.fn(),
    requestPermission: jest.fn(),
    scheduleCategory: jest.fn(),
    cancelCategory: jest.fn(),
    addResponseListener: jest.fn(),
    getLastResponse: jest.fn(),
  },
}));
jest.mock('../src/lib/notificationSchedule', () => ({
  expandNotificationSchedule: jest.fn(),
}));
jest.mock('../src/lib/notificationEntry', () => ({
  applyNotificationResponse: jest.fn(),
}));
jest.mock('../src/lib/dates', () => ({
  ...jest.requireActual('../src/lib/dates'),
  getLocalDateKey: () => '2026-11-16',
}));

const service = jest.mocked(notificationService);
const expand = jest.mocked(expandNotificationSchedule);
const applyResponse = jest.mocked(applyNotificationResponse);

type Records = Record<string, Record<string, CategorySelectionRecord>>;
type Args = Parameters<typeof useNotificationSync>[0];

const category = (
  id: string,
  extra: Record<string, unknown> = {},
): CategoryDefinition =>
  ({
    id,
    name: id,
    kind: 'number',
    enabled: true,
    notificationSchedule: { enabled: true, times: [id] },
    ...extra,
  }) as unknown as CategoryDefinition;

const record = (
  key: string,
  categoryId: string,
  dateKey: string,
): CategorySelectionRecord =>
  ({ key, categoryId, dateKey, ordinal: 0, localTime: '09:00:00', value: 1 }) as
    CategorySelectionRecord;

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const flushFrames = () =>
  act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });

let listener: ((response: NotificationResponseData) => void) | undefined;
const remove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  frames.clear();
  listener = undefined;
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id as number);
  });
  service.checkAvailability.mockResolvedValue(true);
  service.cancelCategory.mockResolvedValue(undefined);
  service.scheduleCategory.mockResolvedValue(['scheduled']);
  service.getLastResponse.mockResolvedValue(null);
  service.addResponseListener.mockImplementation((next) => {
    listener = next;
    return { remove };
  });
  expand.mockImplementation(
    (schedule) =>
      (schedule as unknown as { times: string[] }).times.map((time) => ({
        time,
      })) as unknown as ReturnType<typeof expandNotificationSchedule>,
  );
});

afterEach(() => jest.restoreAllMocks());

const makeArgs = (overrides: Partial<Args> = {}): Args => ({
  hydrated: true,
  categoriesByWorkspace: {},
  recordsByWorkspace: {},
  setRecordsByWorkspace: jest.fn(),
  setActiveWorkspaceId: jest.fn(),
  setSelectedDate: jest.fn(),
  setSelectedCategoryId: jest.fn(),
  setPage: jest.fn(),
  scrollToCategory: jest.fn(),
  activeWorkspaceId: 'user',
  selectedDateKey: '2026-11-16',
  ...overrides,
});

const renderSync = async (initial: Args) => {
  const rendered = await renderHook((props: Args) => useNotificationSync(props), {
    initialProps: initial,
  });
  // Let the mount-time getLastResponse/reconcile promises settle inside act.
  await act(async () => undefined);
  return rendered;
};

describe('reconciling scheduled notifications', () => {
  it('waits for hydration, then reschedules enabled categories exactly once', async () => {
    const enabled = category('enabled');
    const noTimes = category('no-times', {
      notificationSchedule: { enabled: true, times: [] },
    });
    const categoriesByWorkspace = {
      user: [
        enabled,
        category('disabled', { enabled: false }),
        category('unscheduled', { notificationSchedule: undefined }),
        category('paused', { notificationSchedule: { enabled: false, times: ['x'] } }),
      ],
      work: [noTimes],
    };
    const args = makeArgs({ hydrated: false, categoriesByWorkspace });
    const { rerender } = await renderSync(args);
    expect(service.checkAvailability).not.toHaveBeenCalled();

    await rerender({ ...args, hydrated: true });
    await waitFor(() => expect(service.cancelCategory).toHaveBeenCalledTimes(2));

    expect(service.cancelCategory.mock.calls).toEqual([['enabled'], ['no-times']]);
    expect(service.scheduleCategory).toHaveBeenCalledTimes(1);
    expect(service.scheduleCategory).toHaveBeenCalledWith(enabled, [{ time: 'enabled' }]);

    await rerender({ ...args, hydrated: true, categoriesByWorkspace: { ...categoriesByWorkspace } });
    await act(async () => undefined);
    expect(service.checkAvailability).toHaveBeenCalledTimes(1);
  });

  it('does nothing when notifications are unavailable or permission is denied', async () => {
    service.checkAvailability.mockResolvedValue(false);

    await renderSync(makeArgs({ categoriesByWorkspace: { user: [category('a')] } }));

    expect(service.checkAvailability).toHaveBeenCalledTimes(1);
    expect(service.cancelCategory).not.toHaveBeenCalled();
    expect(service.scheduleCategory).not.toHaveBeenCalled();
  });

  it('warns about a failing category and keeps reconciling the rest', async () => {
    allowConsole('warn', /Failed to reconcile notifications for category broken/);
    const warn = jest.spyOn(console, 'warn');
    service.scheduleCategory.mockRejectedValueOnce(new Error('denied'));
    const healthy = category('healthy');

    await renderSync(
      makeArgs({ categoriesByWorkspace: { user: [category('broken'), healthy] } }),
    );

    await waitFor(() => expect(service.scheduleCategory).toHaveBeenCalledTimes(2));
    expect(service.scheduleCategory).toHaveBeenLastCalledWith(healthy, [{ time: 'healthy' }]);
    expect(warn).toHaveBeenCalledWith(
      'Failed to reconcile notifications for category broken',
      expect.objectContaining({ message: 'denied' }),
    );
  });
});

describe('handling notification responses', () => {
  const mood = category('mood');
  const categoriesByWorkspace = { user: [category('other')], work: [mood] };
  const created = record('new-entry', 'mood', '2026-11-16');

  it('records an action response in the owning workspace and focuses the category', async () => {
    applyResponse.mockReturnValue({ kind: 'created', entry: created });
    const todays = record('today', 'mood', '2026-11-16');
    const args = makeArgs({
      categoriesByWorkspace,
      recordsByWorkspace: {
        work: {
          today: todays,
          yesterday: record('yesterday', 'mood', '2026-11-15'),
          otherCategory: record('otherCategory', 'other', '2026-11-16'),
        },
      },
    });
    await renderSync(args);

    await act(async () =>
      listener!({ categoryId: 'mood', requestId: 'r1', actionIdentifier: 'step:0', userText: 'hi' }),
    );

    expect(applyResponse).toHaveBeenCalledWith(mood, [todays], {
      actionIdentifier: 'step:0',
      userText: 'hi',
    });
    const updater = jest.mocked(args.setRecordsByWorkspace).mock.calls[0][0] as (
      current: Records,
    ) => Records;
    const existing = record('kept', 'mood', '2026-11-01');
    expect(updater({ user: {}, work: { kept: existing } })).toEqual({
      user: {},
      work: { kept: existing, 'new-entry': created },
    });
    expect(updater({})).toEqual({ work: { 'new-entry': created } });
    expect(args.setActiveWorkspaceId).toHaveBeenCalledWith('work');
    expect(args.setSelectedDate).toHaveBeenCalledWith(expect.any(Date));
    expect(args.setSelectedCategoryId).toHaveBeenCalledWith('mood');
    expect(args.setPage).toHaveBeenCalledWith('daily');

    expect(args.scrollToCategory).not.toHaveBeenCalled();
    await flushFrames();
    expect(args.scrollToCategory).toHaveBeenCalledWith('mood');
    await flushFrames();
    expect(args.scrollToCategory).toHaveBeenCalledTimes(1);
  });

  it('uses an empty history for workspaces without records and skips invalid responses', async () => {
    applyResponse.mockReturnValue({ kind: 'invalid', reason: 'bad' });
    const args = makeArgs({ categoriesByWorkspace });
    await renderSync(args);

    await act(async () => listener!({ categoryId: 'mood', userText: 'abc' }));

    expect(applyResponse).toHaveBeenCalledWith(mood, [], {
      actionIdentifier: undefined,
      userText: 'abc',
    });
    expect(args.setRecordsByWorkspace).not.toHaveBeenCalled();
    expect(args.setSelectedCategoryId).toHaveBeenCalledWith('mood');
  });

  it('only navigates for a default tap', async () => {
    const args = makeArgs({ categoriesByWorkspace });
    await renderSync(args);

    await act(async () => listener!({ categoryId: 'other', isDefaultTap: true }));

    expect(applyResponse).not.toHaveBeenCalled();
    expect(args.setRecordsByWorkspace).not.toHaveBeenCalled();
    expect(args.setActiveWorkspaceId).toHaveBeenCalledWith('user');
    expect(args.setPage).toHaveBeenCalledWith('daily');
  });

  it('ignores responses for unknown categories and duplicate request ids', async () => {
    applyResponse.mockReturnValue({ kind: 'created', entry: created });
    const args = makeArgs({ categoriesByWorkspace });
    await renderSync(args);

    await act(async () => listener!({ categoryId: 'deleted', requestId: 'gone' }));
    expect(args.setPage).not.toHaveBeenCalled();

    await act(async () => listener!({ categoryId: 'mood', requestId: 'dup', isDefaultTap: true }));
    await act(async () => listener!({ categoryId: 'mood', requestId: 'dup', isDefaultTap: true }));
    expect(args.setPage).toHaveBeenCalledTimes(1);
  });

  it('handles the launch response once even when the listener delivers it too', async () => {
    service.getLastResponse.mockResolvedValue({
      categoryId: 'mood',
      requestId: 'launch',
      isDefaultTap: true,
    });
    const args = makeArgs({ categoriesByWorkspace });
    await renderSync(args);

    expect(args.setSelectedCategoryId).toHaveBeenCalledWith('mood');
    await act(async () =>
      listener!({ categoryId: 'mood', requestId: 'launch', isDefaultTap: true }),
    );
    expect(args.setSelectedCategoryId).toHaveBeenCalledTimes(1);
  });

  it('uses the latest props in the long-lived listener', async () => {
    const args = makeArgs();
    const { rerender } = await renderSync(args);

    await act(async () => listener!({ categoryId: 'mood', isDefaultTap: true }));
    expect(args.setPage).not.toHaveBeenCalled();

    await rerender({ ...args, categoriesByWorkspace });
    await act(async () => listener!({ categoryId: 'mood', isDefaultTap: true }));
    expect(args.setPage).toHaveBeenCalledWith('daily');
    expect(service.addResponseListener).toHaveBeenCalledTimes(1);
  });

  it('re-schedules the pending focus when the visible day changes', async () => {
    const args = makeArgs({ categoriesByWorkspace });
    const { rerender } = await renderSync(args);
    await act(async () => listener!({ categoryId: 'mood', isDefaultTap: true }));
    expect(frames.size).toBe(1);

    await rerender({ ...args, selectedDateKey: '2026-11-17' });

    expect(frames.size).toBe(1);
    await flushFrames();
    expect(args.scrollToCategory).toHaveBeenCalledTimes(1);
  });

  it('removes the listener, cancels pending focus, and ignores a late launch response after unmount', async () => {
    let resolveLast: (value: NotificationResponseData | null) => void = () => undefined;
    service.getLastResponse.mockImplementation(
      () => new Promise((resolve) => (resolveLast = resolve)),
    );
    const args = makeArgs({ categoriesByWorkspace });
    const { unmount } = await renderSync(args);
    await act(async () => listener!({ categoryId: 'mood', isDefaultTap: true }));
    expect(frames.size).toBe(1);

    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    await act(async () =>
      resolveLast({ categoryId: 'other', requestId: 'late', isDefaultTap: true }),
    );
    expect(args.setActiveWorkspaceId).toHaveBeenCalledTimes(1);
    expect(args.setActiveWorkspaceId).not.toHaveBeenCalledWith('user');
  });
});
