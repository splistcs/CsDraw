import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoundBuilder } from '../electron/core/demo/RoundBuilder.js';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';
import { GrenadeInventory } from '../electron/core/demo/GrenadeInventory.js';
import { DropMotion } from '../renderer/src/modules/demo-viewer/core/DropMotion.js';
import { GrenadeEffects } from '../renderer/src/modules/demo-viewer/core/GrenadeEffects.js';
import { RadarRenderer } from '../renderer/src/modules/demo-viewer/core/RadarRenderer.js';
import { SpreadField } from '../renderer/src/modules/demo-viewer/core/SpreadField.js';
import { WalkMask } from '../renderer/src/modules/demo-viewer/core/WalkMask.js';
import { GrenadeLoadout } from '../renderer/src/modules/demo-viewer/core/GrenadeLoadout.js';
import { UtilityStyle } from '../renderer/src/modules/demo-viewer/core/UtilityStyle.js';
import { HeldItem } from '../renderer/src/modules/demo-viewer/core/HeldItem.js';
import { WeaponPrices } from '../renderer/src/modules/demo-viewer/core/WeaponPrices.js';
import { FrameInterpolator } from '../renderer/src/modules/demo-viewer/core/FrameInterpolator.js';
import { createFakeEngine, withInventory } from './helpers.mjs';

/** Contexto 2D que grava chamadas e atribuicoes (gradientes de mentira tem addColorStop). */
function recorder() {
  const calls = [];
  const sets = [];
  const ctx = new Proxy({ canvas: { width: 100, height: 100 } }, {
    get: (target, name) => {
      if (name in target) return target[name];
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return (...args) => { calls.push([name, ...args]); return { addColorStop() {} }; };
      return (...args) => calls.push([name, ...args]);
    },
    set: (target, name, value) => { sets.push([name, value]); target[name] = value; return true; }
  });
  return { ctx, calls, sets };
}
const arcs = (calls) => calls.filter(([name]) => name === 'arc');

/** Mascara `size` x `size` com chao onde `floor(cx, cy)` for verdadeiro (cada celula tem 1024/size pixels do radar). */
function maskOf(size, floor) {
  const cells = new Uint8Array(size * size);
  for (let cy = 0; cy < size; cy += 1) for (let cx = 0; cx < size; cx += 1) cells[cy * size + cx] = floor(cx, cy) ? 1 : 0;
  return { size, cells, cell: 1024 / size };
}

test('mascara de chao: transparente e escuro nao contam; andar de baixo ignora o cinza apagado', () => {
  const pixel = (r, g, b, a = 255) => [r, g, b, a];
  const build = (list) => Uint8ClampedArray.from(list.flat());
  // 2x2: piso colorido, vazio transparente, piso cinza medio, vazio quase preto
  const rgba = build([pixel(90, 120, 80), pixel(90, 120, 80, 0), pixel(70, 70, 70), pixel(18, 20, 24)]);
  assert.equal(WalkMask.fromPixels(rgba, 2).cells.join(''), '1010', 'o piso colorido e o cinza medio contam; transparente e preto nao');
  const big = (list) => build(Array.from({ length: 100 }, (_, i) => list[i % list.length]));
  const mixed = WalkMask.fromPixels(big([pixel(90, 120, 80), pixel(90, 120, 80, 0), pixel(70, 70, 70), pixel(18, 20, 24)]), 10, { strict: false });
  assert.deepEqual([...mixed.cells.slice(0, 4)], [1, 0, 1, 0], 'piso e piso cinza contam; transparente e preto nao');
  const lower = WalkMask.fromPixels(big([pixel(90, 120, 80), pixel(90, 120, 80, 0), pixel(40, 40, 42), pixel(18, 20, 24)]), 10, { strict: true });
  assert.deepEqual([...lower.cells.slice(0, 4)], [1, 0, 0, 0], 'o cinza escuro do resto do mapa nao e chao no andar de baixo');
  assert.equal(WalkMask.fromPixels(build(Array.from({ length: 100 }, () => pixel(0, 0, 0, 0))), 10), null, 'imagem sem chao: sem mascara (cai no circulo)');
  assert.equal(WalkMask.from(null), null);
  assert.equal(WalkMask.isFloor(null, 5, 5), true, 'sem mascara tudo vale');
  assert.equal(WalkMask.isFloor(mixed, -1, 5), false);
});

test('espalhamento: so pelo chao, contornando paredes (distancia pelo caminho); sem mascara preenche o circulo', () => {
  const size = 64; // celula de 16 px
  const wall = maskOf(size, (cx, cy) => !(cx === 32 && cy < 40)); // parede vertical com passagem embaixo (cy >= 40)
  const field = SpreadField.compute(wall, 24 * 16 + 8, 20 * 16 + 8, 300);
  assert.ok(field.length > 50);
  assert.ok(field.every((cell) => cell.x < 32 * 16), 'nada atravessa a parede (a passagem esta longe do alcance)');
  assert.ok(field.every((cell, index) => index === 0 || field[index - 1].d <= cell.d), 'ordenadas do centro para a borda');
  assert.equal(field[0].d, 0);
  assert.ok(field.every((cell) => cell.d <= 1));

  const open = maskOf(size, () => true);
  const free = SpreadField.compute(open, 24 * 16 + 8, 20 * 16 + 8, 300);
  assert.ok(free.some((cell) => cell.x > 32 * 16), 'sem parede a nuvem passa dali');
  assert.ok(free.length > field.length);

  const around = maskOf(size, (cx, cy) => !(cx === 32 && cy < 22)); // parede curta: da para dar a volta
  const detour = SpreadField.compute(around, 30 * 16 + 8, 10 * 16 + 8, 500);
  const behind = detour.find((cell) => Math.abs(cell.x - (34 * 16 + 8)) < 1 && Math.abs(cell.y - (10 * 16 + 8)) < 1);
  assert.ok(behind, 'alcanca o outro lado pela volta');
  assert.ok(behind.d > (4 * 16) / 500 + 0.2, 'a distancia pelo caminho e maior que a reta (4 celulas)');

  const disk = SpreadField.compute(null, 100, 100, 30);
  assert.ok(disk.length > 100 && disk.every((cell) => Math.hypot(cell.x - 100, cell.y - 100) <= 30 + 1e-9));

  const nowhere = maskOf(size, (cx) => cx > 60);
  assert.ok(SpreadField.compute(nowhere, 100, 100, 30).length > 0, 'sem chao por perto cai no circulo');
  const onCrate = maskOf(size, (cx, cy) => !(cx === 10 && cy === 10));
  assert.ok(SpreadField.compute(onCrate, 10 * 16 + 8, 10 * 16 + 8, 100).length > 5, 'granada parada em cima de um obstaculo acha o chao vizinho');
});

