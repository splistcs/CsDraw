import crypto from 'node:crypto';
import { AppError } from '../errors/AppError.js';

/**
 * AES-256-GCM em blocos de 64 KiB com acesso aleatorio.
 * IV = prefixo aleatorio (8 bytes) + indice do bloco (4 bytes). O AAD marca o ultimo bloco,
 * o que detecta truncamento e reordenacao.
 */
export class ChunkedCipher {
  static CHUNK_SIZE = 64 * 1024;
  static TAG_SIZE = 16;
  static NONCE_PREFIX_SIZE = 8;
  static RECORD_SIZE = ChunkedCipher.CHUNK_SIZE + ChunkedCipher.TAG_SIZE;

  #key;
  #noncePrefix;

  constructor(key, noncePrefix) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('A chave deve ter 32 bytes.');
    if (!Buffer.isBuffer(noncePrefix) || noncePrefix.length !== ChunkedCipher.NONCE_PREFIX_SIZE) {
      throw new Error('Prefixo de nonce invalido.');
    }
    this.#key = key;
    this.#noncePrefix = noncePrefix;
  }

  static randomNoncePrefix() {
    return crypto.randomBytes(ChunkedCipher.NONCE_PREFIX_SIZE);
  }

  /** Calcula numero de blocos e tamanho em claro a partir do tamanho do arquivo. */
  static layout(totalBytes, headerSize) {
    const payload = totalBytes - headerSize;
    if (payload < ChunkedCipher.TAG_SIZE) throw new AppError('Arquivo criptografado inválido ou truncado.', 'CORRUPTED');
    const chunkCount = Math.ceil(payload / ChunkedCipher.RECORD_SIZE);
    const lastRecord = payload - (chunkCount - 1) * ChunkedCipher.RECORD_SIZE;
    if (lastRecord < ChunkedCipher.TAG_SIZE) throw new AppError('Arquivo criptografado inválido ou truncado.', 'CORRUPTED');
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
      throw new AppError('Falha ao descriptografar: chave/senha incorreta ou arquivo corrompido.', 'DECRYPT_FAILED');
    }
  }
}
