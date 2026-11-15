import { ipcMain } from 'electron';
import { AppError } from '../core/errors/AppError.js';

export class IpcRegistry {
  #isTrustedSender;

  constructor({ isTrustedSender }) {
    this.#isTrustedSender = isTrustedSender;
  }

  handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        if (!this.#isTrustedSender(event)) throw new AppError('Unauthorized origin.', 'FORBIDDEN');
        return { ok: true, data: await handler(event, ...args) };
      } catch (error) {
        const isKnown = error instanceof AppError;
        if (!isKnown) console.error(`[ipc:${channel}]`, error);
        return { ok: false, message: isKnown ? error.message : 'An unexpected error occurred.', code: isKnown ? error.code : 'UNEXPECTED' };
      }
    });
  }
}
