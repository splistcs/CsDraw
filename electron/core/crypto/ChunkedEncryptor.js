import { Transform } from 'node:stream';
import { ChunkedCipher } from './ChunkedCipher.js';

/** Transform que recebe bytes em claro e emite blocos criptografados. */
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
      // So emite quando sobra ao menos 1 byte: o ultimo bloco precisa ser marcado como final.
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
