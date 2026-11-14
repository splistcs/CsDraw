import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOCALE, LOCALES } from '../renderer/src/i18n/locales/index.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src');
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const base = LOCALES[DEFAULT_LOCALE].messages;

test('todos os idiomas tem exatamente as mesmas chaves e os mesmos parametros', () => {
  assert.ok(Object.keys(LOCALES).length >= 4);
  for (const [code, { messages }] of Object.entries(LOCALES)) {
    const missing = Object.keys(base).filter((key) => !(key in messages));
    const extra = Object.keys(messages).filter((key) => !(key in base));
    assert.deepEqual({ code, missing, extra }, { code, missing: [], extra: [] });
    for (const key of Object.keys(base)) {
      assert.equal(typeof messages[key], 'string', `${code}:${key}`);
      assert.ok(messages[key].trim().length > 0, `${code}:${key} vazio`);
      assert.equal(placeholders(messages[key]), placeholders(base[key]), `${code}:${key} parametros diferentes`);
    }
  }
});

test('toda chave usada no codigo existe nos dicionarios', () => {
  const used = new Set();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(match[1]);
    for (const match of text.matchAll(/\bt\(\s*isExport \? '([\w.]+)' : '([\w.]+)'/g)) { used.add(match[1]); used.add(match[2]); }
  }
  const dynamic = [
    ...['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'].map((k) => `grenade.${k}`),
    ...['board', 'playbook', 'media', 'demo'].map((k) => `tab.${k}`),
    ...['ACTIVE_DUTY', 'COMPETITIVE', 'WINGMAN'].map((k) => `mapGroup.${k}`),
    ...['pan', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text', 'eraser'].map((k) => `tool.${k}`),
    ...['bomb_exploded', 'bomb_defused', 'elimination', 'time'].map((k) => `reason.${k}`),
    ...['header', 'events', 'positions', 'assemble'].map((k) => `demo.stage.${k}`),
    ...['uploadedDesc', 'uploadedAsc', 'map', 'name'].map((k) => `demo.sort.${k}`),
    ...['INVALID', 'INVALID_ID', 'NOT_FOUND', 'DUPLICATE', 'UNSUPPORTED_MEDIA', 'TOO_LARGE', 'DECRYPT_FAILED', 'BAD_PASSPHRASE', 'WEAK_PASSPHRASE', 'CORRUPTED', 'INVALID_FILE', 'UNSUPPORTED', 'BUSY', 'DEMO_PARSE_FAILED', 'CANCELED', 'FORBIDDEN', 'UNEXPECTED'].map((k) => `error.${k}`)
  ];
  dynamic.forEach((key) => used.add(key));
  const missing = [...used].filter((key) => !(key in base));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 200);
});

test('codigos de erro do processo principal tem traducao', () => {
  const codes = new Set();
  const electron = path.join(SRC, '..', '..', 'electron');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.name.endsWith('.js')) return;
    for (const match of fs.readFileSync(full, 'utf8').matchAll(/new AppError\([^;]*?,\s*'([A-Z_]+)'\)/g)) codes.add(match[1]);
  });
  walk(electron);
  assert.ok(codes.size >= 10);
  assert.deepEqual([...codes].filter((code) => !(`error.${code}` in base)), []);
});
