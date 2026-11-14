import { Readable } from 'node:stream';
import { AppError } from '../errors/AppError.js';
import { Validate } from '../validation/Validators.js';

/** Escreve a sequencia de entradas (biblioteca + midias) que e criptografada na exportacao. */
export class ArchiveWriter {
  static async *entries({ library, blobIds, blobStore }) {
    const libraryBuffer = Buffer.from(JSON.stringify(library), 'utf8');
    yield ArchiveWriter.#header({ type: 'library', size: libraryBuffer.length });
    yield libraryBuffer;
    for (const id of blobIds) {
      if (!(await blobStore.exists(id))) continue;
      const size = await blobStore.plainSize(id);
      yield ArchiveWriter.#header({ type: 'media', id, size });
      if (size > 0) yield* blobStore.rangeStream(id, 0, size - 1);
    }
    yield ArchiveWriter.#header({ type: 'end' });
  }

  static #header(object) {
    const json = Buffer.from(JSON.stringify(object), 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(json.length);
    return Buffer.concat([length, json]);
  }
}

class PullReader {
  #iterator;
  #buffer = Buffer.alloc(0);

  constructor(iterable) { this.#iterator = iterable[Symbol.asyncIterator](); }

  async #fill() {
    const { value, done } = await this.#iterator.next();
    if (done) return false;
    this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, value]) : value;
    return true;
  }

  async readExactly(count) {
    while (this.#buffer.length < count) {
      if (!(await this.#fill())) throw new AppError('Arquivo de cofre truncado.', 'CORRUPTED');
    }
    const out = this.#buffer.subarray(0, count);
    this.#buffer = this.#buffer.subarray(count);
    return out;
  }

  async *take(count) {
    let remaining = count;
    while (remaining > 0) {
      if (this.#buffer.length === 0 && !(await this.#fill())) throw new AppError('Arquivo de cofre truncado.', 'CORRUPTED');
      const piece = this.#buffer.subarray(0, Math.min(remaining, this.#buffer.length));
      this.#buffer = this.#buffer.subarray(piece.length);
      remaining -= piece.length;
      yield piece;
    }
  }
}

/** Le o fluxo em claro e despacha as entradas para os handlers. */
export class ArchiveReader {
  static MAX_HEADER_BYTES = 64 * 1024;
  static MAX_LIBRARY_BYTES = 256 * 1024 * 1024;

  static async read(plainChunks, { onLibrary, onMedia }) {
    const reader = new PullReader(plainChunks);
    for (;;) {
      const length = (await reader.readExactly(4)).readUInt32BE(0);
      if (length < 2 || length > ArchiveReader.MAX_HEADER_BYTES) throw new AppError('Cabeçalho do cofre inválido.', 'CORRUPTED');
      const entry = JSON.parse((await reader.readExactly(length)).toString('utf8'));
      if (entry.type === 'end') return;
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new AppError('Entrada do cofre inválida.', 'CORRUPTED');

      if (entry.type === 'library') {
        if (entry.size > ArchiveReader.MAX_LIBRARY_BYTES) throw new AppError('Biblioteca grande demais.', 'CORRUPTED');
        const parts = [];
        for await (const piece of reader.take(entry.size)) parts.push(piece);
        await onLibrary(Buffer.concat(parts));
      } else if (entry.type === 'media') {
        Validate.id(entry.id);
        await onMedia(entry, Readable.from(reader.take(entry.size)));
      } else {
        throw new AppError('Tipo de entrada desconhecido.', 'CORRUPTED');
      }
    }
  }
}
