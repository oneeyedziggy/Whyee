import * as DocumentPicker from 'expo-document-picker';
import {
  pickTransferFile,
  saveTransferArchives,
} from '../src/lib/dataTransferFile.web';
import { notificationService } from '../src/lib/notificationService.web';
import type { TransferArchive } from '../src/types/dataTransfer';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;

describe('pickTransferFile (web)', () => {
  it('returns null when the browser picker is cancelled', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickTransferFile()).resolves.toBeNull();
    expect(getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, base64: false }),
    );
  });

  it('reads the selected File into bytes', async () => {
    const file = {
      arrayBuffer: jest.fn(async () => new Uint8Array([4, 5, 6]).buffer),
    };
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'backup.json', uri: 'blob:x', file }],
    });
    await expect(pickTransferFile()).resolves.toEqual({
      fileName: 'backup.json',
      bytes: new Uint8Array([4, 5, 6]),
    });
  });

  it('fails when the browser does not expose the File', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'backup.json', uri: 'blob:x' }],
    });
    await expect(pickTransferFile()).rejects.toThrow(
      'The browser did not provide the selected file.',
    );
  });

  it('propagates file read errors', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: 'backup.zip',
          uri: 'blob:x',
          file: { arrayBuffer: async () => Promise.reject(new Error('read failed')) },
        },
      ],
    });
    await expect(pickTransferFile()).rejects.toThrow('read failed');
  });
});

describe('saveTransferArchives (web)', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;

  beforeEach(() => {
    let counter = 0;
    createObjectURL = jest.fn(() => `blob:url-${++counter}`);
    revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    Object.assign(URL, { createObjectURL: originalCreate, revokeObjectURL: originalRevoke });
    jest.restoreAllMocks();
  });

  it('rejects an empty archive list', async () => {
    await expect(saveTransferArchives([])).rejects.toThrow('There are no files to export.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('downloads each archive through a temporary hidden link', async () => {
    const clicked: Array<{ href: string; download: string; display: string; attached: boolean }> = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({
        href: this.href,
        download: this.download,
        display: this.style.display,
        attached: document.body.contains(this),
      });
    });
    const source = new Uint8Array([0, 1, 2, 3]).subarray(1, 3);
    const archives: TransferArchive[] = [
      { fileName: 'a.zip', mimeType: 'application/zip', bytes: source },
      { fileName: 'b.json', mimeType: 'application/json', bytes: new Uint8Array([7]) },
    ];

    await saveTransferArchives(archives);

    expect(clicked).toEqual([
      { href: 'blob:url-1', download: 'a.zip', display: 'none', attached: true },
      { href: 'blob:url-2', download: 'b.json', display: 'none', attached: true },
    ]);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/zip');
    // Only the archive's own view is written, not the whole backing buffer.
    expect(blob.size).toBe(2);
    expect(revokeObjectURL.mock.calls).toEqual([['blob:url-1'], ['blob:url-2']]);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('notificationService (web)', () => {
  it('reports notifications as unavailable and no-ops every call', async () => {
    await expect(notificationService.checkAvailability()).resolves.toBe(false);
    await expect(notificationService.requestPermission()).resolves.toBe(false);
    await expect(notificationService.scheduleCategory({} as never, [])).resolves.toEqual([]);
    await expect(notificationService.cancelCategory('x')).resolves.toBeUndefined();
    expect(notificationService.addResponseListener(jest.fn()).remove()).toBeUndefined();
    await expect(notificationService.getLastResponse()).resolves.toBeNull();
  });
});
