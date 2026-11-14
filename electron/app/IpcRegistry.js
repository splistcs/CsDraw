import { ipcMain } from 'electron';
import { AppError } from '../core/errors/AppError.js';

/** Registra handlers IPC com verificacao de origem e tratamento uniforme de erros. */
export class IpcRegistry {
  #isTrustedSender;

  constructor({ isTrustedSender }) {
    this.#isTrustedSender = isTrustedSender;
  }

  handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        if (!this.#isTrustedSender(event)) throw new AppError('Origem não autorizada.', 'FORBIDDEN');
        return { ok: true, data: await handler(event, ...args) };
      } catch (error) {
        const isKnown = error instanceof AppError;
        if (!isKnown) console.error(`[ipc:${channel}]`, error);
        return { ok: false, message: isKnown ? error.message : 'Ocorreu um erro inesperado.', code: isKnown ? error.code : 'UNEXPECTED' };
      }
    });
  }
}
