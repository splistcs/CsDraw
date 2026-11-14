import fs from 'node:fs/promises';
import { AppError } from '../errors/AppError.js';
import { ChunkedCipher } from './ChunkedCipher.js';

/** Le (e descriptografa) um arquivo em blocos, com suporte a intervalos de bytes. */
export class ChunkedReader {
  #filePath;
  #cipher;
  #headerSize;

  constructor({ filePath, cipher, headerSize }) {
    this.#filePath = filePath;
    this.#cipher = cipher;
    this.#headerSize = headerSize;
  }

  /** Gera pedacos em claro do intervalo [start, endInclusive]. */
  async *read(start = 0, endInclusive = Infinity) {
    const handle = await fs.open(this.#filePath, 'r');
    try {
      const { size } = await handle.stat();
      const { chunkCount, plainSize } = ChunkedCipher.layout(size, this.#headerSize);
      const last = Math.min(endInclusive, plainSize - 1);
      if (plainSize === 0 || start > last) return;

      const firstChunk = Math.floor(start / ChunkedCipher.CHUNK_SIZE);
      const lastChunk = Math.floor(last / ChunkedCipher.CHUNK_SIZE);
      for (let index = firstChunk; index <= lastChunk; index += 1) {
        const isFinal = index === chunkCount - 1;
        const plainLength = isFinal ? plainSize - index * ChunkedCipher.CHUNK_SIZE : ChunkedCipher.CHUNK_SIZE;
        const record = Buffer.alloc(plainLength + ChunkedCipher.TAG_SIZE);
        const { bytesRead } = await handle.read(record, 0, record.length, this.#headerSize + index * ChunkedCipher.RECORD_SIZE);
        if (bytesRead !== record.length) throw new AppError('Arquivo criptografado truncado.', 'CORRUPTED');
        const plain = this.#cipher.decryptChunk(record, index, isFinal);
        const from = index === firstChunk ? start - index * ChunkedCipher.CHUNK_SIZE : 0;
        const to = index === lastChunk ? last - index * ChunkedCipher.CHUNK_SIZE + 1 : plain.length;
        yield plain.subarray(from, to);
      }
    } finally {
      await handle.close();
    }
  }
}
