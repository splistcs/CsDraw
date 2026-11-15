import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { AppError } from '../errors/AppError.js';

export class DemoService {
  static MAX_BYTES = 3 * 1024 * 1024 * 1024;
  #worker = null;

  async analyze(filePath, onProgress = () => {}) {
    await DemoService.#validate(filePath);
    if (this.#worker) throw new AppError('A demo is already being analyzed.', 'BUSY');

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
      worker.on('error', (error) => finish(() => reject(new AppError(`Failed to analyze the demo: ${error.message}`, 'DEMO_PARSE_FAILED'))));
      worker.on('exit', () => finish(() => reject(new AppError('Analysis canceled.', 'CANCELED'))));
    });
  }

  cancel() {
    this.#worker?.terminate();
  }

  static async #validate(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new AppError('Invalid path.', 'INVALID');
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.bz2') || lower.endsWith('.gz') || lower.endsWith('.zip')) {
      throw new AppError('Extract the file first: use the extracted .dem.', 'INVALID');
    }
    if (!lower.endsWith('.dem')) throw new AppError('Select a .dem file.', 'INVALID');
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) throw new AppError('File not found.', 'NOT_FOUND');
    if (stat.size === 0 || stat.size > DemoService.MAX_BYTES) throw new AppError('Unsupported file size.', 'INVALID');
  }
}
