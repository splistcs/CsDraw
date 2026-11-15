import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';
import { WeaponDrops } from '../electron/core/demo/WeaponDrops.js';
import { DropMotion } from '../renderer/src/modules/demo-viewer/core/DropMotion.js';
import { createFakeEngine, groundRows } from './helpers.mjs';

const seconds = (tick) => Math.round((tick / 64) * 100) / 100;
const round = (options) => new DemoAnalyzer(createFakeEngine(options)).analyze('x.dem').rounds[0];
const flash = (extra) => groundRows({ entity: 900, weapon: 'Flashbang', ...extra });

test('morte: o item que o servidor colocou no chao e o que cai; as outras granadas do inventario nao existem', () => {
  const { drops } = round({ perSide: 2, groundItems: flash({ owner: '3', from: 1000, to: 1500, place: () => [-1210, -1005, 118] }) });
  assert.equal(drops.length, 1, 'so a flash que a demo mostra no chao (nada de smoke/HE por palpite)');
  const [drop] = drops;
  assert.deepEqual([drop.type, drop.death, drop.t, drop.until], ['flash', true, seconds(1000), seconds(1501)]);
  assert.deepEqual([drop.x, drop.y, drop.z], [-1210, -1005, 118], 'posicao exata da entidade');
  assert.equal(drop.path, undefined, 'parada desde o inicio: sem percurso');
});

test('rolagem e queda: o percurso e o das entidades tick a tick, e o item para onde o servidor o deixou', () => {
  const place = (tick) => { const n = Math.min(30, tick - 1200); return [100 + 5 * n, 40, 160 - 60 * Math.min(1, n / 20)]; };
  const [drop] = round({ perSide: 2, groundItems: flash({ owner: '2', from: 1200, to: 1300, place }) }).drops;
  assert.equal(drop.death, false);
  assert.deepEqual([drop.toX, drop.toY, drop.fall], [250, 40, seconds(30)], 'repouso e o instante em que parou');
  assert.deepEqual(drop.path[0], [0, 100, 40, 160]);
  assert.deepEqual(drop.path.at(-1), [seconds(30), 250, 40, 100], 'a parte parada do fim nao entra no percurso');
  assert.ok(drop.path.length >= 20 && drop.path.length <= 32, 'um ponto por mudanca de posicao, nao um por tick parado');
  assert.equal(drop.until, seconds(1301));
  const mid = DropMotion.at(drop, drop.t + 0.2);
  assert.ok(mid.x > 100 && mid.x < 250 && mid.lift > 0);
  assert.deepEqual([DropMotion.at(drop, drop.t + 5).x, DropMotion.at(drop, drop.t + 5).lift], [250, 0]);
});

test('parada lenta (rolando devagar ate parar): o instante e o ponto exatos do repouso entram no percurso', () => {
  const place = (tick) => [100 + 0.4 * Math.min(22, tick - 1200), 40, 100];
  const [drop] = round({ perSide: 2, groundItems: flash({ owner: '2', from: 1200, to: 1300, place }) }).drops;
  assert.deepEqual(drop.path.at(-1), [seconds(22), 108.8, 40, 100]);
  assert.deepEqual([drop.toX, drop.fall], [108.8, seconds(22)]);
});

test('largar e pegar de volta varias vezes seguidas: uma passagem pelo chao por drop, cada uma fecha na hora da pega', () => {
  const runs = [[1500, 1520], [1522, 1540], [1542, 1560], [1562, 1580]];
  const rows = runs.flatMap(([from, to], i) => flash({ owner: '2', from, to, place: () => [500 + i, 20, 100] }));
  const { drops } = round({ perSide: 2, groundItems: rows });
  assert.equal(drops.length, 4);
  assert.deepEqual(drops.map((d) => [d.t, d.until]), runs.map(([from, to]) => [seconds(from), seconds(to + 1)]));
});

test('item que fica ate o fim do round nao tem fim (until nulo); o que some antes tem', () => {
  const rows = [...flash({ owner: '2', from: 1500, to: 2240 }), ...groundRows({ entity: 901, weapon: 'Smoke Grenade', owner: '1', from: 1500, to: 1700 })];
  const { drops } = round({ perSide: 2, groundItems: rows });
  assert.deepEqual(drops.map((d) => [d.type, d.until]), [['flash', null], ['smoke', seconds(1701)]]);
});

test('arma apagada num arremesso (poucos ticks sem dono) nao vira item no chao', () => {
  const fire = { event_name: 'weapon_fire', tick: 1500, user_steamid: '2', weapon: 'weapon_flashbang' };
  const engine = (rows, events = []) => {
    const e = createFakeEngine({ perSide: 2, groundItems: rows });
    const parseEvents = e.parseEvents;
    e.parseEvents = (path, names, ...rest) => [...parseEvents(path, names, ...rest), ...events.filter((event) => names.includes(event.event_name))];
    return new DemoAnalyzer(e).analyze('x.dem').rounds[0].drops;
  };
  assert.equal(engine(flash({ owner: '2', from: 1500, to: 1502 })).length, 0, 'ate 3 ticks: nunca e item');
  assert.equal(engine(flash({ owner: '2', from: 1500, to: 1507 }), [fire]).length, 0, 'curta e com weapon_fire: arremesso');
  assert.equal(engine(flash({ owner: '2', from: 1500, to: 1507 })).length, 1, 'curta mas sem arremesso: alguem largou e pegou');
  assert.equal(engine(flash({ owner: '2', from: 1500, to: 1580 }), [fire]).length, 1, 'longa: item de verdade mesmo com weapon_fire perto');
});