test('buracos da HE na smoke: so HE perto e durante a smoke; abre rapido e fecha aos poucos', () => {
  const smoke = { type: 'smoke', t: 10, x: 0, y: 0 };
  const options = { life: 18, smokeUnits: 144, holeUnits: 140 };
  const grenades = [
    smoke,
    { type: 'he', t: 12, x: 50, y: 0 },
    { type: 'he', t: 12, x: 900, y: 0 },
    { type: 'he', t: 5, x: 0, y: 0 },
    { type: 'he', t: 40, x: 0, y: 0 },
    { type: 'flash', t: 12, x: 0, y: 0 }
  ];
  assert.deepEqual(SpreadField.holes(smoke, grenades, options), [{ t: 12, x: 50, y: 0 }]);
  assert.equal(SpreadField.holeSize(-1), 0);
  assert.equal(SpreadField.holeSize(0.1), 0.5);
  assert.equal(SpreadField.holeSize(0.2), 1);
  assert.ok(SpreadField.holeSize(2) < 1 && SpreadField.holeSize(2) > SpreadField.holeSize(4));
  assert.equal(SpreadField.holeSize(5), 0);
});

test('smoke quebrada por HE: o buraco so afasta a fumaca (sem contorno) e fecha', () => {
  const projection = { project: (x, y) => [50 + x / 5, 50 - y / 5], radius: (units) => units / 5 };
  const smoke = { t: 10, type: 'smoke', x: 0, y: 0, z: 0 };
  const he = { t: 13, type: 'he', x: 0, y: 0, z: 0 };
  const draw = (time, grenades) => { const { ctx, calls } = recorder(); GrenadeEffects.draw(ctx, projection, grenades, time, 1); return calls; };
  const cellsAt = (calls) => arcs(calls).filter(([, , , radius]) => radius > 3 && radius < 8); // camada do miolo (celula * 1.3); o pontinho central do pulso da HE tem raio menor
  const whole = draw(14, [smoke]); // 1 s depois da HE: o pulso laranja (0,8 s) ja acabou e o buraco ainda esta aberto
  const broken = draw(14, [smoke, he]);
  assert.ok(cellsAt(broken).length < cellsAt(whole).length, 'celulas dentro do buraco somem');
  assert.ok(cellsAt(broken).every(([, x, y]) => Math.hypot(x - 50, y - 50) > 3), 'nada no centro do buraco');
  assert.equal(broken.some(([name]) => name === 'setLineDash'), false, 'o buraco nao tem contorno tracejado');
  assert.equal(cellsAt(draw(19, [smoke, he])).length, cellsAt(draw(19, [smoke])).length, 'depois de fechar a smoke volta inteira');
  assert.equal(cellsAt(draw(12, [smoke, he])).length, cellsAt(draw(12, [smoke])).length, 'antes da HE a smoke esta inteira');
});

test('smoke e fogo com mascara: nada fora do chao do radar, nem no outro andar', () => {
  const size = 512; // celula de 2 px, como no app
  const mask = maskOf(size, (cx) => cx < 256); // so a metade esquerda do radar tem chao
  const projection = { isCalibrated: true, project: (x, y) => [x, y], radius: () => 80, levelOf: () => 0, layout: { levels: [{ offsetX: 0 }] } };
  for (const type of ['smoke', 'fire']) {
    const { ctx, calls } = recorder();
    GrenadeEffects.draw(ctx, projection, [{ t: 0, type, x: 480, y: 500, z: 0 }], 3, 1, { masks: [mask] });
    const cells = arcs(calls).filter(([, , , radius]) => radius > 2 && radius < 5);
    assert.ok(cells.length > 20, `${type}: desenhou`);
    assert.ok(cells.every(([, x]) => x < 520), `${type}: parou na borda do chao (a margem e so o raio da bolinha)`);
  }
  // segundo andar: o efeito usa a mascara e o deslocamento do andar de baixo
  const two = { ...projection, levelOf: (z) => (z < 0 ? 1 : 0), project: (x, y, z) => [x + (z < 0 ? 1088 : 0), y], layout: { levels: [{ offsetX: 0 }, { offsetX: 1088 }] } };
  const { ctx, calls } = recorder();
  GrenadeEffects.draw(ctx, two, [{ t: 0, type: 'smoke', x: 200, y: 200, z: -900 }], 3, 1, { masks: [maskOf(size, () => false), maskOf(size, () => true)] });
  const cells = arcs(calls).filter(([, , , radius]) => radius > 2 && radius < 5);
  assert.ok(cells.length > 20 && cells.every(([, x]) => x > 1088), 'desenhado sobre o radar de baixo');
});

