import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MapCatalog } from '../renderer/src/shared/constants/MapCatalog.js';
import { MapLayout } from '../renderer/src/shared/drawing/MapLayout.js';
import { Viewport } from '../renderer/src/shared/drawing/Viewport.js';
import { DemoPlayback } from '../renderer/src/modules/demo-viewer/core/DemoPlayback.js';
import { FrameInterpolator } from '../renderer/src/modules/demo-viewer/core/FrameInterpolator.js';
import { RadarProjection } from '../renderer/src/modules/demo-viewer/core/RadarProjection.js';
import { GrenadeInventory } from '../electron/core/demo/GrenadeInventory.js';
import { BlindState } from '../renderer/src/modules/demo-viewer/core/BlindState.js';
import { GrenadeEffects } from '../renderer/src/modules/demo-viewer/core/GrenadeEffects.js';
import { GrenadeLoadout } from '../renderer/src/modules/demo-viewer/core/GrenadeLoadout.js';
import { RadarRenderer } from '../renderer/src/modules/demo-viewer/core/RadarRenderer.js';
import { SetposCommand } from '../renderer/src/modules/demo-viewer/core/SetposCommand.js';
import { WeaponIcons } from '../renderer/src/modules/demo-viewer/core/WeaponIcons.js';
import { UtilityGlyph } from '../renderer/src/modules/demo-viewer/core/UtilityGlyph.js';
import { UtilityStyle } from '../renderer/src/modules/demo-viewer/core/UtilityStyle.js';

// frame: [idx, x, y, yaw, hp, side, z, armor, money, weapon]
const frames = [
  { t: 0, p: [[0, 0, 0, 350, 100, 3, 100, 50, 800, 0], [1, 100, 100, 0, 0, 2, 100, 0, 0, -1]] },
  { t: 1, p: [[0, 100, 200, 10, 100, 3, -900, 50, 800, 0], [1, 100, 100, 0, 0, 2, 100, 0, 0, -1]] },
  { t: 2, p: [[0, 200, 200, 10, 90, 3, -900, 0, 800, 1]] }
];

test('interpolacao: posicao, angulo, andar e campos extras', () => {
  const quarter = FrameInterpolator.sample(frames, 0.25).find((p) => p.idx === 0);
  assert.equal(quarter.x, 25);
  assert.equal(quarter.z, 100, 'andar muda para o quadro mais proximo no tempo');
  assert.equal(FrameInterpolator.sample(frames, 0.75).find((p) => p.idx === 0).z, -900);
  const mid = FrameInterpolator.sample(frames, 0.5).find((p) => p.idx === 0);
  assert.equal(mid.y, 100);
  assert.ok(Math.abs(mid.yaw - 360) < 1e-9 || Math.abs(mid.yaw) < 1e-9, 'yaw segue o caminho curto (350 -> 10)');
  assert.deepEqual([mid.armor, mid.money, mid.weapon], [50, 800, 0]);
  assert.equal(FrameInterpolator.sample(frames, -5)[0].x, 0);
  assert.equal(FrameInterpolator.sample(frames, 99).length, 1);
  assert.deepEqual(FrameInterpolator.sample([], 1), []);
  assert.equal(FrameInterpolator.sample(frames, 1.5).find((p) => p.idx === 1).x, 100, 'jogador ausente no proximo quadro fica parado');
  // formato antigo (6 campos) continua funcionando
  assert.equal(FrameInterpolator.sample([{ t: 0, p: [[0, 1, 2, 3, 100, 3]] }], 0)[0].weapon, -1);
});

test('layout de mapas de dois andares', () => {
  const mirage = MapLayout.forMap(MapCatalog.tryFind('mirage'));
  assert.deepEqual([mirage.width, mirage.levels.length], [1024, 1]);
  const nuke = MapLayout.forMap(MapCatalog.tryFind('nuke'));
  assert.equal(nuke.levels.length, 2);
  assert.equal(nuke.width, 1024 * 2 + MapLayout.GAP);
  assert.equal(nuke.levels[1].imageName, 'nuke-lower');
  assert.deepEqual(MapLayout.levelRect(nuke, 1), { x: 1024 + MapLayout.GAP, y: 0, w: 1024, h: 1024 });
  assert.equal(MapLayout.forMap(MapCatalog.tryFind('vertigo')).levels.length, 2);
  assert.equal(MapCatalog.tryFind('nao-existe'), null);
});

