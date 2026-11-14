import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ChunkedCipher } from '../crypto/ChunkedCipher.js';
import { ChunkedEncryptor } from '../crypto/ChunkedEncryptor.js';
import { ChunkedReader } from '../crypto/ChunkedReader.js';
import { AppError } from '../errors/AppError.js';

/** Armazena blobs (midias, biblioteca) criptografados em disco, com leitura por intervalo. */
export class BlobStore {
  static MAGIC = Buffer.from('CSBL');
  static VERSION = 1;
  static HEADER_SIZE = BlobStore.MAGIC.length + 1 + ChunkedCipher.NONCE_PREFIX_SIZE;
  static ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  static EXTENSION = '.blob';

  #directory;
  #key;

  constructor({ directory, key }) {
    this.#directory = directory;
    this.#key = key;
  }

  async init() {
    await fs.mkdir(this.#directory, { recursive: true });
  }

  #pathFor(id) {
    if (!BlobStore.ID_PATTERN.test(id)) throw new AppError('Identificador inválido.', 'INVALID_ID');
    return path.join(this.#directory, `${id}${BlobStore.EXTENSION}`);
  }

  async putStream(id, readable) {
    const target = this.#pathFor(id);
    const temp = `${target}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const noncePrefix = ChunkedCipher.randomNoncePrefix();
    const header = Buffer.concat([BlobStore.MAGIC, Buffer.from([BlobStore.VERSION]), noncePrefix]);
    const output = fsSync.createWriteStream(temp, { mode: 0o600 });
    output.write(header);
    try {
      await pipeline(readable, new ChunkedEncryptor(new ChunkedCipher(this.#key, noncePrefix)), output);
      await fs.rename(temp, target);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
    return this.plainSize(id);
  }

  putBuffer(id, buffer) {
    return this.putStream(id, Readable.from([buffer]));
  }

  async exists(id) {
    try {
      await fs.access(this.#pathFor(id));
      return true;
    } catch {
      return false;
    }
  }

  async plainSize(id) {
    const { size } = await this.#stat(id);
    return ChunkedCipher.layout(size, BlobStore.HEADER_SIZE).plainSize;
  }

  async getBuffer(id) {
    const size = await this.plainSize(id);
    const parts = [];
    for await (const piece of this.rangeStream(id, 0, size - 1)) parts.push(piece);
    return Buffer.concat(parts);
  }

  /** Stream em claro dos bytes [start, endInclusive]. */
  rangeStream(id, start = 0, endInclusive = Infinity) {
    const self = this;
    return Readable.from(
      (async function* iterate() {
        const cipher = await self.#cipherFor(id);
        const reader = new ChunkedReader({ filePath: self.#pathFor(id), cipher, headerSize: BlobStore.HEADER_SIZE });
        yield* reader.read(start, endInclusive);
      })()
    );
  }

  async remove(id) {
    await fs.rm(this.#pathFor(id), { force: true });
  }

  async listIds() {
    const names = await fs.readdir(this.#directory);
    return names.filter((n) => n.endsWith(BlobStore.EXTENSION)).map((n) => n.slice(0, -BlobStore.EXTENSION.length));
  }

  async #stat(id) {
    try {
      return await fs.stat(this.#pathFor(id));
    } catch (error) {
      if (error.code === 'ENOENT') throw new AppError('Arquivo não encontrado no cofre.', 'NOT_FOUND');
      throw error;
    }
  }

  async #cipherFor(id) {
    await this.#stat(id);
    const handle = await fs.open(this.#pathFor(id), 'r');
    try {
      const header = Buffer.alloc(BlobStore.HEADER_SIZE);
      await handle.read(header, 0, header.length, 0);
      if (!header.subarray(0, 4).equals(BlobStore.MAGIC)) throw new AppError('Arquivo do cofre inválido.', 'CORRUPTED');
      return new ChunkedCipher(this.#key, header.subarray(5));
    } finally {
      await handle.close();
    }
  }
}
