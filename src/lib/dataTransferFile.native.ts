import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { TransferArchive } from '../types/dataTransfer';
import type { SelectedTransferFile } from './dataTransferFile';

export const pickTransferFile =
  async (): Promise<SelectedTransferFile | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/json',
        'application/zip',
        'application/x-zip-compressed',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return {
      fileName: asset.name,
      bytes: await new File(asset.uri).bytes(),
    };
  };

const writeArchives = (
  directory: Directory,
  archives: TransferArchive[],
): void => {
  for (const archive of archives) {
    const file = directory.createFile(archive.fileName, archive.mimeType);
    file.write(archive.bytes);
  }
};

export const saveTransferArchives = async (
  archives: TransferArchive[],
): Promise<void> => {
  if (!archives.length) throw new Error('There are no files to export.');
  if (Platform.OS === 'android') {
    const directory = await Directory.pickDirectoryAsync();
    writeArchives(directory, archives);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('The system save sheet is unavailable on this device.');
  }
  for (const archive of archives) {
    const file = new File(Paths.cache, archive.fileName);
    file.create({ overwrite: true });
    file.write(archive.bytes);
    try {
      await Sharing.shareAsync(file.uri, {
        mimeType: archive.mimeType,
        UTI:
          archive.mimeType === 'application/zip'
            ? 'public.zip-archive'
            : 'public.json',
      });
    } finally {
      if (file.exists) file.delete();
    }
  }
};
