import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ChunkedCipher } from '../crypto/ChunkedCipher.js';
import { ChunkedEncryptor } from '../crypto/ChunkedEncryptor.js';
import { ChunkedReader } from '../crypto/ChunkedReader.js';
import { PassphraseKdf } from '../crypto/PassphraseKdf.js';
import { AppError } from '../errors/AppError.js';
import { LibrarySanitizer } from '../validation/Validators.js';
import { LibraryStore } from '../vault/LibraryStore.js';
import { ArchiveReader, ArchiveWriter } from './ArchiveFormat.js';

export class VaultTransferService {
  static MAGIC = Buffer.from('CSDX');
  static VERSION = 1;
  static HEADER_SIZE = 4 + 1 + 1 + 16 + ChunkedCipher.NONCE_PREFIX_SIZE;
  static FILE_EXTENSION = 'csdraw';

  #libraryStore;
  #blobStore;
  #mediaService;

  constructor({ libraryStore, blobStore, mediaService }) {
    this.#libraryStore = libraryStore;
    this.#blobStore = blobStore;
    this.#mediaService = mediaService;
  }

  async exportTo(filePath, passphrase) {
    PassphraseKdf.assertStrongEnough(passphrase);
    const salt = crypto.randomBytes(16);
    const noncePrefix = ChunkedCipher.randomNoncePrefix();
    const logN = PassphraseKdf.DEFAULT_LOG_N;
    const key = await PassphraseKdf.derive(passphrase, salt, logN);
    const header = Buffer.concat([VaultTransferService.MAGIC, Buffer.from([VaultTransferService.VERSION, logN]), salt, noncePrefix]);

    const library = structuredClone(this.#libraryStore.data);
    const source = Readable.from(ArchiveWriter.entries({ library, blobIds: [...library.media.map((m) => m.id), ...library.demos.map((d) => `demo-${d.id}`)], blobStore: this.#blobStore }));
    const temp = `${filePath}.tmp`;
    const output = fsSync.createWriteStream(temp, { mode: 0o600 });
    output.write(header);
    try {
      await pipeline(source, new ChunkedEncryptor(new ChunkedCipher(key, noncePrefix)), output);
      await fs.rename(temp, filePath);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
    return VaultTransferService.#counts(library);
  }

  async importFrom(filePath, passphrase, mode = 'merge') {
    if (mode !== 'merge' && mode !== 'replace') throw new AppError('Invalid import mode.', 'INVALID');
    if (typeof passphrase !== 'string' || !passphrase) throw new AppError('Enter the file passphrase.', 'INVALID');

    const header = await VaultTransferService.#readHeader(filePath);
    const key = await PassphraseKdf.derive(passphrase, header.salt, header.logN);
    const reader = new ChunkedReader({
      filePath,
      cipher: new ChunkedCipher(key, header.noncePrefix),
      headerSize: VaultTransferService.HEADER_SIZE
    });

    let rawLibrary = null;
    const importedIds = new Set();
    try {
      await ArchiveReader.read(reader.read(), {
        onLibrary: (buffer) => { rawLibrary = JSON.parse(buffer.toString('utf8')); },
        onMedia: async (entry, stream) => {
          await this.#blobStore.putStream(entry.id, stream);
          importedIds.add(entry.id);
        }
      });
    } catch (error) {
      if (error.code === 'DECRYPT_FAILED') throw new AppError('Wrong passphrase or corrupted file.', 'BAD_PASSPHRASE');
      throw error;
    }
    if (!rawLibrary) throw new AppError('The file does not contain a library.', 'CORRUPTED');

    const incoming = LibrarySanitizer.sanitize(rawLibrary);
    incoming.media = incoming.media.filter((item) => importedIds.has(item.id));
    incoming.demos = incoming.demos.filter((demo) => importedIds.has(`demo-${demo.id}`));

    if (mode === 'replace') {
      await this.#libraryStore.replace({ version: LibraryStore.VERSION, ...incoming });
    } else {
      await this.#libraryStore.mutate((data) => {
        data.drawings = VaultTransferService.#merge(data.drawings, incoming.drawings, 'updatedAt');
        data.playbooks = VaultTransferService.#merge(data.playbooks, incoming.playbooks, 'updatedAt');
        data.folders = VaultTransferService.#merge(data.folders, incoming.folders, 'createdAt');
        data.media = VaultTransferService.#merge(data.media, incoming.media, 'createdAt');
        data.demos = VaultTransferService.#merge(data.demos ?? [], incoming.demos, 'uploadedAt');
      });
    }
    await this.#mediaService.collectOrphans();
    return VaultTransferService.#counts(incoming);
  }

  static async #readHeader(filePath) {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(VaultTransferService.HEADER_SIZE);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead < buffer.length || !buffer.subarray(0, 4).equals(VaultTransferService.MAGIC)) {
        throw new AppError('This is not a CsDraw vault file.', 'INVALID_FILE');
      }
      if (buffer[4] !== VaultTransferService.VERSION) throw new AppError('Unsupported file version.', 'UNSUPPORTED');
      return { logN: buffer[5], salt: buffer.subarray(6, 22), noncePrefix: buffer.subarray(22, 30) };
    } finally {
      await handle.close();
    }
  }

  static #merge(current, incoming, dateField) {
    const byId = new Map(current.map((item) => [item.id, item]));
    for (const item of incoming) {
      const existing = byId.get(item.id);
      if (!existing || item[dateField] > existing[dateField]) byId.set(item.id, item);
    }
    return [...byId.values()];
  }

  static #counts(library) {
    return {
      drawings: library.drawings.length,
      playbooks: library.playbooks.length,
      folders: library.folders.length,
      media: library.media.filter((m) => m.origin !== 'sticker').length,
      demos: library.demos.length
    };
  }
}