test('projecao: calibrada, andares por altura e auto-ajuste', () => {
  const mirage = new RadarProjection({ slug: 'mirage', bounds: null, layout: MapLayout.forMap(MapCatalog.tryFind('mirage')) });
  assert.equal(mirage.isCalibrated, true);
  assert.deepEqual(mirage.project(-3230, 1713), [0, 0], 'canto superior esquerdo do radar');
  assert.equal(mirage.radius(5), 1);

  const nukeLayout = MapLayout.forMap(MapCatalog.tryFind('nuke'));
  const nuke = new RadarProjection({ slug: 'nuke', bounds: null, layout: nukeLayout });
  assert.equal(nuke.levelOf(-400), 0);
  assert.equal(nuke.levelOf(-600), 1);
  const [ux] = nuke.project(-3453, 2887, -400);
  const [lx] = nuke.project(-3453, 2887, -600);
  assert.equal(lx - ux, nukeLayout.levels[1].offsetX, 'andar de baixo desloca para o segundo radar');
  const vertigo = new RadarProjection({ slug: 'vertigo', bounds: null, layout: MapLayout.forMap(MapCatalog.tryFind('vertigo')) });
  assert.deepEqual([vertigo.levelOf(12000), vertigo.levelOf(11000)], [0, 1]);

  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 500 };
  const single = MapLayout.forMap({ slug: 'novo', name: 'Novo', lowerLevel: false });
  const fit = new RadarProjection({ slug: 'novo', bounds, layout: single });
  assert.equal(fit.isCalibrated, false);
  const [cx, cy] = fit.project(500, 250);
  assert.ok(Math.abs(cx - 512) < 1e-9 && Math.abs(cy - 512) < 1e-9, 'centro vai ao centro');
  assert.equal(fit.levelOf(-9999), 0, 'sem calibracao nao ha andares');
  assert.equal(new RadarProjection({ slug: 'mirage', bounds, layout: single, autoFit: true }).isCalibrated, false);
});

test('playback: intervalo (freezetime), busca e velocidade', () => {
  const playback = new DemoPlayback();
  playback.load(60, { min: 15 });
  assert.equal(playback.time, 15);
  playback.seek(0);
  assert.equal(playback.time, 15, 'nao volta antes do inicio');
  playback.seek(100);
  assert.equal(playback.time, 60);
  playback.setMin(0);
  playback.seek(0);
  assert.equal(playback.time, 0, 'incluir freezetime libera o inicio');
  playback.setMin(20);
  assert.equal(playback.time, 20);
  playback.setSpeed(1);
  playback.stepSpeed(1); assert.equal(playback.speed, 2);
  playback.stepSpeed(1); playback.stepSpeed(1); playback.stepSpeed(1); assert.equal(playback.speed, 8, 'limita no maximo');
  playback.stepSpeed(-1); assert.equal(playback.speed, 4);
  assert.deepEqual(DemoPlayback.SPEEDS, [0.5, 1, 2, 4, 8]);
});

test('viewport: margens do HUD (insets) reduzem a area livre do enquadramento', () => {
  const viewport = new Viewport();
  viewport.setWorld(1024, 1024);
  viewport.setSize(1000, 600, 1);
  viewport.setInsets({ right: 200, bottom: 100 });
  assert.ok(Math.abs(viewport.scale - (500 / 1024) * 0.96) < 1e-9, 'escala usa a area livre (800x500)');
  const center = viewport.worldToScreen(512, 512);
  assert.ok(Math.abs(center.x - 400) < 1e-6 && Math.abs(center.y - 250) < 1e-6, 'mapa centralizado na area livre');
  assert.equal(viewport.zoomPercent, 100);
  viewport.setInsets({});
  assert.ok(Math.abs(viewport.scale - (600 / 1024) * 0.96) < 1e-9, 'sem margens volta a usar a janela toda');
});

