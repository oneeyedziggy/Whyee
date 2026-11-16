import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  pickTransferFile,
  saveTransferArchives,
} from '../src/lib/dataTransferFile.native';
import type { TransferArchive } from '../src/types/dataTransfer';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => {
  const created: unknown[] = [];
  class MockFile {
    static created = created;
    static bytesImpl = jest.fn(async (_uri: string): Promise<Uint8Array> => new Uint8Array());
    uri: string;
    exists = false;
    written: Uint8Array | undefined;
    create = jest.fn(() => {
      this.exists = true;
    });
    write = jest.fn((bytes: Uint8Array) => {
      this.written = bytes;
    });
    delete = jest.fn(() => {
      this.exists = false;
    });
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = typeof base === 'string' ? base : `${base.uri}/${name}`;
      created.push(this);
    }
    bytes() {
      return MockFile.bytesImpl(this.uri);
    }
  }
  return {
    File: MockFile,
    Directory: { pickDirectoryAsync: jest.fn() },
    Paths: { cache: { uri: 'file:///cache' } },
  };
});

type MockFileInstance = {
  uri: string;
  exists: boolean;
  written?: Uint8Array;
  create: jest.Mock;
  delete: jest.Mock;
};
const MockFile = File as unknown as {
  created: MockFileInstance[];
  bytesImpl: jest.Mock;
};
const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;
const isAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const shareAsync = Sharing.shareAsync as jest.Mock;
const pickDirectoryAsync = Directory.pickDirectoryAsync as unknown as jest.Mock;

const archives: TransferArchive[] = [
  { fileName: 'data.zip', mimeType: 'application/zip', bytes: new Uint8Array([1, 2]) },
  { fileName: 'data.json', mimeType: 'application/json', bytes: new Uint8Array([3]) },
];

let platform: jest.ReplaceProperty<typeof Platform.OS> | undefined;
const setOS = (os: 'ios' | 'android') => {
  platform = jest.replaceProperty(Platform, 'OS', os);
};

beforeEach(() => {
  MockFile.created.length = 0;
  jest.clearAllMocks();
});

afterEach(() => {
  platform?.restore();
  platform = undefined;
});

describe('pickTransferFile (native)', () => {
  it('returns null when the picker is cancelled', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickTransferFile()).resolves.toBeNull();
    expect(getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ copyToCacheDirectory: true, multiple: false }),
    );
  });

  it('reads the picked file bytes', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'backup.zip', uri: 'file:///picked/backup.zip' }],
    });
    MockFile.bytesImpl.mockResolvedValueOnce(new Uint8Array([9, 8]));
    await expect(pickTransferFile()).resolves.toEqual({
      fileName: 'backup.zip',
      bytes: new Uint8Array([9, 8]),
    });
    expect(MockFile.bytesImpl).toHaveBeenCalledWith('file:///picked/backup.zip');
  });

  it('propagates read errors', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: 'x.json', uri: 'file:///x.json' }],
    });
    MockFile.bytesImpl.mockRejectedValueOnce(new Error('read failed'));
    await expect(pickTransferFile()).rejects.toThrow('read failed');
  });
});

describe('saveTransferArchives (native)', () => {
  it('rejects an empty archive list', async () => {
    await expect(saveTransferArchives([])).rejects.toThrow('There are no files to export.');
  });

  it('writes every archive into a picked directory on Android', async () => {
    setOS('android');
    const files: Array<{ name: string; mime: string; write: jest.Mock }> = [];
    pickDirectoryAsync.mockResolvedValue({
      createFile: (name: string, mime: string) => {
        const file = { name, mime, write: jest.fn() };
        files.push(file);
        return file;
      },
    });
    await saveTransferArchives(archives);
    expect(files.map(({ name, mime }) => [name, mime])).toEqual([
      ['data.zip', 'application/zip'],
      ['data.json', 'application/json'],
    ]);
    expect(files[0].write).toHaveBeenCalledWith(archives[0].bytes);
    expect(isAvailableAsync).not.toHaveBeenCalled();
  });

  it('propagates a cancelled Android directory picker', async () => {
    setOS('android');
    pickDirectoryAsync.mockRejectedValue(new Error('cancelled'));
    await expect(saveTransferArchives(archives)).rejects.toThrow('cancelled');
  });

  it('fails when sharing is unavailable on iOS', async () => {
    setOS('ios');
    isAvailableAsync.mockResolvedValue(false);
    await expect(saveTransferArchives(archives)).rejects.toThrow(
      'The system save sheet is unavailable on this device.',
    );
    expect(MockFile.created).toHaveLength(0);
  });

  it('shares each archive with its UTI and cleans up the cache file', async () => {
    setOS('ios');
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockResolvedValue(undefined);
    await saveTransferArchives(archives);
    expect(shareAsync.mock.calls).toEqual([
      ['file:///cache/data.zip', { mimeType: 'application/zip', UTI: 'public.zip-archive' }],
      ['file:///cache/data.json', { mimeType: 'application/json', UTI: 'public.json' }],
    ]);
    expect(MockFile.created.map((file) => file.written)).toEqual([
      archives[0].bytes,
      archives[1].bytes,
    ]);
    MockFile.created.forEach((file) => {
      expect(file.create).toHaveBeenCalledWith({ overwrite: true });
      expect(file.delete).toHaveBeenCalledTimes(1);
    });
  });

  it('deletes the cache file even when sharing fails', async () => {
    setOS('ios');
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockRejectedValue(new Error('share failed'));
    await expect(saveTransferArchives(archives)).rejects.toThrow('share failed');
    expect(MockFile.created).toHaveLength(1);
    expect(MockFile.created[0].delete).toHaveBeenCalledTimes(1);
  });

  it('skips deletion when the share sheet already removed the file', async () => {
    setOS('ios');
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockImplementation(async () => {
      MockFile.created[MockFile.created.length - 1].exists = false;
    });
    await saveTransferArchives([archives[1]]);
    expect(MockFile.created[0].delete).not.toHaveBeenCalled();
  });
});
