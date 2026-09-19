import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

const prefix = 'correlation.mobile.v1.';
export const persistentStatePrefix = prefix;

export const usePersistentState = <T>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, boolean] => {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const writeEnabled = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(`${prefix}${key}`)
      .then((rawValue) => {
        if (active && rawValue) setValue(JSON.parse(rawValue) as T);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          writeEnabled.current = true;
          setHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (writeEnabled.current)
      AsyncStorage.setItem(`${prefix}${key}`, JSON.stringify(value)).catch(
        () => undefined,
      );
  }, [key, value]);

  return [value, setValue, hydrated];
};
