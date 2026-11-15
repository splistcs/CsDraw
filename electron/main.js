import { app, BrowserWindow, protocol, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IpcRegistry } from './app/IpcRegistry.js';
import { MainWindow } from './app/MainWindow.js';
import { MediaProtocol } from './app/MediaProtocol.js';
import { ServiceContainer } from './app/ServiceContainer.js';
import { UpdateService, releasesUrlFrom } from './core/update/UpdateService.js';
import { DemoIpc } from './ipc/DemoIpc.js';
import { DrawingIpc } from './ipc/DrawingIpc.js';
import { MediaIpc } from './ipc/MediaIpc.js';
import { PlaybookIpc } from './ipc/PlaybookIpc.js';
import { UpdateIpc } from './ipc/UpdateIpc.js';
import { VaultIpc } from './ipc/VaultIpc.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.CSDRAW_DEV ? 'http://localhost:5173/' : null;
const INDEX_PATH = path.join(ROOT, '..', 'dist', 'index.html');
const ICON_PATH = path.join(ROOT, '..', 'build', 'icon.png');
const APP_ORIGIN = DEV_URL ?? pathToFileURL(path.join(ROOT, '..', 'dist')).href;

protocol.registerSchemesAsPrivileged([MediaProtocol.privilegedScheme()]);

function buildOsCrypto() {
  const backend = safeStorage.getSelectedStorageBackend?.();
  if (!safeStorage.isEncryptionAvailable() || backend === 'basic_text') return null;
  return {
    encrypt: (key) => safeStorage.encryptString(key.toString('base64')),
    decrypt: (data) => Buffer.from(safeStorage.decryptString(data), 'base64')
  };
}

async function loadAutoUpdater() {
  try {
    const module = await import('electron-updater');
    return module.autoUpdater ?? module.default?.autoUpdater ?? null;
  } catch (error) {
    console.error('[update] electron-updater unavailable:', error.message);
    return null;
  }
}

async function createUpdateService() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8'));
  const releasesUrl = releasesUrlFrom(pkg.build?.publish);
  const supported = app.isPackaged && Boolean(releasesUrl) && !process.env.CSDRAW_NO_UPDATE && (process.platform !== 'linux' || Boolean(process.env.APPIMAGE));
  return new UpdateService({ updater: supported ? await loadAutoUpdater() : null, currentVersion: app.getVersion(), releasesUrl });
}

async function bootstrap() {
  const container = await ServiceContainer.create({ userDataPath: app.getPath('userData'), osCrypto: buildOsCrypto() });
  MediaProtocol.register(protocol, container);
  const updates = await createUpdateService();

  const registry = new IpcRegistry({ isTrustedSender: (event) => (event.senderFrame?.url ?? '').startsWith(APP_ORIGIN) });
  [new DrawingIpc(container), new PlaybookIpc(container), new MediaIpc(container), new VaultIpc(container), new DemoIpc(container), new UpdateIpc(updates)].forEach((module) =>
    module.register(registry)
  );

  const open = () => MainWindow.create({ preloadPath: path.join(ROOT, 'preload.cjs'), devUrl: DEV_URL, indexPath: INDEX_PATH, iconPath: ICON_PATH });
  open();
  updates.start();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && open());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
  app.whenReady().then(bootstrap);
  app.on('window-all-closed', () => app.quit());
}
