import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export class ParserVersion {
  static PACKAGE = '@laihoe/demoparser2';
  static #cached;

  static read(require = null) {
    if (require) return ParserVersion.#find(require);
    if (ParserVersion.#cached === undefined) ParserVersion.#cached = ParserVersion.#find(createRequire(import.meta.url));
    return ParserVersion.#cached;
  }

  static #find(require) {
    try {
      const version = require(`${ParserVersion.PACKAGE}/package.json`)?.version;
      if (typeof version === 'string' && version) return version;
    } catch { }
    try {
      let dir = path.dirname(require.resolve(ParserVersion.PACKAGE));
      for (let level = 0; level < 5; level += 1, dir = path.dirname(dir)) {
        const file = path.join(dir, 'package.json');
        if (!fs.existsSync(file)) continue;
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (pkg.name === ParserVersion.PACKAGE && typeof pkg.version === 'string') return pkg.version;
      }
    } catch { }
    return null;
  }
}
