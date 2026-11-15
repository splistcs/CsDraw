import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class VaultKeyProvider {
  #filePath;
  #protect;
  #unprotect;
  #isOsProtected;
  #key = null;

  constructor({ filePath, protect = null, unprotect = null }) {
    this.#filePath = filePath;
    this.#isOsProtected = Boolean(protect && unprotect);
    this.#protect = protect ?? ((buffer) => buffer);
    this.#unprotect = unprotect ?? ((buffer) => buffer);
  }

  get isOsProtected() {
    return this.#isOsProtected;
  }

  getKey() {
    if (this.#key) return this.#key;
    if (fs.existsSync(this.#filePath)) {
      this.#key = this.#unprotect(fs.readFileSync(this.#filePath));
    } else {
      this.#key = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(this.#filePath), { recursive: true });
      fs.writeFileSync(this.#filePath, this.#protect(this.#key), { mode: 0o600 });
    }
    if (this.#key.length !== 32) throw new Error('Invalid vault key.');
    return this.#key;
  }
}
