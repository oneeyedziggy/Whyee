// The un-suffixed modules are shadowed by platform variants on every Jest project, so load them
// by explicit path to exercise the type-checking fallbacks.
import type * as NotificationServiceModule from '../src/lib/notificationService';
import type * as DataTransferFileModule from '../src/lib/dataTransferFile';
import type * as SystemTimeFieldModule from '../src/components/SystemTimeField';

const { notificationService } = jest.requireActual(
  '../src/lib/notificationService.ts',
) as typeof NotificationServiceModule;
const { pickTransferFile, saveTransferArchives } = jest.requireActual(
  '../src/lib/dataTransferFile.ts',
) as typeof DataTransferFileModule;
const { SystemTimeField } = jest.requireActual(
  '../src/components/SystemTimeField.tsx',
) as typeof SystemTimeFieldModule;

describe('platform fallback modules', () => {
  it('notification service reports unavailable and no-ops', async () => {
    await expect(notificationService.checkAvailability()).resolves.toBe(false);
    await expect(notificationService.requestPermission()).resolves.toBe(false);
    await expect(notificationService.scheduleCategory({} as never, [])).resolves.toEqual([]);
    await expect(notificationService.cancelCategory('x')).resolves.toBeUndefined();
    expect(notificationService.addResponseListener(jest.fn()).remove()).toBeUndefined();
    await expect(notificationService.getLastResponse()).resolves.toBeNull();
  });

  it('data transfer file helpers reject as unsupported', async () => {
    await expect(pickTransferFile()).rejects.toThrow(
      'Data transfer file picking is unavailable on this platform.',
    );
    await expect(saveTransferArchives([])).rejects.toThrow(
      'Data transfer file saving is unavailable on this platform.',
    );
  });

  it('SystemTimeField renders nothing', () => {
    expect(
      SystemTimeField({
        mode: 'time',
        value: new Date(),
        onChange: jest.fn(),
        accessibilityLabel: 'Time',
      }),
    ).toBeNull();
  });
});
