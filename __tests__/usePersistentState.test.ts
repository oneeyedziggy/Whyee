import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  persistentStatePrefix,
  usePersistentState,
} from '../src/hooks/usePersistentState';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const storageKey = (key: string) => `${persistentStatePrefix}${key}`;
const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

it('hydrates from storage and persists later updates, including updater functions', async () => {
  await AsyncStorage.setItem(storageKey('count'), JSON.stringify(5));
  setItem.mockClear();
  const { result } = await renderHook(() => usePersistentState('count', 0));

  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0]).toBe(5);

  await act(async () => result.current[1]((current) => current + 2));

  expect(result.current[0]).toBe(7);
  await waitFor(() =>
    expect(setItem).toHaveBeenLastCalledWith(storageKey('count'), '7'),
  );
  expect(JSON.parse((await AsyncStorage.getItem(storageKey('count')))!)).toBe(7);
});

it('keeps the lazy initial value when nothing is stored and never writes before hydration', async () => {
  let resolveLoad: (value: string | null) => void = () => undefined;
  getItem.mockImplementationOnce(
    () => new Promise((resolve) => (resolveLoad = resolve)),
  );
  const { result } = await renderHook(() =>
    usePersistentState('list', () => ['seed']),
  );

  expect(result.current[0]).toEqual(['seed']);
  expect(result.current[2]).toBe(false);
  await act(async () => result.current[1](['early']));
  expect(setItem).not.toHaveBeenCalled();

  await act(async () => resolveLoad(null));

  expect(result.current[2]).toBe(true);
  expect(result.current[0]).toEqual(['early']);
  await act(async () => result.current[1](['late']));
  expect(setItem).toHaveBeenLastCalledWith(
    storageKey('list'),
    JSON.stringify(['late']),
  );
});

it('falls back to the initial value when loading fails', async () => {
  getItem.mockRejectedValueOnce(new Error('disk unavailable'));
  const { result } = await renderHook(() => usePersistentState('flag', true));

  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0]).toBe(true);
});

it('treats corrupt JSON as a failed load and keeps the initial value', async () => {
  getItem.mockResolvedValueOnce('{not json');
  const { result } = await renderHook(() =>
    usePersistentState('settings', { theme: 'light' }),
  );

  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0]).toEqual({ theme: 'light' });
});

it('swallows save failures without losing in-memory state', async () => {
  const { result } = await renderHook(() => usePersistentState('name', 'a'));
  await waitFor(() => expect(result.current[2]).toBe(true));
  setItem.mockRejectedValueOnce(new Error('quota exceeded'));

  await act(async () => result.current[1]('b'));

  expect(setItem).toHaveBeenLastCalledWith(storageKey('name'), '"b"');
  expect(result.current[0]).toBe('b');
});

it('ignores a load that finishes after unmount', async () => {
  let resolveLoad: (value: string | null) => void = () => undefined;
  getItem.mockImplementationOnce(
    () => new Promise((resolve) => (resolveLoad = resolve)),
  );
  const { result, unmount } = await renderHook(() =>
    usePersistentState('late', 1),
  );
  await unmount();

  await act(async () => resolveLoad('42'));

  expect(result.current[0]).toBe(1);
  expect(result.current[2]).toBe(false);
  expect(setItem).not.toHaveBeenCalled();
});
