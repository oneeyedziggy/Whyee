import type { TransferArchive } from '../types/dataTransfer';

export interface SelectedTransferFile {
  fileName: string;
  bytes: Uint8Array;
}

export const pickTransferFile =
  async (): Promise<SelectedTransferFile | null> => {
    throw new Error(
      'Data transfer file picking is unavailable on this platform.',
    );
  };

export const saveTransferArchives = async (
  _archives: TransferArchive[],
): Promise<void> => {
  throw new Error('Data transfer file saving is unavailable on this platform.');
};