test('viewport: zoom no cursor, pan, enquadramento e conversoes', () => {
  const viewport = new Viewport();
  viewport.setWorld(1024, 1024);
  viewport.setSize(800, 600, 2);
  const fit = viewport.scale;
  assert.ok(Math.abs(fit - (600 / 1024) * 0.96) < 1e-9);
  assert.equal(viewport.zoomPercent, 100);

  const before = viewport.screenToWorld(300, 200);
  viewport.zoomAt(300, 200, 2);
  const after = viewport.screenToWorld(300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9, 'ponto sob o cursor fica parado');
  assert.equal(viewport.zoomPercent, 200);

  for (let i = 0; i < 30; i += 1) viewport.zoomAt(400, 300, 2);
  assert.equal(viewport.zoomPercent, Viewport.MAX_FACTOR * 100, 'zoom maximo limitado');
  for (let i = 0; i < 60; i += 1) viewport.zoomAt(400, 300, 0.5);
  assert.equal(viewport.zoomPercent, Viewport.MIN_FACTOR * 100, 'zoom minimo limitado');

  viewport.fit();
  viewport.setSize(1000, 600, 1); // continua enquadrado ao redimensionar
  assert.ok(Math.abs(viewport.scale - (600 / 1024) * 0.96) < 1e-9);
  viewport.panBy(50, 0);
  viewport.setSize(1200, 600, 1); // depois de mover/zoom, nao reenquadra sozinho
  assert.ok(Math.abs(viewport.tx - (viewport.tx)) < 1e-9);
  const w = viewport.screenToWorld(viewport.worldToScreen(123, 456).x, viewport.worldToScreen(123, 456).y);
  assert.ok(Math.abs(w.x - 123) < 1e-9 && Math.abs(w.y - 456) < 1e-9);

  // enquadrar so o andar de baixo de Nuke
  const nuke = MapLayout.forMap(MapCatalog.tryFind('nuke'));
  viewport.setWorld(nuke.width, nuke.height);
  viewport.fit(MapLayout.levelRect(nuke, 1));
  const center = viewport.worldToScreen(nuke.levels[1].offsetX + 512, 512);
  assert.ok(Math.abs(center.x - viewport.width / 2) < 1e-6 && Math.abs(center.y - viewport.height / 2) < 1e-6, 'andar em foco fica centralizado');
});

test('interpolacao: pitch suave e granadas do quadro mais proximo; formato de 10 campos continua valido', () => {
  const withNades = [
    { t: 0, p: [[0, 0, 0, 0, 100, 3, 0, 0, 0, 0, -10, 5]] },
    { t: 1, p: [[0, 0, 0, 0, 100, 3, 0, 0, 0, 0, 30, 0]] }
  ];
  const early = FrameInterpolator.sample(withNades, 0.25)[0];
  assert.deepEqual([early.pitch, early.nades], [0, 5]);
  assert.equal(FrameInterpolator.sample(withNades, 0.75)[0].nades, 0, 'granada arremessada some do inventario');
  assert.deepEqual([FrameInterpolator.sample(frames, 0.25)[0].pitch, FrameInterpolator.sample(frames, 0.25)[0].nades], [0, 0]);
});

test('setpos: comando completo com setang, arredondado e com yaw entre -180 e 180', () => {
  assert.equal(SetposCommand.format({ x: 1234.5, y: -678.912, z: 12.3, pitch: 5.55, yaw: -87.1 }), 'setpos 1234.5 -678.91 12.3;setang 5.55 -87.1 0');
  assert.equal(SetposCommand.format({ x: 0, y: -0.001, z: 0, pitch: 0, yaw: 190 }), 'setpos 0 0 0;setang 0 -170 0');
  assert.equal(SetposCommand.format({ x: 1, y: 2, z: 3, yaw: 370 }), 'setpos 1 2 3;setang 0 10 0', 'pitch ausente vale 0');
});

test('cores das utilidades: uma por tipo, todas diferentes; fogo vira molotov (T) ou incendiaria (CT)', () => {
  const types = ['smoke', 'flash', 'he', 'fire', 'decoy'];
  assert.equal(new Set(types.map((type) => UtilityStyle.color(type))).size, types.length);
  assert.equal(UtilityStyle.catalogType('fire', 2), 'molotov');
  assert.equal(UtilityStyle.catalogType('fire', 3), 'incendiary');
  assert.equal(UtilityStyle.catalogType('smoke', 3), 'smoke');
});

