import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { VaultKeyProvider } from '../electron/core/vault/VaultKeyProvider.js';
import { BlobStore } from '../electron/core/vault/BlobStore.js';
import { LibraryStore } from '../electron/core/vault/LibraryStore.js';
import { DrawingRepository, MediaRepository, PlaybookRepository } from '../electron/core/vault/repositories.js';
import { DrawingService, MediaService, PlaybookService } from '../electron/core/vault/services.js';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';
import { DemoLibraryService } from '../electron/core/demo/DemoLibraryService.js';
import { DemoRepository } from '../electron/core/vault/repositories.js';
import { createFakeEngine } from './helpers.mjs';
import { VaultTransferService } from '../electron/core/transfer/VaultTransferService.js';

async function createVault(dir, keyHex) {
  const keys = new VaultKeyProvider({ filePath: path.join(dir, 'vault.key') });
  const key = keyHex ? Buffer.from(keyHex, 'hex') : keys.getKey();
  const blobStore = new BlobStore({ directory: path.join(dir, 'blobs'), key });
  await blobStore.init();
  const libraryStore = new LibraryStore(blobStore);
  await libraryStore.load();
  const drawingRepository = new DrawingRepository(libraryStore);
  const mediaRepository = new MediaRepository(libraryStore);
  const playbookRepository = new PlaybookRepository(libraryStore);
  const demoRepository = new DemoRepository(libraryStore);
  const mediaService = new MediaService({ blobStore, mediaRepository, drawingRepository, extraKnownBlobIds: () => demoRepository.all().map((d) => `demo-${d.id}`) });
  const analysisService = { analyze: async (_file, onProgress) => { onProgress?.({ stage: 'x', percent: 50 }); return new DemoAnalyzer(createFakeEngine({ perSide: 2 })).analyze('x.dem'); } };
  return {
    demoLibrary: new DemoLibraryService({ demoRepository, blobStore, analysisService }),
    key, blobStore, libraryStore, mediaService, mediaRepository, demoRepository,
    drawings: new DrawingService({ drawingRepository, mediaRepository }),
    playbooks: new PlaybookService({ playbookRepository }),
    transfer: new VaultTransferService({ libraryStore, blobStore, mediaService })
  };
}
const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'csdraw-'));

test('blob: ida e volta, intervalos e adulteracao', async () => {
  const dir = await tmp();
  const v = await createVault(dir);
  for (const size of [0, 1, 65535, 65536, 65537, 200000]) {
    const data = crypto.randomBytes(size);
    const id = `b${size}`;
    assert.equal(await v.blobStore.putStream(id, Readable.from([data])), size);
    assert.ok((await v.blobStore.getBuffer(id)).equals(data), `roundtrip ${size}`);
    if (size > 10) {
      const parts = [];
      for await (const p of v.blobStore.rangeStream(id, 5, size - 3)) parts.push(p);
      assert.ok(Buffer.concat(parts).equals(data.subarray(5, size - 2)), `range ${size}`);
    }
  }
  // bit flip
  const file = path.join(dir, 'blobs', 'b200000.blob');
  const raw = await fs.readFile(file);
  raw[100] ^= 1;
  await fs.writeFile(file, raw);
  await assert.rejects(() => v.blobStore.getBuffer('b200000'), /descriptografar/);
  // truncado
  await fs.writeFile(file, raw.subarray(0, raw.length - 70000));
  await assert.rejects(() => v.blobStore.getBuffer('b200000'));
  // chave errada
  const other = new BlobStore({ directory: path.join(dir, 'blobs'), key: crypto.randomBytes(32) });
  await assert.rejects(() => other.getBuffer('b1'), /descriptografar/);
  // id malicioso
  await assert.rejects(() => v.blobStore.getBuffer('../x'), /inválido/);
});

test('biblioteca persiste criptografada e recarrega', async () => {
  const dir = await tmp();
  const v = await createVault(dir);
  const saved = await v.drawings.save({ name: 'Smoke A', mapSlug: 'mirage', notes: '# oi', thumbnail: '', strokes: [{ color: '#ffffff', width: 4, points: [[1, 2], [3, 4]] }], stickers: [{ type: 'smoke', x: 10, y: 20, images: [] }] });
  assert.ok(saved.id && saved.stickers[0].id);
  const onDisk = await fs.readFile(path.join(dir, 'blobs', 'library.blob'));
  assert.ok(!onDisk.includes(Buffer.from('Smoke A')), 'nada em texto claro');

  const v2 = await createVault(dir); // mesma chave (vault.key)
  const loaded = v2.drawings.get(saved.id);
  assert.equal(loaded.name, 'Smoke A');
  // editar de novo
  const edited = await v2.drawings.save({ ...loaded, name: 'Smoke B', strokes: [] });
  assert.equal(edited.id, saved.id);
  assert.equal(v2.drawings.list().length, 1);
  assert.equal(v2.drawings.get(saved.id).name, 'Smoke B');
  await assert.rejects(() => v2.drawings.save({ ...loaded, id: 'nao-existe' }), /não encontrado/);
  await assert.rejects(async () => v2.drawings.save({ ...loaded, stickers: [{ type: 'nuke', x: 1, y: 1 }] }), /Adesivo/);
});

