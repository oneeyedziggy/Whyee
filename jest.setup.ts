type ConsoleMethod = 'error' | 'warn';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.structuredClone !== 'function') {
  // jsdom (web project) does not expose Node's structuredClone.
  const v8 = require('v8') as {
    serialize: (value: unknown) => unknown;
    deserialize: (buffer: unknown) => unknown;
  };
  globalThis.structuredClone = (<T>(value: T): T =>
    v8.deserialize(v8.serialize(value)) as T) as typeof structuredClone;
}

if (typeof globalThis.crypto?.randomUUID !== 'function') {
  // jsdom's crypto lacks randomUUID, which expo-crypto uses on web.
  const { webcrypto } = require('crypto') as { webcrypto: Crypto };
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// jest-expo's generated native mock for expo-crypto returns undefined from
// randomUUID, which makes every createId() collide (e.g. `choice-undefined`).
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => (require('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const allowedConsolePatterns: Array<{ method: ConsoleMethod; pattern: RegExp }> = [];
const unexpectedConsoleCalls: string[] = [];
const originalConsole = { error: console.error, warn: console.warn };

/** Allow a matching console message for the current test only. */
export const allowConsole = (method: ConsoleMethod, pattern: RegExp) => {
  allowedConsolePatterns.push({ method, pattern });
};

const formatArgs = (args: unknown[]) =>
  args
    .map((arg) => (arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : String(arg)))
    .join(' ');

(['error', 'warn'] as const).forEach((method) => {
  console[method] = (...args: unknown[]) => {
    const message = formatArgs(args);
    const allowed = allowedConsolePatterns.some(
      (entry) => entry.method === method && entry.pattern.test(message),
    );
    if (!allowed) {
      unexpectedConsoleCalls.push(`console.${method}: ${message}`);
      originalConsole[method](...args);
    }
  };
});

beforeEach(() => {
  allowedConsolePatterns.length = 0;
});

afterEach(() => {
  if (unexpectedConsoleCalls.length > 0) {
    const calls = unexpectedConsoleCalls.splice(0);
    throw new Error(`Unexpected console output:\n${calls.join('\n')}`);
  }
});