test('so granadas, C4 e kit entram; um id de entidade reaproveitado por outro item gera outro drop', () => {
  const rows = [
    ...groundRows({ entity: 7, weapon: 'AK-47', owner: '3', from: 1000, to: 1900 }),
    ...flash({ entity: 8, owner: '2', from: 1500, to: 1520 }),
    ...groundRows({ entity: 8, weapon: 'Smoke Grenade', owner: '1', from: 1600, to: 1620 })
  ];
  assert.deepEqual(round({ perSide: 2, groundItems: rows }).drops.map((d) => d.type), ['flash', 'smoke']);
});

test('sem parseWeapons, sem granadas nele ou com falha: volta ao palpite por eventos/inventario', () => {
  const guess = (drops) => drops.map((d) => [d.type, d.death]);
  const expected = [['smoke', true]];
  assert.deepEqual(guess(round({ perSide: 2 }).drops), expected, 'parser antigo (sem parseWeapons)');
  assert.deepEqual(guess(round({ perSide: 2, groundItems: groundRows({ entity: 7, weapon: 'AK-47', owner: '3', from: 1000, to: 1900 }) }).drops), expected, 'so rifles no chao: nao prova que ele enxerga granadas');
  assert.deepEqual(guess(round({ perSide: 2, groundItems: [], failGroundItems: true }).drops), expected, 'lista vazia');
  assert.deepEqual(guess(round({ perSide: 2, groundItems: flash({ from: 1, to: 2 }), failGroundItems: true }).drops), expected, 'o parser falhou');
});

test('o kit de defuse, que pode nao ser entidade de arma, continua pelo palpite quando nao aparece nos dados', () => {
  const engine = createFakeEngine({ perSide: 2, groundItems: flash({ owner: '3', from: 1000, to: 1500 }) });
  const parseTicks = engine.parseTicks;
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => (row.steamid === '3' && row.inventory ? { ...row, has_defuser: true } : row));
  assert.deepEqual(new DemoAnalyzer(engine).analyze('x.dem').rounds[0].drops.map((d) => d.type).sort(), ['defuser', 'flash']);
});

test('a leitura pede TODOS os ticks dos rounds (a granada rola a cada tick)', () => {
  const engine = createFakeEngine({ perSide: 2, groundItems: flash({ owner: '3', from: 1000, to: 1100 }) });
  const parseWeapons = engine.parseWeapons;
  let asked = [];
  engine.parseWeapons = (path, extra, ticks) => { asked = ticks; return parseWeapons(path, extra, ticks); };
  new DemoAnalyzer(engine).analyze('x.dem');
  assert.ok(asked.length > 3000 && asked.includes(1) && asked.includes(1000) && asked.includes(1001) && asked.includes(1920));
  assert.ok(asked.every((tick, i) => i === 0 || tick === asked[i - 1] + 1 || tick > asked[i - 1] + 1), 'ordenados');
});

test('index/covered: linhas invalidas e sem dono', () => {
  const index = WeaponDrops.index([{ tick: 1, entity_id: 1, weapon: 'Flashbang', x: 'a', y: 0, z: 0 }, { tick: 2, entity_id: 1, weapon: 'Flashbang', x: 1, y: 2, z: 3, steamid: 0 }, { tick: 2, entity_id: 2, weapon: 'AK-47', x: 1, y: 1, z: 1 }]);
  assert.equal(index.groups.length, 1);
  assert.equal(index.groups[0].rows[0].owner, null, 'steamid 0 e "sem dono"');
  assert.deepEqual([...WeaponDrops.covered(index)].sort(), ['decoy', 'fire', 'flash', 'he', 'smoke']);
  assert.equal(WeaponDrops.covered({ any: false, seen: new Set() }).size, 0);
  assert.equal(WeaponDrops.covered(null).size, 0);
});

test('viewer: percurso interpolado, parado antes/depois, empilha pelo ponto de repouso; demo antiga continua igual', () => {
  const drop = { x: 0, y: 0, z: 100, t: 10, path: [[0, 0, 0, 160], [0.5, 100, 0, 100], [1, 100, 50, 100]] };
  assert.deepEqual(DropMotion.at(drop, 9), { x: 0, y: 0, z: 160, lift: 1 }, 'ainda nao saiu: no ponto de origem');
  const mid = DropMotion.at(drop, 10.25);
  assert.deepEqual([mid.x, mid.z], [50, 130]);
  assert.ok(mid.lift > 0.5 && mid.lift < 1);
  assert.deepEqual(DropMotion.at(drop, 10.75), { x: 100, y: 25, z: 100, lift: 0 }, 'rolando no chao: sem "altura"');
  assert.deepEqual(DropMotion.at(drop, 99), { x: 100, y: 50, z: 100, lift: 0 });
  assert.deepEqual(DropMotion.rest(drop), { x: 100, y: 50 });
  assert.deepEqual(DropMotion.at({ x: 5, y: 6, t: 1 }, 5), { x: 5, y: 6, lift: 0 }, 'demo antiga');
});