test('midia: pastas, import, mover, adesivos e limpeza de orfaos', async () => {
  const dir = await tmp();
  const v = await createVault(dir);
  const folder = await v.mediaService.createFolder({ name: 'Mirage' });
  await assert.rejects(() => v.mediaService.createFolder({ name: 'mirage' }), /Já existe/);
  const sub = await v.mediaService.createFolder({ name: 'Smokes', parentId: folder.id });
  const videoPath = path.join(dir, 'clip.mp4');
  const videoBytes = crypto.randomBytes(300000);
  await fs.writeFile(videoPath, videoBytes);
  await fs.writeFile(path.join(dir, 'x.exe'), 'x');
  const { added, errors } = await v.mediaService.importPaths([videoPath, path.join(dir, 'x.exe')], sub.id);
  assert.equal(added.length, 1); assert.equal(errors.length, 1);
  assert.ok((await v.blobStore.getBuffer(added[0].id)).equals(videoBytes));

  const png = await v.mediaService.addBuffer({ name: 'a.png', data: new Uint8Array([1, 2, 3]), origin: 'sticker' });
  assert.equal(v.mediaService.tree().items.length, 1, 'anexo de adesivo fica oculto');
  await assert.rejects(() => v.mediaService.addBuffer({ name: 'v.mp4', data: new Uint8Array([1]), origin: 'sticker' }), /imagens/);

  const d = await v.drawings.save({ name: 'D', mapSlug: 'nuke', notes: '', thumbnail: '', strokes: [], stickers: [{ type: 'he', x: 1, y: 2, images: [{ mediaId: png.id, caption: 'legenda' }, { mediaId: 'fantasma', caption: '' }] }] });
  assert.equal(d.stickers[0].images.length, 1, 'referencia inexistente descartada');
  await v.mediaService.collectOrphans();
  assert.ok(await v.blobStore.exists(png.id), 'anexo referenciado permanece');
  await v.drawings.save({ ...d, stickers: [] });
  await v.mediaService.collectOrphans();
  assert.ok(!(await v.blobStore.exists(png.id)), 'anexo sem uso removido');

  await v.mediaService.removeFolder(folder.id);
  assert.ok(!(await v.blobStore.exists(added[0].id)), 'remover pasta apaga midias dentro');
  assert.equal(v.mediaService.tree().folders.length, 0);
});

test('biblioteca de demos: demo analisada com formato antigo e reanalisada no mesmo registro', async () => {
  const dir = await tmp();
  const v = await createVault(dir);
  const demoFile = path.join(dir, 'antiga.dem');
  await fs.writeFile(demoFile, 'conteudo');
  const { entry } = await v.demoLibrary.import(demoFile);
  assert.equal(entry.analysisVersion, DemoAnalyzer.VERSION);
  await v.demoLibrary.setTags({ id: entry.id, tags: ['scrim'] });
  await v.demoRepository.update(entry.id, { analysisVersion: undefined }); // como as demos salvas antes da versao 2

  const again = await v.demoLibrary.import(demoFile);
  assert.deepEqual([again.duplicate, again.upgraded], [false, true]);
  assert.equal(again.entry.id, entry.id, 'mesmo registro');
  assert.deepEqual(again.entry.tags, ['scrim'], 'tags preservadas');
  assert.equal(again.entry.analysisVersion, DemoAnalyzer.VERSION);
  assert.equal(v.demoLibrary.list().length, 1);
  assert.equal((await v.demoLibrary.open(entry.id)).version, DemoAnalyzer.VERSION);
  assert.equal((await v.demoLibrary.import(demoFile)).duplicate, true, 'depois de atualizada volta a ser duplicata');
});

