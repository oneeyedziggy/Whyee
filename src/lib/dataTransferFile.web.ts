import * as DocumentPicker from 'expo-document-picker';
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
      multiple: false,
      base64: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset.file)
      throw new Error('The browser did not provide the selected file.');
    return {
      fileName: asset.name,
      bytes: new Uint8Array(await asset.file.arrayBuffer()),
    };
  };

export const saveTransferArchives = async (
  archives: TransferArchive[],
): Promise<void> => {
  if (!archives.length) throw new Error('There are no files to export.');
  for (const archive of archives) {
    const bytes = archive.bytes.slice();
    const url = URL.createObjectURL(
      new Blob([bytes.buffer], { type: archive.mimeType }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = archive.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
};
