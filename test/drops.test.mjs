import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';
import { DropPhysics } from '../electron/core/demo/DropPhysics.js';
import { DropTracker } from '../electron/core/demo/DropTracker.js';
import { createFakeEngine, withInventory } from './helpers.mjs';

// Round 1 do parser falso: ticks 0..1920 (64/s). O jogador 3 morre no tick 1000; o jogador 1 pega uma smoke no tick 1300.
const seconds = (tick) => Math.round((tick / 64) * 100) / 100;

function engineWith(extraEvents = [], tweakRows = (row) => row, options = { perSide: 2 }, dropEvents = []) {
  const engine = createFakeEngine(options);
  const parseEvents = engine.parseEvents;
  const parseTicks = engine.parseTicks;
  engine.parseEvents = (path, names, ...rest) => [...parseEvents(path, names, ...rest).filter((e) => !dropEvents.includes(e.event_name)), ...extraEvents.filter((event) => names.includes(event.event_name))];
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map(tweakRows);
  return engine;
}
const round = (engine) => new DemoAnalyzer(engine).analyze('x.dem').rounds[0];
const remove = (tick, who, item, x, y, extra = {}) => ({ event_name: 'item_remove', tick, user_steamid: who, item, user_X: x, user_Y: y, user_Z: 100, user_yaw: 0, user_pitch: 0, ...extra });
const pick = (tick, who, item, x, y) => ({ event_name: 'item_pickup', tick, user_steamid: who, item, user_X: x, user_Y: y });
const voluntary = (events, ...rest) => round(engineWith(events, ...rest)).drops.filter((d) => !d.death);

// ---- largar e pegar rapido ----

test('largar e pegar dentro do mesmo quadro (inventario nao muda): o drop existe e some na hora da pega', () => {
  const [drop, ...others] = voluntary([remove(1500, '2', 'weapon_flashbang', 500, 500), pick(1510, '2', 'flashbang', 560, 500)]);
  assert.equal(others.length, 0);
  assert.deepEqual([drop.type, drop.t, drop.until], ['flash', seconds(1500), seconds(1510)], 'instante exato da queda e da pega (0,16 s depois)');
  assert.deepEqual([drop.x, drop.y, drop.toX, drop.toY], [500, 500, 560, 500], 'parou onde quem pegou estava');
});

test('larga e pega varias vezes seguidas: cada drop fecha com a sua propria pega', () => {
  const events = [];
  for (const base of [1500, 1540, 1580, 1620]) events.push(remove(base, '2', 'weapon_flashbang', 500, 500), pick(base + 10, '2', 'flashbang', 520, 500));
  const drops = voluntary(events);
  assert.equal(drops.length, 4);
  assert.deepEqual(drops.map((d) => d.until), [1510, 1550, 1590, 1630].map(seconds));
  assert.ok(drops.every((d, i) => d.t === seconds([1500, 1540, 1580, 1620][i])));
});

test('varios itens de uma vez (flash, smoke e HE largados em sequencia) viram tres drops', () => {
  const drops = voluntary([remove(1500, '2', 'weapon_flashbang', 100, 100), remove(1501, '2', 'weapon_smokegrenade', 100, 100), remove(1502, '2', 'weapon_hegrenade', 100, 100)]);
  assert.deepEqual(drops.map((d) => d.type).sort(), ['flash', 'he', 'smoke']);
});

test('a pega fecha o drop mais perto de onde o item parou, e so os que ja existiam', () => {
  // A em (300,0) para perto de (440,0); B em (600,0) para perto de (740,0): quem pega em (650,0) esta encostado em B
  const events = [remove(1500, '2', 'weapon_flashbang', 300, 0), remove(1520, '2', 'weapon_flashbang', 600, 0), pick(1600, '1', 'flashbang', 650, 0)];
  const [a, b] = voluntary(events);
  assert.equal(a.until, null, 'A continua no chao');
  assert.equal(b.until, seconds(1600), 'B foi pega');
  // pega ANTES do drop existir nao o fecha
  const [late] = voluntary([remove(1500, '2', 'weapon_flashbang', 500, 500), pick(1450, '1', 'flashbang', 500, 500)]);
  assert.equal(late.until, null);
});