test('drops: o item voa ate onde parou (e fica onde parou); sem destino, fica onde foi largado', () => {
  const drop = { x: 0, y: 0, t: 10, toX: 100, toY: 0, fall: 1 };
  assert.deepEqual(DropMotion.at(drop, 9), { x: 0, y: 0, lift: 0 });
  const mid = DropMotion.at(drop, 10.5);
  assert.ok(mid.x > 50 && mid.x < 100, 'sai rapido e desacelera');
  assert.ok(mid.lift > 0.9, 'no meio do voo esta no ponto mais alto');
  assert.deepEqual(DropMotion.at(drop, 11), { x: 100, y: 0, lift: 0 });
  assert.deepEqual(DropMotion.at(drop, 60), { x: 100, y: 0, lift: 0 });
  assert.deepEqual(DropMotion.at({ x: 5, y: 6, t: 1 }, 5), { x: 5, y: 6, lift: 0 }, 'demo antiga');
  assert.deepEqual(DropMotion.rest(drop), { x: 100, y: 0 });
  assert.deepEqual(DropMotion.rest({ x: 5, y: 6 }), { x: 5, y: 6 });

  const { ctx, calls } = recorder();
  const projection = { project: (x, y) => [x, y] };
  // Sem PNG (Node) o item e um icone vetorial (2 translates: contorno e cor); no ar ha tambem o arco da sombra.
  globalThis.Path2D ??= class {};
  const at = (time) => { calls.length = 0; GrenadeEffects.drawDrops(ctx, projection, [{ type: 'smoke', x: 0, y: 0, z: 0, t: 10, until: 40, side: 2, death: false, toX: 100, toY: 0, fall: 1 }], time, 1); return { shadows: arcs(calls).length, xs: calls.filter(([name]) => name === 'translate').map(([, x]) => x).filter((_, i) => i % 2 === 1) }; };
  assert.equal(at(10.01).shadows, 1, 'sombra enquanto voa');
  assert.equal(at(12).shadows, 0, 'parado: sem sombra');
  assert.equal(at(12).xs.length, 1, 'parado: so o item');
  assert.ok(at(10.2).xs[0] < at(10.6).xs[0] && at(10.6).xs[0] < at(12).xs[0], 'acompanha o movimento');
  assert.ok(Math.abs(at(12).xs[0] + 15 * 1.35 * 0.75 / 2 - 100) < 0.01);
  assert.equal(at(41).xs.length, 0, 'some quando alguem pega');
});

test('cone de visao: o alcance cresce com o preco da arma na mao', () => {
  assert.equal(WeaponPrices.price('weapon_ak47'), 2700);
  assert.equal(WeaponPrices.price('awp'), 4750);
  assert.equal(WeaponPrices.price('knife'), 0);
  assert.equal(WeaponPrices.price('arma_inventada'), null);
  assert.equal(WeaponPrices.price('toString'), null, 'nao confunde com propriedades de Object');
  const knife = WeaponPrices.viewLength('knife');
  const glock = WeaponPrices.viewLength('glock');
  const ak = WeaponPrices.viewLength('ak47');
  const awp = WeaponPrices.viewLength('awp');
  const negev = WeaponPrices.viewLength('m249');
  assert.ok(knife < glock && glock < ak && ak < awp && awp < negev, 'mais cara, mais longe');
  assert.equal(WeaponPrices.viewLength(''), knife, 'arma desconhecida usa o alcance minimo');
  assert.equal(WeaponPrices.viewLength('m249'), 80);
  for (const name of Object.keys(WeaponPrices.TABLE)) assert.ok(WeaponPrices.TABLE[name] <= WeaponPrices.MAX, name);

  // forma do boneco pelo item na mao: faca = ponta triangular, arma = retangulo (cano mais longo para armas mais caras), granada = icone
  const shape = (weaponName) => {
    const { ctx, calls } = recorder();
    RadarRenderer.draw(ctx, {
      viewport: { apply() {}, scale: 1, fitScale: 1 }, layout: { width: 100, height: 100, levels: [] }, images: [],
      projection: { isCalibrated: true, project: () => [50, 50], radius: () => 30 },
      round: { frames: [{ t: 0, p: [[0, 0, 0, 90, 100, 3, 0, 0, 0, 0]] }], kills: [], bomb: [], grenades: [], blinds: [], sides: {} },
      time: 0, players: [{ name: 'a' }], weapons: [weaponName], showNames: false, labels: null
    });
    return calls;
  };
  const barrelOf = (name) => shape(name).find(([call]) => call === 'rect')?.[3];
  assert.equal(HeldItem.of('knife').kind, 'knife');
  assert.equal(HeldItem.of('knife_t').kind, 'knife');
  assert.equal(HeldItem.of('smokegrenade').grenade, 'smoke');
  assert.equal(HeldItem.of('incgrenade').grenade, 'fire');
  assert.equal(HeldItem.of('ak47').kind, 'gun');
  assert.equal(HeldItem.of('').kind, 'none');
  assert.ok(shape('ak47').some(([call]) => call === 'rect'), 'arma: retangulo');
  assert.ok(!shape('knife').some(([call]) => call === 'rect'), 'faca: sem retangulo');
  assert.ok(shape('knife').filter(([call]) => call === 'lineTo').length >= 2, 'faca: ponta triangular');
  assert.ok(!shape('smokegrenade').some(([call]) => call === 'rect'), 'granada: sem cano');
  assert.ok(barrelOf('awp') > barrelOf('ak47') && barrelOf('ak47') > barrelOf('glock'), 'cano proporcional a arma');
  assert.equal(barrelOf('awp'), HeldItem.barrel('awp'));
});

