import crypto from 'node:crypto';
import { AppError } from '../errors/AppError.js';

export class ChunkedCipher {
  static CHUNK_SIZE = 64 * 1024;
  static TAG_SIZE = 16;
  static NONCE_PREFIX_SIZE = 8;
  static RECORD_SIZE = ChunkedCipher.CHUNK_SIZE + ChunkedCipher.TAG_SIZE;

  #key;
  #noncePrefix;

  constructor(key, noncePrefix) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('The key must be 32 bytes long.');
    if (!Buffer.isBuffer(noncePrefix) || noncePrefix.length !== ChunkedCipher.NONCE_PREFIX_SIZE) {
      throw new Error('Invalid nonce prefix.');
    }
    this.#key = key;
    this.#noncePrefix = noncePrefix;
  }

  static randomNoncePrefix() {
    return crypto.randomBytes(ChunkedCipher.NONCE_PREFIX_SIZE);
  }

  static layout(totalBytes, headerSize) {
    const payload = totalBytes - headerSize;
    if (payload < ChunkedCipher.TAG_SIZE) throw new AppError('Invalid or truncated encrypted file.', 'CORRUPTED');
    const chunkCount = Math.ceil(payload / ChunkedCipher.RECORD_SIZE);
    const lastRecord = payload - (chunkCount - 1) * ChunkedCipher.RECORD_SIZE;
    if (lastRecord < ChunkedCipher.TAG_SIZE) throw new AppError('Invalid or truncated encrypted file.', 'CORRUPTED');
    return { chunkCount, plainSize: payload - chunkCount * ChunkedCipher.TAG_SIZE };
  }

  #iv(index) {
    const iv = Buffer.alloc(12);
    this.#noncePrefix.copy(iv, 0);
    iv.writeUInt32BE(index, 8);
    return iv;
  }

  encryptChunk(plain, index, isFinal) {
    const cipher = crypto.createCipheriv('aes-256-gcm', this.#key, this.#iv(index));
    cipher.setAAD(Buffer.from([isFinal ? 1 : 0]));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([encrypted, cipher.getAuthTag()]);
  }

  decryptChunk(record, index, isFinal) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.#key, this.#iv(index));
      decipher.setAAD(Buffer.from([isFinal ? 1 : 0]));
      decipher.setAuthTag(record.subarray(record.length - ChunkedCipher.TAG_SIZE));
      return Buffer.concat([decipher.update(record.subarray(0, record.length - ChunkedCipher.TAG_SIZE)), decipher.final()]);
    } catch {
      throw new AppError('Decryption failed: wrong passphrase or corrupted file.', 'DECRYPT_FAILED');
    }
  }
}