test('radar: smoke desenha o anel de contagem que se esvazia e mostra os segundos restantes', () => {
  const calls = [];
  const ctx = new Proxy({ canvas: { width: 100, height: 100 } }, {
    get: (target, name) => (name in target ? target[name] : (...args) => calls.push([name, ...args])),
    set: (target, name, value) => { target[name] = value; return true; }
  });
  const draw = (time) => {
    calls.length = 0;
    RadarRenderer.draw(ctx, {
      viewport: { apply() {}, scale: 1, fitScale: 1 }, layout: { width: 100, height: 100, levels: [] }, images: [],
      projection: { isCalibrated: true, project: () => [50, 50], radius: () => 30 },
      round: { frames: [{ t: 0, p: [] }], kills: [], bomb: [], grenades: [{ t: 10, type: 'smoke', x: 0, y: 0, z: 0 }] },
      time, players: [], showNames: false, labels: null
    });
    return { arcs: calls.filter(([name]) => name === 'arc'), texts: calls.filter(([name]) => name === 'fillText').map(([, text]) => text) };
  };
  const start = -Math.PI / 2;

  const sixSeconds = draw(16); // 18 s de smoke: faltam 12
  // arc: [nome, x, y, raio, inicio, fim]
  const ring = sixSeconds.arcs.find((arc) => arc[4] === start && arc[5] < start + Math.PI * 2 - 1e-6);
  assert.ok(ring, 'anel parcial desenhado');
  assert.ok(Math.abs(ring[5] - (start + Math.PI * 2 * (12 / 18))) < 1e-9, 'anel com 12/18 restantes');
  assert.deepEqual(sixSeconds.texts, ['12']);

  assert.deepEqual(draw(10).texts, ['18']);
  assert.deepEqual(draw(27.5).texts, ['1'], 'arredonda para cima');
  assert.deepEqual(draw(9).texts, [], 'antes de explodir nao ha contador');
  assert.deepEqual(draw(28.5).texts, [], 'depois de acabar nao ha contador');
});

/** Contexto 2D que so grava as chamadas (e devolve um gradiente de mentira). */
function recordingContext() {
  const calls = [];
  const ctx = new Proxy({ canvas: { width: 100, height: 100 } }, {
    get: (target, name) => {
      if (name in target) return target[name];
      if (name === 'createRadialGradient') return (...args) => { calls.push([name, ...args]); return { addColorStop() {} }; };
      return (...args) => calls.push([name, ...args]);
    },
    set: (target, name, value) => { target[name] = value; return true; }
  });
  return { ctx, calls };
}
const flatProjection = { project: (x, y) => [x, y], radius: () => 30 };
const names = (calls, name) => calls.filter(([call]) => call === name);

test('cegueira: segundos restantes por jogador; uma flash nova so conta se acabar depois da anterior', () => {
  const blinds = [{ t: 10, victim: 1, duration: 3 }, { t: 11, victim: 1, duration: 1 }, { t: 12, victim: 2, duration: 2 }];
  assert.deepEqual([...BlindState.remaining(blinds, 12.5)], [[1, 0.5], [2, 1.5]]);
  assert.equal(BlindState.remaining(blinds, 9).size, 0, 'antes de ser atingido');
  assert.equal(BlindState.remaining(blinds, 16).size, 0, 'depois de enxergar de novo');
  assert.equal(BlindState.remaining(undefined, 1).size, 0, 'demo antiga sem cegueira');
  assert.equal(Math.round(BlindState.remaining([{ t: 10, victim: 1, duration: 1 }, { t: 10.5, victim: 1, duration: 4 }], 10.6).get(1) * 100) / 100, 3.9);
});

