import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { AppError } from '../errors/AppError.js';

/** Executa a analise de demos em uma worker thread (o parser e sincrono e pesado). */
export class DemoService {
  static MAX_BYTES = 3 * 1024 * 1024 * 1024;
  #worker = null;

  async analyze(filePath, onProgress = () => {}) {
    await DemoService.#validate(filePath);
    if (this.#worker) throw new AppError('Já existe uma demo sendo analisada.', 'BUSY');

    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./DemoParserWorker.js', import.meta.url), {
        workerData: { filePath },
        resourceLimits: { maxOldGenerationSizeMb: 4096 }
      });
      this.#worker = worker;
      let settled = false;
      const finish = (action) => {
        if (settled) return;
        settled = true;
        this.#worker = null;
        action();
      };

      worker.on('message', (message) => {
        if (message.type === 'progress') onProgress({ stage: message.stage, percent: message.percent });
        else if (message.type === 'done') finish(() => resolve(message.result));
        else if (message.type === 'error') finish(() => reject(new AppError(message.message, 'DEMO_PARSE_FAILED')));
      });
      worker.on('error', (error) => finish(() => reject(new AppError(`Falha ao analisar a demo: ${error.message}`, 'DEMO_PARSE_FAILED'))));
      worker.on('exit', () => finish(() => reject(new AppError('Análise cancelada.', 'CANCELED'))));
    });
  }

  cancel() {
    this.#worker?.terminate();
  }

  static async #validate(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new AppError('Caminho inválido.', 'INVALID');
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.bz2') || lower.endsWith('.gz') || lower.endsWith('.zip')) {
      throw new AppError('Descompacte o arquivo antes: use o .dem extraído.', 'INVALID');
    }
    if (!lower.endsWith('.dem')) throw new AppError('Selecione um arquivo .dem.', 'INVALID');
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) throw new AppError('Arquivo não encontrado.', 'NOT_FOUND');
    if (stat.size === 0 || stat.size > DemoService.MAX_BYTES) throw new AppError('Tamanho de arquivo não suportado.', 'INVALID');
  }
}