test('cegueira: halo branco no lugar do icone do jogador e segundos embaixo', () => {
  const { ctx, calls, sets } = recorder();
  RadarRenderer.draw(ctx, {
    viewport: { apply() {}, scale: 1, fitScale: 1 }, layout: { width: 100, height: 100, levels: [] }, images: [],
    projection: { isCalibrated: true, project: () => [50, 50], radius: () => 30 },
    round: { frames: [{ t: 0, p: [[0, 0, 0, 90, 100, 3, 0, 0, 0, 0]] }], kills: [], bomb: [], grenades: [], blinds: [{ t: 0, victim: 0, duration: 3 }], sides: {} },
    time: 1, players: [{ name: 'a' }], weapons: ['knife'], showNames: false, labels: null
  });
  const ring = arcs(calls).filter(([, x, y, radius, start, end]) => x === 50 && y === 50 && radius === 15.5 && start === 0 && Math.abs(end - Math.PI * 2) < 1e-9);
  assert.equal(ring.length, 2, 'contorno escuro e aro branco');
  assert.equal(arcs(calls).filter(([, , , radius]) => radius === 11).length, 0, 'o icone (corpo) some enquanto esta cego');
  assert.ok(calls.some(([name]) => name === 'createRadialGradient'), 'brilho branco macio');
  assert.ok(sets.some(([name, value]) => name === 'strokeStyle' && value === '#ffffff'), 'aro branco');
  assert.ok(!sets.some(([, value]) => value === '#ffe45e'), 'sem o amarelo antigo');
  assert.deepEqual(calls.filter(([name]) => name === 'fillText').map(([, text]) => text), ['2.0s']);
  const notBlind = recorder();
  RadarRenderer.draw(notBlind.ctx, {
    viewport: { apply() {}, scale: 1, fitScale: 1 }, layout: { width: 100, height: 100, levels: [] }, images: [],
    projection: { isCalibrated: true, project: () => [50, 50], radius: () => 30 },
    round: { frames: [{ t: 0, p: [[0, 0, 0, 90, 100, 3, 0, 0, 0, 0]] }], kills: [], bomb: [], grenades: [], blinds: [{ t: 0, victim: 0, duration: 3 }], sides: {} },
    time: 5, players: [{ name: 'a' }], weapons: ['knife'], showNames: false, labels: null
  });
  assert.equal(arcs(notBlind.calls).filter(([, , , radius]) => radius === 15.5).length, 0, 'visao de volta: sem aro');
  assert.ok(arcs(notBlind.calls).some(([, , , radius]) => radius === 11), 'visao de volta: o icone reaparece');
});

const SIDE_DRAW = (extra = {}) => ({
  viewport: { apply() {}, scale: 1, fitScale: 1 }, layout: { width: 100, height: 100, levels: [] }, images: [],
  projection: { isCalibrated: true, project: () => [50, 50], radius: () => 30 },
  time: 0, players: [{ name: 'a' }, { name: 'b' }], weapons: ['ak47'], showNames: false, labels: null, ...extra
});

test('vida no icone: a calota escura do topo cresce conforme a vida cai', () => {
  const capOf = (hp, side = 3) => {
    const { ctx, calls } = recorder();
    RadarRenderer.draw(ctx, SIDE_DRAW({ round: { frames: [{ t: 0, p: [[0, 0, 0, 90, hp, side, 0, 0, 0, 0]] }], kills: [], bomb: [], grenades: [], blinds: [], sides: {} } }));
    const clip = calls.findIndex(([name]) => name === 'clip');
    return clip < 0 ? undefined : calls.slice(clip).find(([name]) => name === 'fillRect'); // o retangulo logo apos o recorte no corpo
  };
  assert.equal(capOf(100), undefined, 'vida cheia: sem calota');
  const half = capOf(50);
  const quarter = capOf(25);
  const low = capOf(10);
  assert.ok(half && quarter && low);
  assert.ok(Math.abs(half[4] - half[3] / 2) < 1e-9, '50 de vida: o corpo escurece pela metade (altura = raio)');
  assert.ok(half[4] < quarter[4] && quarter[4] < low[4], 'menos vida, mais escuro');
  assert.ok(Math.abs(quarter[4] - (half[3] * 0.75)) < 1e-9, '25 de vida: tres quartos escuros');
});

test('kit de defuse: selo no canto inferior direito so para CT que tem o kit', () => {
  const badges = (side, nades) => {
    const { ctx, calls } = recorder();
    RadarRenderer.draw(ctx, SIDE_DRAW({ round: { frames: [{ t: 0, p: [[0, 0, 0, 90, 100, side, 0, 0, 0, 0, 0, nades]] }], kills: [], bomb: [], grenades: [], blinds: [], sides: {} } }));
    return calls.filter(([name, x, y, w, h]) => name === 'fillRect' && x > 50 && y > 50 && w === h && w < 20);
  };
  const withKit = badges(3, GrenadeLoadout.DEFUSER_BIT);
  assert.equal(withKit.length, 1, 'CT com kit: um selo');
  assert.ok(withKit[0][1] > 50 && withKit[0][2] > 50, 'canto inferior direito do icone');
  assert.equal(badges(3, 0).length, 0, 'CT sem kit: nada');
  assert.equal(badges(2, GrenadeLoadout.DEFUSER_BIT).length, 0, 'T nunca mostra o selo');
});

