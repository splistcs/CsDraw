import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Versao do leitor de demos (@laihoe/demoparser2) instalado. Serve para (1) reanalisar uma demo guardada quando ela foi
 * lida por outra versao do leitor e (2) dizer qual versao falhou quando uma demo nao carrega. Nunca lanca: sem a
 * versao devolve null e o app segue como antes.
 */
export class ParserVersion {
  static PACKAGE = '@laihoe/demoparser2';
  static #cached;

  /** `require` so e passado nos testes; a leitura padrao fica em cache (o pacote nao muda com o app aberto). */
  static read(require = null) {
    if (require) return ParserVersion.#find(require);
    if (ParserVersion.#cached === undefined) ParserVersion.#cached = ParserVersion.#find(createRequire(import.meta.url));
    return ParserVersion.#cached;
  }

  static #find(require) {
    try {
      const version = require(`${ParserVersion.PACKAGE}/package.json`)?.version;
      if (typeof version === 'string' && version) return version;
    } catch { /* o pacote pode restringir subcaminhos: procura pela pasta */ }
    try {
      let dir = path.dirname(require.resolve(ParserVersion.PACKAGE));
      for (let level = 0; level < 5; level += 1, dir = path.dirname(dir)) {
        const file = path.join(dir, 'package.json');
        if (!fs.existsSync(file)) continue;
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (pkg.name === ParserVersion.PACKAGE && typeof pkg.version === 'string') return pkg.version;
      }
    } catch { /* nao instalado */ }
    return null;
  }
}
