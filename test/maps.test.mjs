import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MapCatalog } from '../renderer/src/shared/constants/MapCatalog.js';
import { CalibrationFit } from '../renderer/src/modules/demo-viewer/core/CalibrationFit.js';
import { MapCalibration } from '../renderer/src/modules/demo-viewer/core/MapCalibration.js';
import { RadarProjection } from '../renderer/src/modules/demo-viewer/core/RadarProjection.js';
import { MapLayout } from '../renderer/src/shared/drawing/MapLayout.js';

const PUBLIC = new URL('../renderer/public/', import.meta.url);
const size = (file) => { const data = readFileSync(file); return { signature: data.subarray(1, 4).toString(), width: data.readUInt32BE(16), height: data.readUInt32BE(20) }; };

test('radares instalados: todos PNG 1024x1024; mapas calibrados e de dois andares tem as imagens', () => {
  const radars = readdirSync(new URL('maps/', PUBLIC)).filter((name) => name.endsWith('.png'));
  assert.ok(radars.length >= 30, 'radares vem instalados');
  for (const name of radars) assert.deepEqual(size(new URL(`maps/${name}`, PUBLIC)), { signature: 'PNG', width: 1024, height: 1024 }, name);
  for (const slug of Object.keys(MapCalibration.KNOWN)) assert.ok(existsSync(new URL(`maps/${slug}.png`, PUBLIC)), `radar de ${slug}`);
  const twoLevels = MapCatalog.MAPS.filter((map) => map.lowerLevel);
  assert.deepEqual(twoLevels.map((map) => map.slug).sort(), ['baggage', 'nuke', 'vertigo']);
  for (const map of twoLevels) {
    assert.ok(existsSync(new URL(`maps/${map.slug}.png`, PUBLIC)) && existsSync(new URL(`maps/${map.slug}-lower.png`, PUBLIC)), `dois andares de ${map.slug}`);
    assert.equal(MapLayout.forMap(map).levels[1].imageName, `${map.slug}-lower`);
  }
  assert.ok(Object.keys(MapCalibration.LOWER_LEVEL_MAX_Z).every((slug) => MapCatalog.tryFind(slug)?.lowerLevel));
});