test('trajetoria: azul para quem e CT, laranja para quem e T, igual para todos os tipos', () => {
  const strokeOf = (type, thrower, sides) => {
    const { ctx, calls, sets } = recorder();
    const grenade = { t: 3, type, x: 100, y: 100, z: 0, thrower, path: [[1, 0, 0, 0], [2, 100, 100, 0], [3, 100, 100, 0]], bounces: [] };
    GrenadeEffects.draw(ctx, { project: (x, y) => [x, y], radius: () => 30 }, [grenade], 2.5, 1, { sides });
    const stroke = calls.findIndex(([name]) => name === 'stroke');
    assert.ok(stroke >= 0, 'desenhou a trilha');
    return sets.filter(([name]) => name === 'strokeStyle').map(([, value]) => value)[0];
  };
  const sides = { 0: 3, 1: 2 };
  for (const type of ['smoke', 'flash', 'he', 'fire', 'decoy']) {
    assert.equal(strokeOf(type, 0, sides), '#4a9eff', `${type} de CT`);
    assert.equal(strokeOf(type, 1, sides), '#e2a33b', `${type} de T`);
  }
  assert.equal(strokeOf('he', null, sides), UtilityStyle.color('he'), 'sem saber quem jogou, usa a cor do tipo');
});

// ---- cegueira e drops rapidos ----

test('cegueira: se o parser recusa as propriedades do jogador no evento, a cegueira ainda chega no round', () => {
  const base = createFakeEngine({ perSide: 2 });
  const entity = () => Object.assign(new Error('EntityNotFound'), { code: 'GenericFailure' });
  // com propriedades de jogador qualquer evento falha (como numa demo real com jogador ausente); sem elas funciona
  const picky = { ...base, parseEvents: (path, names, playerProps, other) => { if (playerProps.length) throw entity(); return base.parseEvents(path, names, playerProps, other); } };
  const { blinds } = new DemoAnalyzer(picky).analyze('x.dem').rounds[0];
  assert.deepEqual(blinds, [{ t: 18.91, victim: 2, attacker: 1, duration: 2.5 }]);
});

test('drops sem as propriedades do jogador: quem pegou e quem largou a C4 ganham a posicao do quadro mais proximo', () => {
  const base = createFakeEngine({ perSide: 2, movement: true });
  const entity = () => Object.assign(new Error('EntityNotFound'), { code: 'GenericFailure' });
  const picky = { ...base, parseEvents: (path, names, playerProps, other) => { if (playerProps.length) throw entity(); return base.parseEvents(path, names, playerProps, other); } };
  const stripped = (event) => { const { user_X, user_Y, user_Z, ...rest } = event; return rest; };
  const engine = { ...picky, parseEvents: (path, names, playerProps, other) => [...picky.parseEvents(path, names, playerProps, other), ...(names.includes('bomb_dropped') ? [stripped({ event_name: 'bomb_dropped', tick: 1300, user_steamid: '1', user_X: 0, user_Y: 0 })] : [])] };
  const c4 = new DemoAnalyzer(engine).analyze('x.dem').rounds[0].drops.filter((d) => d.type === 'c4');
  assert.equal(c4.length, 1, 'a C4 largada aparece mesmo sem posicao no evento');
  assert.ok(Number.isFinite(c4[0].x) && Number.isFinite(c4[0].y));
});

test('drops rapidos: item_remove traz o instante, o lugar e o olhar exatos de cada drop (e varios de uma vez valem)', () => {
  const lose = (...types) => (id, tick, inv) => (id === '2' && tick >= 1400 ? types.reduce((list, type) => without(list, type), inv) : inv);
  const remove = (tick, item, x, y, yaw) => ({ event_name: 'item_remove', tick, user_steamid: '2', item, user_X: x, user_Y: y, user_Z: 100, user_yaw: yaw, user_pitch: 0 });
  const run = (events, change) => {
    const engine = engineWith(events, (row) => row, { perSide: 2 });
    const parseTicks = engine.parseTicks;
    engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => {
      if (!row.inventory) return row;
      const inventory = change(row.steamid, row.tick, [...row.inventory]);
      return { ...row, inventory, inventory_as_ids: inventory.map((name) => ({ Knife: 42, 'Glock-18': 4, 'Smoke Grenade': 45, Flashbang: 43, 'High Explosive Grenade': 44 }[name])) };
    });
    return new DemoAnalyzer(engine).analyze('x.dem').rounds[0].drops.filter((d) => d.death === false);
  };

  // um drop: usa a posicao e o olhar do evento, nao os do quadro seguinte
  const [one] = run([remove(1399, 'weapon_flashbang', 777, 888, 0)], lose('Flashbang'));
  assert.deepEqual([one.x, one.y], [777, 888]);
  assert.ok(Math.abs(one.toX - one.x - 140) < 5 && Math.abs(one.toY - one.y) < 1, 'olhava para +x (yaw 0): o item vai 140 unidades para la');
  assert.ok(one.t <= 22 && one.t >= 21.5, 'o instante fica dentro do intervalo entre os dois quadros');

  // tres itens de uma vez (drop rapido): sem os item_remove e remontagem do inventario e some; com eles, sao tres drops
  const quick = lose('Flashbang', 'Smoke Grenade', 'High Explosive Grenade');
  assert.equal(run([], quick).length, 0, 'sem evidencia: parece remontagem do inventario');
  const events = [remove(1399, 'weapon_flashbang', 100, 100, 0), remove(1400, 'weapon_smokegrenade', 110, 100, 0), remove(1401, 'weapon_hegrenade', 120, 100, 0)];
  assert.deepEqual(run(events, quick).map((d) => d.type).sort(), ['flash', 'he', 'smoke']);
});

