import { BrowserWindow, dialog } from 'electron';

export class DemoIpc {
  #library;
  #analysis;
  constructor({ demoLibrary, demoAnalysis }) {
    this.#library = demoLibrary;
    this.#analysis = demoAnalysis;
  }

  register(registry) {
    registry.handle('demos:list', () => this.#library.list());

    registry.handle('demos:pick', async (event, title) => {
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        title: typeof title === 'string' ? title.slice(0, 100) : undefined,
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'CS2 demo', extensions: ['dem'] }]
      });
      return result.canceled ? [] : result.filePaths;
    });

    registry.handle('demos:import', (event, filePath) =>
      this.#library.import(filePath, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('demo:progress', progress);
      })
    );
    registry.handle('demos:open', (_e, id) => this.#library.open(id));
    registry.handle('demos:rename', (_e, payload) => this.#library.rename(payload));
    registry.handle('demos:setTags', (_e, payload) => this.#library.setTags(payload));
    registry.handle('demos:remove', (_e, id) => this.#library.remove(id));
    registry.handle('demos:cancel', () => this.#analysis.cancel());
  }
}
