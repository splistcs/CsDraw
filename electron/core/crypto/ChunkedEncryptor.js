import { Transform } from 'node:stream';
import { ChunkedCipher } from './ChunkedCipher.js';

export class ChunkedEncryptor extends Transform {
  #cipher;
  #pending = Buffer.alloc(0);
  #index = 0;

  constructor(cipher) {
    super();
    this.#cipher = cipher;
  }

  _transform(chunk, _encoding, callback) {
    try {
      this.#pending = this.#pending.length ? Buffer.concat([this.#pending, chunk]) : chunk;
      while (this.#pending.length > ChunkedCipher.CHUNK_SIZE) {
        this.push(this.#cipher.encryptChunk(this.#pending.subarray(0, ChunkedCipher.CHUNK_SIZE), this.#index, false));
        this.#index += 1;
        this.#pending = this.#pending.subarray(ChunkedCipher.CHUNK_SIZE);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      this.push(this.#cipher.encryptChunk(this.#pending, this.#index, true));
      callback();
    } catch (error) {
      callback(error);
    }
  }
}