test('morte logo apos arremessar: a granada que acabou de sair do inventario nao cai, cai a mais cara das que sobraram', () => {
  // a vitima do tick 1000 tem smoke e flash e joga a smoke 5 ticks antes de morrer. Sem as sondagens (so quadros de 4 Hz) a
  // ultima leitura (tick 992) ainda mostra a smoke no inventario: e o weapon_fire que prova que ela ja saiu.
  const engine = (extra) => {
    const e = withInventory(engineWith(extra, (row) => row, { perSide: 2 }), '3', ['Knife', 'Glock-18', 'Smoke Grenade', 'Flashbang']);
    const parseTicks = e.parseTicks;
    e.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks.filter((tick) => tick % 16 === 0));
    return e;
  };
  const fire = { event_name: 'weapon_fire', tick: 995, user_steamid: '3', weapon: 'weapon_smokegrenade' };
  const types = (e) => new DemoAnalyzer(e).analyze('x.dem').rounds[0].drops.filter((d) => d.death).map((d) => d.type);
  assert.deepEqual(types(engine([])), ['smoke'], 'sem o arremesso: a mais cara cai');
  assert.deepEqual(types(engine([fire])), ['flash'], 'a smoke ja tinha saido: cai a flash');
});

// ---- analise: movimento dos drops e C4 unica ----

function engineWith(extraEvents, tweakRows = (row) => row, options = {}) {
  const engine = createFakeEngine(options);
  const parseEvents = engine.parseEvents;
  const parseTicks = engine.parseTicks;
  engine.parseEvents = (path, names, ...rest) => [...parseEvents(path, names, ...rest), ...extraEvents.filter((event) => names.includes(event.event_name))];
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map(tweakRows);
  return engine;
}
const without = (list, item) => { const at = list.indexOf(item); if (at >= 0) list.splice(at, 1); return list; };

test('analise: quem morre em movimento leva o item junto; quem pegou mostra onde ele parou', () => {
  const dies = (...grenades) => new DemoAnalyzer(withInventory(createFakeEngine({ movement: true }), '3', ['Knife', 'Glock-18', ...grenades])).analyze('x.dem').rounds[0].drops.filter((d) => d.death);
  const [flash] = dies('Flashbang');
  assert.equal(flash.type, 'flash');
  assert.ok(flash.toY < flash.y - 20 && flash.toY > flash.y - 125, 'o jogador corria para -y: o item desliza para la');
  assert.ok(flash.fall > 0);
  const [smoke] = dies('Smoke Grenade');
  assert.deepEqual([smoke.toX, smoke.toY], [-1180, -1010], 'quem pegou estava encostado no item: ali ele parou');
  assert.ok(smoke.until > 0);
});

test('analise: item largado de proposito voa para onde o jogador olha; parado e sem pegar, nao ha movimento forjado', () => {
  const engine = engineWith([], (row) => row, { perSide: 2 });
  const parseTicks = engine.parseTicks;
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => (!row.inventory ? row : { ...row, pitch: 0, inventory: row.steamid === '2' && row.tick >= 1400 ? without([...row.inventory], 'Flashbang') : row.inventory, inventory_as_ids: row.steamid === '2' && row.tick >= 1400 ? [42, 4, 45, 43, 44] : row.inventory_as_ids }));
  const { drops } = new DemoAnalyzer(engine).analyze('x.dem').rounds[0];
  const voluntary = drops.find((d) => d.death === false);
  assert.ok(voluntary, 'largou a flash');
  assert.ok(Math.abs(voluntary.toX - voluntary.x) < 6, 'olhava para +y (yaw 90): nao anda em x');
  assert.ok(Math.abs(voluntary.toY - voluntary.y - 140) < 1, '140 unidades a frente');
  assert.equal(voluntary.fall, 0.7);
  const stillDeath = new DemoAnalyzer(createFakeEngine({ perSide: 2 })).analyze('x.dem').rounds[0].drops.filter((d) => d.death && d.type === 'flash');
  assert.ok(stillDeath.every((d) => d.toX === undefined), 'quem morreu parado nao desliza e ninguem pegou: sem destino');
});

test('granada arremessada nao vira item no chao (weapon_fire) e quem larga e pega de volta nao deixa item sobrando', () => {
  const lose = (engine) => {
    const parseTicks = engine.parseTicks;
    engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => (!row.inventory ? row : { ...row, inventory: row.steamid === '2' && row.tick >= 1400 ? without([...row.inventory], 'Flashbang') : row.inventory, inventory_as_ids: row.steamid === '2' && row.tick >= 1400 ? [42, 4, 45, 43, 44] : row.inventory_as_ids }));
    return engine;
  };
  // sem evidencia: a flash que sumiu parece largada
  const plain = new DemoAnalyzer(lose(engineWith([], (row) => row, { perSide: 2 }))).analyze('x.dem').rounds[0].drops;
  assert.ok(plain.some((d) => d.death === false && d.type === 'flash'));
  // com o weapon_fire da flash (e sem explosao registrada): foi arremesso
  const fire = { event_name: 'weapon_fire', tick: 1390, user_steamid: '2', weapon: 'weapon_flashbang' };
  const rifle = { event_name: 'weapon_fire', tick: 1391, user_steamid: '2', weapon: 'weapon_ak47' };
  const thrown = new DemoAnalyzer(lose(engineWith([fire, rifle], (row) => row, { perSide: 2 }))).analyze('x.dem').rounds[0].drops;
  assert.equal(thrown.some((d) => d.death === false && d.type === 'flash'), false, 'arremesso explicado pelo weapon_fire');
  // tiros comuns nao ficam guardados (so as granadas)
  assert.equal(GrenadeInventory.isThrowable('weapon_flashbang'), true);
  assert.equal(GrenadeInventory.isThrowable('weapon_ak47'), false);
  assert.equal(GrenadeInventory.isThrowable('weapon_c4'), false);
});

