import { BrowserWindow, shell } from 'electron';

/** Estado e acoes da atualizacao automatica; o estado novo e empurrado para todas as janelas. */
export class UpdateIpc {
  #updates;
  constructor(updates) { this.#updates = updates; }

  register(registry) {
    registry.handle('update:state', () => this.#updates.state);
    registry.handle('update:check', () => this.#updates.check());
    registry.handle('update:install', () => {
      this.#updates.install();
      return this.#updates.state;
    });
    // A URL vem da configuracao do app (package.json), nunca do renderer.
    registry.handle('update:openReleases', async () => {
      const url = this.#updates.state.releasesUrl;
      if (url) await shell.openExternal(url);
    });

    this.#updates.onChange((state) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) window.webContents.send('update:state', state);
      });
    });
  }
}
