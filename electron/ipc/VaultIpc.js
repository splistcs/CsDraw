import { BrowserWindow, dialog } from 'electron';
import { VaultTransferService } from '../core/transfer/VaultTransferService.js';

export class VaultIpc {
  #container;
  constructor(container) { this.#container = container; }

  register(registry) {
    registry.handle('vault:status', () => ({
      dataPath: this.#container.dataPath,
      isOsProtected: this.#container.isOsProtected
    }));

    registry.handle('vault:export', async (event, passphrase, title) => {
      const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
        title: typeof title === 'string' ? title.slice(0, 100) : undefined,
        defaultPath: `csdraw-backup.${VaultTransferService.FILE_EXTENSION}`,
        filters: [{ name: 'CSDraw', extensions: [VaultTransferService.FILE_EXTENSION] }]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      const counts = await this.#container.transfer.exportTo(result.filePath, passphrase);
      return { canceled: false, path: result.filePath, counts };
    });

    registry.handle('vault:import', async (event, passphrase, mode, title) => {
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        title: typeof title === 'string' ? title.slice(0, 100) : undefined,
        properties: ['openFile'],
        filters: [{ name: 'CSDraw', extensions: [VaultTransferService.FILE_EXTENSION] }]
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const counts = await this.#container.transfer.importFrom(result.filePaths[0], passphrase, mode);
      return { canceled: false, counts };
    });
  }
}