test('pega longe de qualquer item (compra, outro lugar) nao apaga nada', () => {
  const [drop] = voluntary([remove(1500, '2', 'weapon_flashbang', 0, 0), pick(1600, '1', 'flashbang', 3000, 3000)]);
  assert.equal(drop.until, null);
});

test('so a pega do mesmo tipo fecha o drop', () => {
  const [drop] = voluntary([remove(1500, '2', 'weapon_flashbang', 0, 0), pick(1520, '1', 'smokegrenade', 0, 0), pick(1530, '1', 'hegrenade', 0, 0)]);
  assert.equal(drop.until, null);
});

// ---- item_remove: o que nao e drop ----

test('item_remove da morte, do arremesso e do inicio do round nao viram drop de proposito', () => {
  assert.equal(voluntary([remove(1000, '3', 'weapon_flashbang', -1200, -1000)]).length, 0, 'no tick da morte do proprio jogador');
  assert.equal(voluntary([remove(1500, '2', 'weapon_flashbang', 0, 0), { event_name: 'weapon_fire', tick: 1500, user_steamid: '2', weapon: 'weapon_flashbang' }]).length, 0, 'arremesso (weapon_fire)');
  assert.equal(voluntary([remove(30, '2', 'weapon_flashbang', 0, 0)]).length, 0, 'remontagem do inventario no comeco do round');
  const [real] = voluntary([remove(1700, '2', 'weapon_flashbang', 0, 0), { event_name: 'weapon_fire', tick: 1500, user_steamid: '2', weapon: 'weapon_flashbang' }]);
  assert.equal(real.t, seconds(1700), 'um arremesso antigo nao explica um drop de agora');
});

test('uma prova de arremesso explica uma so remocao', () => {
  const fire = { event_name: 'weapon_fire', tick: 1500, user_steamid: '2', weapon: 'weapon_flashbang' };
  const drops = voluntary([remove(1500, '2', 'weapon_flashbang', 0, 0), remove(1502, '2', 'weapon_flashbang', 0, 0), fire]);
  assert.equal(drops.length, 1, 'a segunda flash que sumiu foi largada');
});

test('com item_remove na demo, a queda no inventario nao inventa drops de granada', () => {
  const loseFlash = (row) => (row.inventory && row.steamid === '2' && row.tick >= 1400 ? { ...row, inventory: row.inventory.filter((n, i, list) => n !== 'Flashbang' || i !== list.indexOf('Flashbang')), inventory_as_ids: [42, 4, 45, 43, 44] } : row);
  assert.equal(voluntary([], loseFlash).filter((d) => d.type === 'flash').length, 1, 'sem item_remove na demo: o inventario vale (caminho antigo)');
  const withEvents = voluntary([remove(1300, '1', 'weapon_hegrenade', 10, 10)], loseFlash);
  assert.deepEqual(withEvents.map((d) => d.type), ['he'], 'com eventos: so o que eles dizem');
});

test('sem item_pickup na demo, o inventario que cresceu fecha o drop; com item_pickup ele nao conta', () => {
  const grow = (row) => (row.inventory && row.steamid === '2' && row.tick >= 1600 ? { ...row, inventory: [...row.inventory, 'Flashbang'], inventory_as_ids: [42, 4, 45, 43, 43, 43, 44] } : row);
  const drop = [remove(1500, '1', 'weapon_flashbang', 150, 10)];
  assert.equal(voluntary(drop, grow, undefined, ['item_pickup'])[0].until, 25, 'fallback: o quadro em que o inventario cresceu');
  assert.equal(voluntary(drop, grow)[0].until, null, 'a demo traz item_pickup: so ele manda (comprar uma flash perto nao pega a do chao)');
});

// ---- morte ----

test('sem o inventario lido nenhuma granada cai na morte (nao ha como saber qual e a mais cara)', () => {
  assert.equal(round(engineWith([], (row) => row, { perSide: 2, failInventory: true, failInventoryIds: true })).drops.length, 0);
});