test('biblioteca de demos: importar, reabrir, tags, duplicata e remover', async () => {
  const dir = await tmp();
  const v = await createVault(dir);
  const demoFile = path.join(dir, 'minha-partida.dem');
  await fs.writeFile(demoFile, 'conteudo qualquer');
  const progress = [];
  const { entry, duplicate } = await v.demoLibrary.import(demoFile, (p) => progress.push(p));
  assert.equal(duplicate, false);
  assert.equal(entry.name, 'minha-partida');
  assert.equal(entry.mapSlug, 'mirage');
  assert.deepEqual([entry.roundCount, entry.scoreA, entry.scoreB], [3, 1, 2]);
  assert.ok(progress.length >= 1);
  assert.equal((await v.demoLibrary.import(demoFile)).duplicate, true, 'mesma demo nao e duplicada');
  assert.equal(v.demoLibrary.list().length, 1);

  const opened = await v.demoLibrary.open(entry.id);
  assert.equal(opened.rounds.length, 3);
  assert.equal(opened.map.slug, 'mirage');
  const onDisk = await fs.readFile(path.join(dir, 'blobs', `demo-${entry.id}.blob`));
  assert.ok(!onDisk.includes(Buffer.from('mirage')), 'demo criptografada em disco');

  await v.demoLibrary.rename({ id: entry.id, name: 'Final do campeonato' });
  const tagged = await v.demoLibrary.setTags({ id: entry.id, tags: ['scrim', 'scrim', 'anti-eco'] });
  assert.deepEqual(tagged.tags, ['scrim', 'anti-eco']);
  assert.equal(v.demoLibrary.list()[0].name, 'Final do campeonato');
  await assert.rejects(() => v.demoLibrary.import('/nao/existe.dem'), /não encontrado/);

  await v.mediaService.collectOrphans();
  assert.ok(await v.blobStore.exists(`demo-${entry.id}`), 'blob de demo nao e tratado como orfao');
  await v.demoLibrary.remove(entry.id);
  assert.ok(!(await v.blobStore.exists(`demo-${entry.id}`)));
  assert.equal(v.demoLibrary.list().length, 0);
});

test('tracados novos (formas, texto, marca-texto) sao validados e salvos', async () => {
  const v = await createVault(await tmp());
  const base = { name: 'Formas', mapSlug: 'nuke', notes: '', thumbnail: '', stickers: [] };
  const saved = await v.drawings.save({ ...base, strokes: [
    { kind: 'highlighter', color: '#ffd60a', width: 40, points: [[0, 0], [10, 10], [20, 5]] },
    { kind: 'arrow', color: '#e5484d', width: 4, points: [[0, 0], [100, 50]] },
    { kind: 'rect', color: '#46a758', width: 3, points: [[10, 10], [200, 120]] },
    { kind: 'ellipse', color: '#3e8ef7', width: 3, points: [[10, 10], [200, 120]] },
    { kind: 'text', color: '#ffffff', width: 6, points: [[50, 60]], text: 'Smoke aqui' },
    { color: '#ffffff', width: 4, points: [[1, 1]] }
  ] });
  assert.deepEqual(saved.strokes.map((s) => s.kind), ['highlighter', 'arrow', 'rect', 'ellipse', 'text', 'pen']);
  assert.equal(saved.strokes[4].text, 'Smoke aqui');
  const bad = (stroke) => assert.rejects(async () => v.drawings.save({ ...base, strokes: [stroke] }), /inválido|Texto/);
  await bad({ kind: 'arrow', color: '#ffffff', width: 4, points: [[0, 0]] });
  await bad({ kind: 'text', color: '#ffffff', width: 4, points: [[0, 0]], text: '' });
  await bad({ kind: 'laser', color: '#ffffff', width: 4, points: [[0, 0], [1, 1]] });
  await bad({ kind: 'pen', color: 'vermelho', width: 4, points: [[0, 0]] });
});