test('icones dos mapas instalados (miniaturas) e slugs unicos no catalogo', () => {
  const icons = readdirSync(new URL('mapicons/', PUBLIC)).filter((name) => name.endsWith('.png'));
  assert.ok(icons.length >= 40);
  for (const name of icons) assert.equal(size(new URL(`mapicons/${name}`, PUBLIC)).signature, 'PNG', name);
  for (const slug of ['dust2', 'mirage', 'inferno', 'nuke', 'vertigo', 'ancient', 'anubis', 'overpass', 'train', 'cache']) assert.ok(icons.includes(`${slug}.png`), `icone de ${slug}`);
  assert.equal(MapCatalog.iconUrl('dust2'), './mapicons/dust2.png');
  assert.equal(MapCatalog.radarUrl('dust2'), './maps/dust2.png');
  const slugs = MapCatalog.MAPS.map((map) => map.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(MapCatalog.MAPS.every((map) => MapCatalog.GROUPS[map.group]));
});

/** Radar sintetico (512x512, celula de 2 px como no app) com corredores e salas assimetricos. */
function syntheticMask() {
  const n = 512;
  const k = 4;
  const cells = new Uint8Array(n * n);
  const fill = (x0, y0, x1, y1) => { for (let y = y0 * k; y < y1 * k; y += 1) for (let x = x0 * k; x < x1 * k; x += 1) cells[y * n + x] = 1; };
  fill(10, 10, 60, 30); fill(40, 30, 55, 100); fill(40, 85, 118, 100); fill(100, 40, 118, 100); fill(10, 60, 40, 75); fill(70, 10, 90, 22);
  return { size: n, cells, cell: 1024 / n };
}

test('alinhamento pela imagem: recupera escala e deslocamento a partir de posicoes que nao cobrem o mapa todo', () => {
  const mask = syntheticMask();
  const truth = { x: -1500, y: 2000, scale: 5 };
  const points = [];
  for (let cy = 0; cy < mask.size; cy += 1) {
    for (let cx = 0; cx < mask.size; cx += 1) {
      if (!mask.cells[cy * mask.size + cx] || (cx + cy) % 12 !== 0) continue;
      const px = cx * mask.cell + mask.cell / 2;
      const py = cy * mask.cell + mask.cell / 2;
      // os jogadores nunca vao as pontas: o enquadramento puro erraria a escala
      if (px < 110 || px > 880 || py < 110 || py > 780) continue;
      points.push({ x: truth.x + px * truth.scale, y: truth.y - py * truth.scale, z: 0 });
    }
  }
  const fit = CalibrationFit.fit(mask, points);
  assert.ok(fit && fit.approximate === true);
  assert.ok(Math.abs(fit.scale - truth.scale) / truth.scale < 0.05, `escala ${fit.scale}`);
  const projected = new RadarProjection({ slug: 'x', layout: MapLayout.forMap({ slug: 'x', name: 'x' }), calibration: fit });
  assert.equal(projected.isCalibrated && projected.isApproximate, true);
  const errors = points.map((p) => { const [px, py] = projected.project(p.x, p.y, 0); const tx = (p.x - truth.x) / truth.scale; const ty = (truth.y - p.y) / truth.scale; return Math.hypot(px - tx, py - ty); });
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  assert.ok(mean < 14, `erro medio de ${mean.toFixed(1)} px do radar`);
  assert.ok(CalibrationFit.score(mask, points, fit) > 0.97);
  assert.ok(CalibrationFit.score(mask, points, { x: truth.x + 2000, y: truth.y, scale: truth.scale }) < 0.5, 'calibracao deslocada erra o chao');
  assert.equal(CalibrationFit.score(null, points, truth), 0);
  assert.equal(CalibrationFit.fit(null, points), null);
  assert.equal(CalibrationFit.fit(mask, points.slice(0, 5)), null, 'poucas posicoes');
  assert.equal(CalibrationFit.fit(mask, Array.from({ length: 50 }, () => ({ x: 1, y: 1, z: 0 }))), null, 'posicoes sem extensao');
});

test('posicoes da demo para o alinhamento: so vivos, limitadas em quantidade', () => {
  const frame = (alive) => ({ t: 0, p: [[0, 10, 20, 0, 100, 3, 5], [1, 30, 40, 0, alive ? 100 : 0, 2, 7]] });
  const demo = { rounds: [{ frames: Array.from({ length: 2000 }, () => frame(false)) }, { frames: [frame(true)] }] };
  const points = CalibrationFit.samples(demo);
  assert.ok(points.length <= CalibrationFit.MAX_POINTS + 1 && points.length > 1000);
  assert.ok(points.every((p) => p.x === 10 || p.x === 30));
  assert.deepEqual(CalibrationFit.samples({ rounds: [] }), []);
});

test('andar de baixo desconhecido: o corte vem das alturas (dois grupos claros) ou nao existe', () => {
  const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const random = rng(7);
  const two = [
    ...Array.from({ length: 300 }, () => ({ z: -200 + random() * 120 })),
    ...Array.from({ length: 200 }, () => ({ z: 420 + random() * 150 }))
  ];
  const cut = CalibrationFit.lowerLevelZ(two);
  assert.ok(cut > -80 && cut < 420, `corte ${cut}`);
  assert.equal(CalibrationFit.lowerLevelZ(Array.from({ length: 300 }, () => ({ z: random() * 100 }))), null, 'um andar so');
  assert.equal(CalibrationFit.lowerLevelZ([...Array.from({ length: 300 }, () => ({ z: 0 })), ...Array.from({ length: 4 }, () => ({ z: 900 }))]), null, 'grupo minusculo nao e um andar');
  assert.equal(CalibrationFit.lowerLevelZ([{ z: 1 }]), null);

  const layout = MapLayout.forMap(MapCatalog.tryFind('baggage'));
  const projection = new RadarProjection({ slug: 'baggage', layout, lowerZ: cut });
  assert.equal(projection.levelOf(-150), 1);
  assert.equal(projection.levelOf(500), 0);
  assert.equal(new RadarProjection({ slug: 'baggage', layout }).levelOf(-150), 0, 'sem corte nao divide os andares');
});