test('C4: bomb_pickup fecha a C4 largada e nunca ha duas no chao', () => {
  const dropped = (tick, who, x, y) => ({ event_name: 'bomb_dropped', tick, user_steamid: who, user_X: x, user_Y: y, user_Z: 100 });
  const picked = (tick, who, x, y) => ({ event_name: 'bomb_pickup', tick, user_steamid: who, user_X: x, user_Y: y, user_Z: 100 });
  const round = (events) => new DemoAnalyzer(engineWith(events)).analyze('x.dem').rounds[0];
  const c4 = (r) => r.drops.filter((d) => d.type === 'c4');

  // largou, outro pegou (so o bomb_pickup avisa), esse outro largou de novo: uma C4 por vez
  const handedOver = c4(round([dropped(1200, '1', 500, 500), picked(1400, '2', 520, 500), dropped(1600, '2', 900, 900)]));
  assert.equal(handedOver.length, 2);
  assert.equal(handedOver[0].until, 21.88, 'fechada pelo bomb_pickup (tick 1400)');
  assert.equal(handedOver[1].until, null);
  assert.deepEqual([handedOver[0].toX, handedOver[0].toY], [520, 500], 'parou onde o outro jogador a pegou');

  // sem nenhum aviso de "pegou": a segunda C4 so aparece porque alguem pegou a primeira
  const noPickup = c4(round([dropped(1200, '1', 500, 500), dropped(1600, '2', 900, 900)]));
  assert.equal(noPickup.length, 2);
  assert.equal(noPickup[0].until, noPickup[1].t, 'a primeira some quando a segunda aparece');
  assert.equal(noPickup[1].until, null);

  // plantada: nao ha C4 no chao depois do plantio (bomb_planted do round 2)
  const planted = new DemoAnalyzer(engineWith([dropped(2800, '1', 500, 500)])).analyze('x.dem').rounds[1];
  const [open] = c4(planted);
  assert.ok(open.until !== null && open.until <= 16.88, 'fechada no plantio (bomb_planted no tick 3000; o round 2 comeca no tick 1920)');

  // o mesmo drop avisado duas vezes (bomb_dropped + inventario ou eventos repetidos) vale um so
  assert.equal(c4(round([dropped(1200, '1', 500, 500), dropped(1210, '1', 505, 500)])).length, 1);
  assert.equal(c4(round([{ ...dropped(1200, '1', 500, 500), user_X: 'x' }])).length, 0, 'posicao invalida e ignorada');
});

test('C4 do carregador que morre: bomb_dropped no mesmo instante da morte nao duplica a C4 do inventario', () => {
  const engine = engineWith([{ event_name: 'bomb_dropped', tick: 1000, user_steamid: '3', user_X: -1200, user_Y: -1000, user_Z: 120 }], (row) => {
    if (row.steamid === '3' && row.tick >= 1000) return { ...row, health: 0 }; // o jogador morre no tick 1000 (o motor falso nao zera a vida sozinho)
    return row.inventory && row.steamid === '3' && row.tick < 1000 ? { ...row, inventory: [...row.inventory, 'C4 Explosive'], inventory_as_ids: [...row.inventory_as_ids, 49] } : row;
  });
  const { drops } = new DemoAnalyzer(engine).analyze('x.dem').rounds[0];
  const c4 = drops.filter((d) => d.type === 'c4');
  assert.equal(c4.length, 1);
  assert.equal(c4[0].death, true);
});

test('formato da analise: sobe a versao e le os eventos da C4', () => {
  assert.ok(DemoAnalyzer.VERSION >= 5);
  assert.ok(DemoAnalyzer.OPTIONAL_EVENTS.includes('bomb_pickup') && DemoAnalyzer.OPTIONAL_EVENTS.includes('bomb_dropped'));
});

// ---- timer da C4 ----

test('C4: o pavio avanca de 0 a 1 em 40 s, com marcas a 10 s e 5 s do fim', async () => {
  const { BombFuse } = await import('../renderer/src/modules/demo-viewer/core/BombFuse.js');
  const events = [{ t: 20, type: 'planted', x: 1, y: 2, z: 3 }];
  assert.equal(BombFuse.at(events, 19), null, 'antes do plantio');
  assert.equal(BombFuse.at(events, 20).progress, 0);
  assert.equal(BombFuse.at(events, 40).progress, 0.5);
  assert.equal(BombFuse.at(events, 40).remaining, 20);
  assert.equal(BombFuse.at(events, 200).progress, 1, 'nunca passa do fim');
  assert.deepEqual(BombFuse.at(events, 21).marks, { noKit: 0.75, kit: 0.875 });
  const defused = [...events, { t: 50, type: 'defused', x: null, y: null, z: 0 }];
  assert.equal(BombFuse.at(defused, 55).progress, 0.75, 'defuse congela o anel');
  assert.equal(BombFuse.at(defused, 55).defused, true);
  const blast = [...events, { t: 58, type: 'exploded', x: null, y: null, z: 0 }];
  assert.equal(BombFuse.at(blast, 30).fuse, 38, 'pavio medido pela explosao');
  assert.equal(BombFuse.at(blast, 59).exploded, true);
});

test('C4: anel de progresso comeca no topo e as marcas amarela e vermelha ficam a 75% e 87,5%', () => {
  const { ctx, calls, sets } = recorder();
  RadarRenderer.draw(ctx, {
    viewport: { apply() {}, scale: 1, fitScale: 1 }, layout: { width: 100, height: 100, levels: [] }, images: [],
    projection: { isCalibrated: true, project: () => [50, 50], radius: () => 30 },
    round: { frames: [{ t: 0, p: [] }], kills: [], bomb: [{ t: 0, type: 'planted', x: 0, y: 0, z: 0 }], grenades: [], blinds: [], sides: {} },
    time: 10, players: [], weapons: [], showNames: false, labels: null
  });
  const progress = arcs(calls).find(([, x, y, radius, start, end]) => x === 50 && y === 50 && radius === 17 && start === -Math.PI / 2 && end < start + Math.PI * 2 - 1e-6);
  assert.ok(progress, 'arco parcial a partir do topo');
  assert.ok(Math.abs(progress[5] - (-Math.PI / 2 + Math.PI * 2 * 0.25)) < 1e-9, '10 s de 40 s = um quarto');
  const strokes = sets.filter(([name]) => name === 'strokeStyle').map(([, value]) => value);
  assert.ok(strokes.includes('#f5c542') && strokes.includes('#e5484d'), 'marcas amarela (10 s) e vermelha (5 s)');
});

