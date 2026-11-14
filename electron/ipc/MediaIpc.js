import { BrowserWindow, dialog } from 'electron';
import { MediaTypes } from '../core/validation/MediaTypes.js';

export class MediaIpc {
  #media;
  constructor({ media }) { this.#media = media; }

  register(registry) {
    registry.handle('media:tree', () => this.#media.tree());
    registry.handle('media:createFolder', (_e, payload) => this.#media.createFolder(payload));
    registry.handle('media:renameFolder', (_e, payload) => this.#media.renameFolder(payload));
    registry.handle('media:removeFolder', (_e, id) => this.#media.removeFolder(id));
    registry.handle('media:importPaths', (_e, paths, folderId) => this.#media.importPaths(paths, folderId));
    registry.handle('media:addBuffer', (_e, payload) => this.#media.addBuffer(payload));
    registry.handle('media:rename', (_e, payload) => this.#media.rename(payload));
    registry.handle('media:move', (_e, payload) => this.#media.move(payload));
    registry.handle('media:remove', (_e, id) => this.#media.remove(id));

    registry.handle('media:pickAndImport', async (event, folderId, title) => {
      const extensions = Object.keys(MediaTypes.BY_EXTENSION).map((ext) => ext.slice(1));
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        title: typeof title === 'string' ? title.slice(0, 100) : undefined,
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Media', extensions }]
      });
      if (result.canceled) return { added: [], errors: [], canceled: true };
      return this.#media.importPaths(result.filePaths, folderId);
    });
  }
}
