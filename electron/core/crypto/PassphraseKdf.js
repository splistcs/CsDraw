import crypto from 'node:crypto';
import { AppError } from '../errors/AppError.js';

/** Deriva a chave do arquivo de exportacao a partir da senha (scrypt). */
export class PassphraseKdf {
  static DEFAULT_LOG_N = 15;
  static MIN_LOG_N = 14;
  static MAX_LOG_N = 17;
  static MIN_LENGTH = 8;

  static assertStrongEnough(passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length < PassphraseKdf.MIN_LENGTH) {
      throw new AppError(`A senha deve ter pelo menos ${PassphraseKdf.MIN_LENGTH} caracteres.`, 'WEAK_PASSPHRASE');
    }
  }

  static derive(passphrase, salt, logN = PassphraseKdf.DEFAULT_LOG_N) {
    if (logN < PassphraseKdf.MIN_LOG_N || logN > PassphraseKdf.MAX_LOG_N) {
      throw new AppError('Parâmetros de criptografia não suportados.', 'UNSUPPORTED');
    }
    return new Promise((resolve, reject) => {
      crypto.scrypt(
        passphrase.normalize('NFKC'),
        salt,
        32,
        { N: 2 ** logN, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key))
      );
    });
  }
}