// ---- cegueira por flash_duration e fim do round ----

test('cegueira por flash_duration: comeca na detonacao, dura ~1,35x o valor e e limitada pelos ticks ligado/zerado', async () => {
  const { FlashBlinds } = await import('../electron/core/demo/FlashBlinds.js');
  const secondsAt = (tick) => Math.round((tick / 64) * 100) / 100;
  const sample = (tick, flash, alive = true) => ({ tick, flash, alive });
  const derive = (list, detonations = [{ tick: 1000, user_steamid: '9' }]) => FlashBlinds.derive({
    samples: new Map([[3, list]]), detonations, startTick: 0, endTick: 4000, tickRate: 64, secondsAt, playerIndex: (id) => (id === '9' ? 7 : null)
  });
  // 2,68 s: modelo = 1000 + 2,68 * 1,35 * 64 = 1231,5 (entre o ultimo ligado 1216 e o primeiro zerado 1232)
  const blinds = derive([sample(984, 0), sample(1000, 2.68), sample(1216, 2.68), sample(1232, 0)]);
  assert.equal(blinds.length, 1);
  assert.equal(blinds[0].t, secondsAt(1000), 'comeca no tick da detonacao');
  assert.equal(blinds[0].victim, 3);
  assert.equal(blinds[0].attacker, 7, 'quem jogou vem da detonacao');
  assert.ok(blinds[0].duration > 3.4 && blinds[0].duration <= (1232 - 1000) / 64, `duracao ${blinds[0].duration}`);
  // sem detonacao conhecida: no meio entre a leitura zerada e a primeira ligada
  assert.equal(derive([sample(984, 0), sample(1016, 1), sample(1100, 0)], [])[0].t, secondsAt(1000));
  // morto: nao vale (e nao fica cego para sempre com o valor congelado)
  assert.equal(derive([sample(984, 0), sample(1000, 3.4, false), sample(2000, 3.4, false)]).length, 0);
  // valor que nunca zera (ultimo round): limitado a 10 s e ao fim do round
  assert.ok(derive([sample(984, 0), sample(1000, 20)])[0].duration <= 10);
  // outra flash por cima: duas cegueiras, a primeira termina onde a segunda comeca
  const stacked = derive([sample(984, 0), sample(1000, 3), sample(1100, 4), sample(1500, 0)], [{ tick: 1000, user_steamid: '9' }, { tick: 1090, user_steamid: '9' }]);
  assert.equal(stacked.length, 2);
  assert.ok(stacked[0].duration <= (1090 - 1000) / 64 + 0.01, 'a primeira e cortada pela segunda');
});

test('fim do round: vai ate o round_officially_ended (um tick antes do round seguinte) e, sem ele, 5 s depois da vitoria', () => {
  const rounds = RoundBuilder.buildBoundaries({
    round_start: [{ tick: 1 }, { tick: 4217 }],
    round_freeze_end: [{ tick: 1276 }, { tick: 5497 }],
    round_end: [{ tick: 3897, winner: 'CT' }, { tick: 10273, winner: 'T' }],
    round_officially_ended: [{ tick: 4217 }]
  }, 64);
  assert.equal(rounds[0].endTick, 4216, 'termina um tick antes do round seguinte comecar');
  assert.equal(rounds[0].winnerTick, 3897);
  assert.equal(rounds[1].startTick, 4217);
  assert.equal(rounds[1].endTick, 10273 + 5 * 64, 'ultimo round: sem o evento, 5 s depois da vitoria');
});

// ---- capacete e municao ----

test('capacete e municao: o parser entrega has_helmet e active_weapon_ammo e eles chegam no quadro (campos 13 e 14)', () => {
  const base = createFakeEngine({ perSide: 1 });
  const parseTicks = base.parseTicks;
  base.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => ({ ...row, has_helmet: true, active_weapon_ammo: 17 }));
  const entry = new DemoAnalyzer(base).analyze('x.dem').rounds[0].frames[0].p[0];
  assert.equal(entry[13], 1, 'capacete');
  assert.equal(entry[14], 17, 'municao');
  // sem as propriedades (parser antigo): sem capacete e municao desconhecida (-1)
  const plain = new DemoAnalyzer(createFakeEngine({ perSide: 1 })).analyze('x.dem').rounds[0].frames[0].p[0];
  assert.equal(plain[13], 0);
  assert.equal(plain[14], -1);
});

test('capacete e municao no viewer: o valor do quadro mais proximo; demo antiga vira sem capacete e sem municao', () => {
  const frames = [{ t: 0, p: [[0, 0, 0, 0, 100, 3, 0, 50, 0, 0, 0, 0, 0, 0, 30]] }, { t: 1, p: [[0, 0, 0, 0, 100, 3, 0, 50, 0, 0, 0, 0, 0, 1, 12]] }];
  assert.deepEqual([FrameInterpolator.sample(frames, 0.2)[0].helmet, FrameInterpolator.sample(frames, 0.2)[0].ammo], [0, 30]);
  assert.deepEqual([FrameInterpolator.sample(frames, 0.8)[0].helmet, FrameInterpolator.sample(frames, 0.8)[0].ammo], [1, 12]);
  const old = FrameInterpolator.sample([{ t: 0, p: [[0, 0, 0, 0, 100, 3]] }], 0)[0];
  assert.deepEqual([old.helmet, old.ammo], [0, -1]);
});
