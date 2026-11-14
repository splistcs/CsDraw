import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { AppError } from '../errors/AppError.js';
import { Validate } from '../validation/Validators.js';
import { DemoAnalyzer } from './DemoAnalyzer.js';
import { ParserVersion } from './ParserVersion.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Biblioteca de demos: guarda o resultado da analise (JSON comprimido) no cofre criptografado,
 * para reabrir uma demo instantaneamente sem reanalisar o .dem original.
 */
export class DemoLibraryService {
  static BLOB_PREFIX = 'demo-';
  #repository;
  #blobStore;
  #analysis;
  #parserVersion;

  /** `parserVersion`: versao do leitor de demos instalado (null se desconhecida: ai so a versao da analise decide). */
  constructor({ demoRepository, blobStore, analysisService, parserVersion = ParserVersion.read() }) {
    this.#repository = demoRepository;
    this.#blobStore = blobStore;
    this.#analysis = analysisService;
    this.#parserVersion = parserVersion || null;
  }

  /**
   * A analise guardada vale? So se tem o formato atual E foi feita pelo mesmo leitor de demos que esta instalado: outra
   * versao do leitor pode entregar dados que a anterior nao tinha (ou ler demos que ela nao lia).
   */
  #isCurrent(entry) {
    if ((entry.analysisVersion ?? 1) < DemoAnalyzer.VERSION) return false;
    return !this.#parserVersion || entry.parserVersion === this.#parserVersion;
  }

  list() { return this.#repository.list(); }

  /**
   * Importa uma demo. Se ela ja esta na biblioteca com o formato atual e lida pelo mesmo leitor de demos, devolve `duplicate`;
   * se foi analisada com uma versao antiga da analise ou de outro leitor, reanalisa e atualiza no mesmo registro.
   */
  async import(filePath, onProgress = () => {}) {
    const stat = typeof filePath === 'string' ? await fs.stat(filePath).catch(() => null) : null;
    if (!stat?.isFile()) throw new AppError('Arquivo não encontrado.', 'NOT_FOUND');
    const fileName = path.basename(filePath);
    const fingerprint = `${fileName}|${stat.size}|${Math.round(stat.mtimeMs)}`;
    const existing = this.#repository.findByFingerprint(fingerprint);
    if (existing && this.#isCurrent(existing)) return { entry: structuredClone(existing), duplicate: true };

    const result = await this.#analysis.analyze(filePath, onProgress);
    if (existing) {
      await this.#blobStore.putBuffer(`${DemoLibraryService.BLOB_PREFIX}${existing.id}`, await DemoLibraryService.#pack(result));
      const entry = await this.#repository.update(existing.id, { ...DemoLibraryService.#summary(result), analysisVersion: DemoAnalyzer.VERSION, parserVersion: this.#parserVersion ?? '' });
      return { entry, duplicate: false, upgraded: true };
    }

    const id = Validate.newId();
    const blobId = `${DemoLibraryService.BLOB_PREFIX}${id}`;
    await this.#blobStore.putBuffer(blobId, await DemoLibraryService.#pack(result));
    const entry = {
      id,
      name: fileName.replace(/\.dem$/i, '').slice(0, 120) || 'demo',
      ...DemoLibraryService.#summary(result),
      uploadedAt: new Date().toISOString(),
      fileModifiedAt: new Date(stat.mtimeMs).toISOString(),
      fileSize: stat.size,
      fingerprint,
      analysisVersion: DemoAnalyzer.VERSION,
      parserVersion: this.#parserVersion ?? '',
      tags: []
    };
    try {
      return { entry: await this.#repository.add(entry), duplicate: false };
    } catch (error) {
      await this.#blobStore.remove(blobId);
      throw error;
    }
  }

  static async #pack(result) {
    return gzip(Buffer.from(JSON.stringify(result), 'utf8'));
  }

  /** Campos do registro que dependem do resultado da analise. */
  static #summary(result) {
    const last = result.rounds[result.rounds.length - 1];
    return {
      mapName: String(result.map.name ?? '').slice(0, 60),
      mapSlug: /^[a-z0-9-]{2,40}$/.test(result.map.slug) ? result.map.slug : 'unknown',
      roundCount: result.rounds.length,
      scoreA: last.scoreA,
      scoreB: last.scoreB,
      teamA: result.teams?.a ?? '',
      teamB: result.teams?.b ?? ''
    };
  }

  async open(id) {
    const safeId = Validate.id(id);
    if (!this.#repository.find(safeId)) throw new AppError('Demo não encontrada.', 'NOT_FOUND');
    const packed = await this.#blobStore.getBuffer(`${DemoLibraryService.BLOB_PREFIX}${safeId}`);
    return JSON.parse((await gunzip(packed)).toString('utf8'));
  }

  rename({ id, name }) {
    return this.#repository.update(Validate.id(id), { name: Validate.text(name, { min: 1, max: 120, label: 'Nome' }) });
  }

  setTags({ id, tags }) {
    if (!Array.isArray(tags) || tags.length > 20) throw new AppError('Tags inválidas.', 'INVALID');
    const clean = [...new Set(tags.map((tag) => Validate.text(tag, { min: 1, max: 30, label: 'Tag' })))];
    return this.#repository.update(Validate.id(id), { tags: clean });
  }

  async remove(id) {
    const safeId = Validate.id(id);
    await this.#repository.remove(safeId);
    await this.#blobStore.remove(`${DemoLibraryService.BLOB_PREFIX}${safeId}`);
  }
}
