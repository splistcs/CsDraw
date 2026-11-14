import { BrowserWindow, shell } from 'electron';

export class MainWindow {
  /** Cria a janela com isolamento de contexto e sandbox; links externos abrem no navegador. */
  static create({ preloadPath, devUrl, indexPath }) {
    const window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 980,
      minHeight: 640,
      backgroundColor: '#12171c',
      title: 'CSDraw',
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      const isOwn = devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
      if (!isOwn) event.preventDefault();
    });

    if (devUrl) {
      window.loadURL(devUrl);
      window.webContents.openDevTools({ mode: 'detach' });
    } else {
      window.loadFile(indexPath);
    }
    return window;
  }
}