test('a ultima leitura antes da morte vem do tick anterior, nao do quadro de 0,25 s', () => {
  // o jogador 3 so tem a flash ate o tick 996 e a smoke depois (a "compra" foi no tick 997, 3 ticks antes de morrer);
  // o quadro de 4 Hz (tick 992) ainda mostra a flash: so a leitura do tick 999 acerta
  const engine = withInventory(withInventory(engineWith([]), '3', ['Knife', 'Flashbang'], { to: 996 }), '3', ['Knife', 'Smoke Grenade'], { from: 997 });
  assert.deepEqual(round(engine).drops.filter((d) => d.death).map((d) => d.type), ['smoke']);
});

test('C4 e kit de defuse caem na morte, junto com a unica granada', () => {
  const engine = withInventory(engineWith([]), '3', ['Knife', 'High Explosive Grenade', 'Flashbang', 'C4 Explosive'], { has_defuser: true });
  assert.deepEqual(round(engine).drops.map((d) => d.type).sort(), ['c4', 'defuser', 'he']);
});

test('kit de defuse nao pode ser largado: sumir do inventario ou item_remove de kit nunca e drop (so morte)', () => {
  // o jogador 1 (CT) tem o kit ate o tick 400 (6 s: depois do 1o segundo do round) e perde-o sem morrer
  const lose = (row) => (row.steamid === '1' && row.inventory ? { ...row, has_defuser: row.tick < 400 } : row);
  assert.equal(round(engineWith([], lose)).drops.filter((d) => d.type === 'defuser').length, 0, 'queda de has_defuser entre quadros');
  assert.equal(round(engineWith([remove(500, '1', 'item_defuser', 50, 20)])).drops.filter((d) => d.type === 'defuser').length, 0, 'item_remove de kit');
  const died = (row) => (row.steamid === '3' && row.inventory ? { ...row, has_defuser: true } : row);
  assert.deepEqual(round(engineWith([], died)).drops.filter((d) => d.type === 'defuser').map((d) => d.death), [true], 'na morte o kit cai');
});

// ---- sondagens e fisica ----

test('sondagens: 1 e 6 ticks antes de cada morte e item_remove, so dentro dos rounds', () => {
  const rounds = [{ startTick: 100, endTick: 200 }];
  const events = { player_death: [{ tick: 150 }, { tick: 103 }, { tick: 300 }], item_remove: [{ tick: 180 }, { tick: 'x' }] };
  assert.deepEqual(DropTracker.probeTicks(events, rounds), [102, 144, 149, 174, 179]);
  assert.deepEqual(DropTracker.probeTicks({}, rounds), []);
  const asked = [];
  const engine = engineWith([remove(1500, '2', 'weapon_flashbang', 0, 0)]);
  const parseTicks = engine.parseTicks;
  engine.parseTicks = (path, props, ticks) => { asked.push(...ticks); return parseTicks(path, props, ticks); };
  new DemoAnalyzer(engine).analyze('x.dem');
  for (const tick of [994, 999, 1494, 1499]) assert.ok(asked.includes(tick), `leu o tick ${tick}`);
});

test('fisica do drop: olhar para baixo encurta, para cima alonga; correr leva o item; teto de distancia', () => {
  const at = (pitch, extra = {}) => DropPhysics.thrown({ x: 0, y: 0, yaw: 0, pitch, ...extra });
  assert.ok(Math.abs(at(0).x - 140) < 0.5 && at(0).fall === 0.7, 'parado olhando em frente: ~140 unidades em 0,7 s');
  assert.ok(at(60).x < at(0).x && at(-30).x > at(0).x);
  assert.ok(at(0, { vx: 250 }).x > at(0).x + 80, 'quem corre leva o item mais longe');
  assert.ok(Math.hypot(at(-60, { vx: 1000 }).x, 0) <= DropPhysics.MAX_THROW + 0.01);
  assert.equal(DropPhysics.thrown({ x: 0, y: 0, yaw: undefined }), null, 'sem olhar nao ha direcao');
  assert.equal(DropPhysics.died({ x: 0, y: 0, vx: 0, vy: 0 }), null, 'morreu parado: fica no lugar');
  assert.deepEqual(DropPhysics.died({ x: 0, y: 0, vx: 0, vy: -250 }), { x: 0, y: -120, fall: 0.6 }, 'desliza no maximo 120');
  assert.deepEqual(DropPhysics.velocity({ x: 0, y: 0 }, { x: 5000, y: 0 }, 0.1), { vx: 0, vy: 0 }, 'teleporte nao e velocidade');
});