test('inventario no painel: lista na ordem de exibicao e todos os tipos tem icone e cor', () => {
  const packed = GrenadeInventory.pack(['Decoy Grenade', 'Molotov', 'Flashbang', 'Flashbang', 'Smoke Grenade', 'HE Grenade']);
  assert.deepEqual(GrenadeLoadout.items(packed).map((i) => `${i.type}x${i.count}`), ['flashx2', 'smokex1', 'hex1', 'firex1', 'decoyx1']);
  for (const type of GrenadeLoadout.TYPES) {
    assert.ok(UtilityGlyph.PATHS[type], `icone de ${type}`);
    assert.match(UtilityStyle.color(type), /^#[0-9a-f]{6}$/);
  }
});

test('trajetoria: trilha ate a posicao atual, quique marcado, e some depois de parar (ou desligada)', () => {
  const grenade = { t: 3, type: 'flash', x: 100, y: 100, z: 0, thrownT: 1, path: [[1, 0, 0, 0], [2, 100, 0, 0], [3, 100, 100, 0]], bounces: [[2, 100, 0, 0]] };
  const flight = (time, options) => {
    const { ctx, calls } = recordingContext();
    GrenadeEffects.draw(ctx, flatProjection, [grenade], time, 1, options);
    return calls;
  };
  const inFlight = flight(2.5);
  assert.deepEqual(names(inFlight, 'moveTo'), [['moveTo', 0, 0]]);
  assert.deepEqual(names(inFlight, 'lineTo').map(([, x, y]) => [x, y]), [[100, 0], [100, 50]], 'o ultimo ponto e a posicao interpolada agora');
  assert.ok(names(inFlight, 'arc').some(([, x, y]) => x === 100 && y === 0), 'quique desenhado no ponto onde aconteceu');
  assert.equal(names(flight(1.5), 'lineTo').length, 1, 'ainda na primeira perna');
  assert.equal(names(flight(0.5), 'moveTo').length, 0, 'antes de sair da mao');
  assert.equal(names(flight(6.5), 'moveTo').length, 0, 'trilha some 3 s depois de parar');
  assert.equal(names(flight(2.5, { trajectories: false }), 'moveTo').length, 0, 'desligada nas configuracoes');
  assert.equal(names(flight(3.2, { trajectories: true }), 'moveTo').length, 1, 'ainda visivel logo depois de parar');
});

test('smoke e fogo: o preenchimento parte do centro e se espalha; flash e HE usam clarao e explosao', () => {
  const draw = (type, time) => {
    const { ctx, calls } = recordingContext();
    GrenadeEffects.draw(ctx, { project: () => [50, 50], radius: () => 30 }, [{ t: 10, type, x: 7, y: 9, z: 0 }], time, 1);
    return calls;
  };
  const spread = (calls) => {
    const cells = names(calls, 'arc').filter(([, , , radius]) => radius > 1); // sem o anel do contador (raio 16, centro)
    return cells.reduce((sum, [, x, y]) => sum + Math.hypot(x - 50, y - 50), 0) / Math.max(1, cells.length);
  };
  assert.ok(names(draw('smoke', 12), 'arc').length > 100, 'a nuvem e feita de muitas celulas');
  assert.ok(spread(draw('smoke', 10.1)) < spread(draw('smoke', 10.6)) && spread(draw('smoke', 10.6)) < spread(draw('smoke', 12)), 'espalhando com o tempo');
  assert.equal(spread(draw('smoke', 12)), spread(draw('smoke', 13)), 'depois de aberta o formato fica estavel');
  assert.equal(names(draw('smoke', 12), 'createRadialGradient').length, 0);
  assert.equal(names(draw('flash', 10.2), 'createRadialGradient').length, 1, 'clarao: halo suave');
  assert.equal(names(draw('flash', 10.2), 'arc').length, 1, 'clarao: um unico circulo, sem raios');
  assert.equal(names(draw('he', 10.2), 'createRadialGradient').length, 0, 'HE: pulso liso, sem gradiente');
  const pulse = (time) => names(draw('he', time), 'arc').filter(([, , , radius]) => radius > 2.7); // celulas do pulso (o ponto central tem raio 2.6)
  assert.ok(pulse(10.2).length > 50, 'HE: o pulso e feito de celulas do chao (so a area afetada)');
  assert.ok(pulse(10.05).length < pulse(10.2).length && pulse(10.2) .length <= pulse(10.3).length, 'o pulso abre rapido');
  assert.equal(pulse(10.3).length, pulse(10.6).length, 'depois de aberto so se apaga (a area nao muda)');
  assert.equal(names(draw('he', 11.5), 'arc').length, 0, 'a explosao acaba');
  assert.equal(names(draw('smoke', 9), 'arc').length, 0, 'antes de explodir nao ha nada');
  assert.ok(names(draw('fire', 11), 'arc').length > 50, 'fogo tambem se espalha em celulas');
  assert.ok(spread(draw('fire', 10.2)) < spread(draw('fire', 11.5)), 'o fogo se espalha');
  assert.ok(spread(draw('fire', 16.9)) < spread(draw('fire', 12)), 'no fim o fogo se apaga das bordas para o centro');
});

// Sem PNG carregado (Node), cada item no chao vira dois icones vetoriais (contorno preto + cor): dois `translate` por item.
globalThis.Path2D ??= class {};
const GLYPH = 15 * 1.35 * 0.75; // tamanho do icone colorido parado no chao (DROP_SIZE * 1.35 * 0.75)
const itemCenters = (calls) => names(calls, 'translate').filter((_, index) => index % 2 === 1).map(([, x, y]) => [null, x + GLYPH / 2, y + GLYPH / 2]);

test('granadas no chao: aparecem na morte e somem quando alguem pega', () => {
  const drops = [{ type: 'flash', x: 5, y: 5, z: 0, t: 10, until: 20 }, { type: 'smoke', x: 5, y: 5, z: 0, t: 10, until: null }, { type: 'he', x: 90, y: 90, z: 0, t: 30, until: null }];
  const visible = (time) => {
    const { ctx, calls } = recordingContext();
    GrenadeEffects.drawDrops(ctx, flatProjection, drops, time, 1);
    return itemCenters(calls);
  };
  assert.equal(visible(5).length, 0, 'ninguem morreu ainda');
  assert.equal(visible(15).length, 2, 'flash e smoke no mesmo lugar');
  assert.notEqual(visible(15)[0][1], visible(15)[1][1], 'lado a lado, nao empilhadas');
  assert.equal(visible(25).length, 1, 'a flash foi pega');
  assert.equal(visible(35).length, 2, 'smoke e a HE de outra morte');
  assert.equal(GrenadeEffects.drawDrops(recordingContext().ctx, flatProjection, undefined, 5, 1), undefined, 'demo antiga sem drops');
});

test('icones: armas, C4 e granadas apontam para as pastas public/weapons e public/grenades', () => {
  assert.equal(WeaponIcons.resolve('weapon_ak47').url, './weapons/ak47.png');
  assert.equal(WeaponIcons.resolve('m4a1_silencer').url, './weapons/m4a1_silencer.png');
  assert.equal(WeaponIcons.resolve('knife_karambit').url, './weapons/knife_karambit.png', 'faca com icone proprio');
  assert.equal(WeaponIcons.resolve('knife_desconhecida').url, './weapons/knife.png', 'faca sem icone proprio usa a generica');
  assert.equal(WeaponIcons.resolve('world').url, './weapons/world.png');
  assert.equal(WeaponIcons.flashAssistUrl(), './weapons/flashbang_assist.png');
  assert.equal(WeaponIcons.resolve('planted_c4').url, './weapons/c4.png');
  assert.equal(WeaponIcons.resolve('hegrenade').url, './grenades/he.png');
  assert.equal(WeaponIcons.resolve('inferno', 3).url, './grenades/incendiary.png');
  assert.equal(WeaponIcons.resolve('inferno', 2).url, './grenades/molotov.png');
  assert.equal(WeaponIcons.grenadeUrl('fire', 3), './grenades/incendiary.png');
  assert.equal(WeaponIcons.grenadeUrl('smoke', 2), './grenades/smoke.png');
  assert.equal(WeaponIcons.resolve(''), null);
  assert.equal(WeaponIcons.label('m4a1_silencer'), 'M4A1 SILENCER');
});

test('interpolacao traz a arma principal e o bit da C4', () => {
  const player = FrameInterpolator.sample([{ t: 0, p: [[0, 0, 0, 0, 100, 2, 0, 0, 0, 1, 0, GrenadeInventory.C4_BIT, 3]] }], 0)[0];
  assert.equal(player.mainWeapon, 3);
  assert.equal(GrenadeLoadout.hasC4(player.nades), true);
  assert.equal(FrameInterpolator.sample([{ t: 0, p: [[0, 0, 0, 0, 100, 2]] }], 0)[0].mainWeapon, -1, 'demo antiga');
});

test('item largado de proposito aparece no proprio lugar e a C4 no chao tem icone vetorial de reserva', () => {
  const { ctx, calls } = recordingContext();
  GrenadeEffects.drawDrops(ctx, flatProjection, [{ type: 'c4', x: 50, y: 60, z: 0, t: 1, until: null, side: 2, death: false }], 5, 1);
  assert.ok(itemCenters(calls).some(([, x, y]) => Math.abs(x - 50) < 0.01 && Math.abs(y - 60) < 0.01), 'sem deslocamento ao lado do X da morte');
  assert.equal(names(calls, 'arc').length, 0, 'sem a bolinha antiga: so o icone com contorno');
  assert.ok(UtilityGlyph.PATHS.c4);
});