test('exportar e importar: tudo volta, senha errada e adulteracao', async () => {
  const a = await createVault(await tmp());
  const folder = await a.mediaService.createFolder({ name: 'Pasta' });
  const bytes = crypto.randomBytes(250000);
  const dirA = await tmp();
  await fs.writeFile(path.join(dirA, 'v.webm'), bytes);
  const { added } = await a.mediaService.importPaths([path.join(dirA, 'v.webm')], folder.id);
  const sticker = await a.mediaService.addBuffer({ name: 's.png', data: new Uint8Array([9, 8, 7]), origin: 'sticker' });
  const drawing = await a.drawings.save({ name: 'Desenho', mapSlug: 'inferno', notes: 'n', thumbnail: '', strokes: [], stickers: [{ type: 'flash', x: 5, y: 5, images: [{ mediaId: sticker.id, caption: 'cap' }] }] });
  const playbook = await a.playbooks.save({ name: 'PB', content: `![x](csdraw-drawing:${drawing.id})` });
  const demoPath = path.join(dirA, 'partida.dem');
  await fs.writeFile(demoPath, 'x');
  const { entry: demoEntry } = await a.demoLibrary.import(demoPath);

  const out = path.join(await tmp(), 'backup.csdraw');
  const counts = await a.transfer.exportTo(out, 'senha-forte-123');
  assert.deepEqual(counts, { drawings: 1, playbooks: 1, folders: 1, media: 1, demos: 1 });
  const fileBytes = await fs.readFile(out);
  assert.ok(!fileBytes.includes(Buffer.from('Desenho')) && !fileBytes.includes(bytes.subarray(0, 32)), 'nada em claro');
  await assert.rejects(() => a.transfer.exportTo(out + '2', 'curta'), /pelo menos/);

  const b = await createVault(await tmp());
  await assert.rejects(() => b.transfer.importFrom(out, 'senha-errada-999'), /Senha incorreta/);
  const result = await b.transfer.importFrom(out, 'senha-forte-123', 'merge');
  assert.deepEqual(result, { drawings: 1, playbooks: 1, folders: 1, media: 1, demos: 1 });
  assert.equal(b.demoLibrary.list().length, 1);
  assert.equal((await b.demoLibrary.open(demoEntry.id)).rounds.length, 3, 'demo volta funcionando');
  assert.equal(b.drawings.get(drawing.id).stickers[0].images[0].caption, 'cap');
  assert.equal(b.playbooks.get(playbook.id).name, 'PB');
  assert.ok((await b.blobStore.getBuffer(added[0].id)).equals(bytes));
  assert.ok(await b.blobStore.exists(sticker.id));

  // importar de novo (merge) nao duplica
  await b.transfer.importFrom(out, 'senha-forte-123', 'merge');
  assert.equal(b.drawings.list().length, 1);

  // replace apaga o que nao estava no arquivo
  await b.drawings.save({ name: 'Extra', mapSlug: 'nuke', notes: '', thumbnail: '', strokes: [], stickers: [] });
  assert.equal(b.drawings.list().length, 2);
  await b.transfer.importFrom(out, 'senha-forte-123', 'replace');
  assert.equal(b.drawings.list().length, 1);

  // arquivo adulterado e arquivo qualquer
  const tampered = Buffer.from(fileBytes);
  tampered[tampered.length - 20] ^= 1;
  const tamperedPath = out + '.bad';
  await fs.writeFile(tamperedPath, tampered);
  await assert.rejects(() => b.transfer.importFrom(tamperedPath, 'senha-forte-123'), /Senha incorreta ou arquivo corrompido/);
  await fs.writeFile(tamperedPath, 'qualquer coisa que nao e um cofre, com mais de trinta bytes!!');
  await assert.rejects(() => b.transfer.importFrom(tamperedPath, 'x'), /não é um arquivo de cofre/);
});

test('biblioteca de demos: demo lida por outra versao do leitor (demoparser2) e reanalisada; a versao fica gravada mesmo apos recarregar', async () => {
  const dir = await tmp();
  const v = await createVault(dir);
  const analysisService = { analyze: async () => new DemoAnalyzer(createFakeEngine({ perSide: 2 })).analyze('x.dem') };
  const library = (parserVersion) => new DemoLibraryService({ demoRepository: v.demoRepository, blobStore: v.blobStore, analysisService, parserVersion });
  const demoFile = path.join(dir, 'partida.dem');
  await fs.writeFile(demoFile, 'conteudo');

  const first = await library('0.42.2').import(demoFile);
  assert.equal(first.entry.parserVersion, '0.42.2');
  assert.equal((await library('0.42.2').import(demoFile)).duplicate, true, 'mesmo leitor: continua duplicata');
  assert.equal((await library(null).import(demoFile)).duplicate, true, 'versao do leitor desconhecida: so a versao da analise decide');

  const upgraded = await library('0.42.3').import(demoFile);
  assert.deepEqual([upgraded.duplicate, upgraded.upgraded], [false, true], 'leitor novo: reanalisa');
  assert.equal(upgraded.entry.id, first.entry.id, 'no mesmo registro');
  assert.equal(upgraded.entry.parserVersion, '0.42.3');
  assert.equal(v.demoLibrary.list().length, 1);

  // o campo sobrevive ao salvar e recarregar o cofre (o validador do repositorio o preservaria?)
  const reloaded = new LibraryStore(v.blobStore);
  await reloaded.load();
  assert.equal(new DemoRepository(reloaded).all()[0].parserVersion, '0.42.3');
  assert.equal((await library('0.42.3').import(demoFile)).duplicate, true);

  // demo antiga, sem versao do leitor gravada: vale como "outro leitor"
  await v.demoRepository.update(first.entry.id, { parserVersion: undefined });
  assert.equal((await library('0.42.3').import(demoFile)).upgraded, true);
});
