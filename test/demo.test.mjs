import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';
import { EventNormalizer } from '../electron/core/demo/EventNormalizer.js';
import { GrenadeInventory } from '../electron/core/demo/GrenadeInventory.js';
import { GrenadeTracks } from '../electron/core/demo/GrenadeTracks.js';
import { WeaponNames } from '../electron/core/demo/WeaponNames.js';
import { RoundBuilder } from '../electron/core/demo/RoundBuilder.js';
import { GrenadeLoadout } from '../renderer/src/modules/demo-viewer/core/GrenadeLoadout.js';

import { createFakeEngine, withInventory } from './helpers.mjs';

const fakeEngine = () => createFakeEngine({ perSide: 2 });

test('analise sintetica: rounds, placar com troca de lados, kills, granadas e bomba', () => {
  const stages = [];
  const result = new DemoAnalyzer(fakeEngine(), (s) => stages.push(s)).analyze('x.dem');
  assert.equal(result.map.slug, 'mirage');
  assert.equal(result.tickRate, 64);
  assert.equal(result.rounds.length, 3);
  assert.equal(result.players.length, 4);
  assert.deepEqual(result.rounds.map((r) => [r.scoreA, r.scoreB]), [[1, 0], [1, 1], [1, 2]]);
  assert.equal(result.rounds[2].sideOfTeamA, 'T');
  assert.equal(result.rounds[0].frames[0].t, 0);
  assert.ok(result.rounds[0].frames.length > 60);
  assert.equal(result.rounds[0].kills[0].weapon, 'ak47');
  assert.equal(result.rounds[0].kills[0].killer, 0);
  assert.equal(result.rounds[0].grenades[0].type, 'smoke');
  assert.equal(result.rounds[1].reason, 'bomb_exploded');
  assert.equal(result.rounds[1].bomb[0].x, -700);
  assert.ok(result.bounds.maxX > result.bounds.minX);
  assert.ok(stages.length >= 4);
  // novos dados: freezetime, z, armadura/dinheiro/arma, andares
  assert.equal(result.rounds[0].freezeSeconds, 10);
  assert.equal(result.rounds[0].frames[0].p[0].length, 15);
  assert.ok(result.weapons.includes('m4a1') && result.weapons.includes('ak47'));
  assert.ok(Number.isFinite(result.rounds[0].grenades[0].z));
});

test('sem as propriedades opcionais o parser ainda funciona (fallback)', () => {
  const result = new DemoAnalyzer(createFakeEngine({ perSide: 2, failExtendedProps: true })).analyze('x.dem');
  const entry = result.rounds[0].frames[0].p[0];
  assert.equal(result.rounds.length, 3);
  assert.deepEqual([entry[7], entry[8], entry[9]], [0, 0, -1]);
  assert.equal(entry[10], 5.6, 'os outros grupos opcionais continuam valendo');
  assert.ok(entry[11] > 0, 'inventario tambem');
  assert.deepEqual(result.weapons, ['glock'], 'sem arma ativa, so a do inventario');
  assert.equal(result.features.economy, false);
});

test('normalizador aceita formatos diferentes do parser', () => {
  const flat = EventNormalizer.group([{ event_name: 'round_end', tick: 1 }]);
  const nested = EventNormalizer.group([{ event_name: 'round_end', data: [{ tick: 1 }, { tick: 2 }] }]);
  const tuples = EventNormalizer.group([['round_end', [{ tick: 3 }]]]);
  assert.equal(flat.round_end.length, 1);
  assert.equal(nested.round_end.length, 2);
  assert.equal(tuples.round_end[0].tick, 3);
  assert.deepEqual(EventNormalizer.group(null), {});
});

test('lados e slugs', () => {
  assert.equal(RoundBuilder.normalizeSide(2), 'T');
  assert.equal(RoundBuilder.normalizeSide('CT'), 'CT');
  assert.equal(RoundBuilder.normalizeSide('TERRORIST'), 'T');
  assert.equal(RoundBuilder.normalizeSide('x'), null);
  assert.equal(RoundBuilder.slugFromMapName('de_dust2'), 'dust2');
  assert.equal(RoundBuilder.slugFromMapName('de_pool_day'), 'pool-day');
});

test('demo sem rounds gera erro claro', () => {
  const engine = { ...fakeEngine(), parseEvents: () => [] };
  assert.throws(() => new DemoAnalyzer(engine).analyze('x.dem'), /Nenhum round/);
});

test('inventario de granadas e pitch entram em cada frame', () => {
  const result = new DemoAnalyzer(fakeEngine()).analyze('x.dem');
  assert.equal(result.version, DemoAnalyzer.VERSION);
  assert.equal(result.features.inventory, true);
  const entry = result.rounds[0].frames[0].p[0];
  assert.equal(entry[10], 5.6, 'pitch arredondado');
  assert.deepEqual(GrenadeLoadout.items(entry[11]), [{ type: 'flash', count: 2 }, { type: 'smoke', count: 1 }, { type: 'he', count: 1 }]);
});

test('inventario: se o parser recusa os nomes, os ids de item bastam (e sem nenhum dos dois o resto segue)', () => {
  const expected = [{ type: 'flash', count: 2 }, { type: 'smoke', count: 1 }, { type: 'he', count: 1 }];
  const byIds = new DemoAnalyzer(createFakeEngine({ perSide: 2, failInventory: true })).analyze('x.dem');
  assert.deepEqual(GrenadeLoadout.items(byIds.rounds[0].frames[0].p[0][11]), expected);
  assert.equal(byIds.features.inventory, true);

  const none = new DemoAnalyzer(createFakeEngine({ perSide: 2, failInventory: true, failInventoryIds: true })).analyze('x.dem');
  const entry = none.rounds[0].frames[0].p[0];
  assert.equal(entry[11], 0);
  assert.equal(none.features.inventory, false);
  assert.ok(entry[8] > 0 && entry[10] === 5.6, 'dinheiro e pitch mantidos');
});

test('empacotamento de granadas: nomes, ids, limites e ordem dos tipos', () => {
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.pack(['Knife', 'AK-47', 'C4 Explosive'])), []);
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.pack(['weapon_hegrenade', 'weapon_molotov', 'Decoy Grenade', 'Incendiary Grenade'])), [{ type: 'he', count: 1 }, { type: 'fire', count: 2 }, { type: 'decoy', count: 1 }]);
  assert.equal(GrenadeLoadout.items(GrenadeInventory.pack(Array(9).fill('Flashbang')))[0].count, 3, 'limite de 3 por tipo');
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.pack("['Knife', 'Smoke Grenade']")), [{ type: 'smoke', count: 1 }], 'texto tambem e aceito');
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.pack(undefined)), []);
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.pack(null, [1, 43, 43, 45, 46, 47, 48, 49])), [{ type: 'flash', count: 2 }, { type: 'smoke', count: 1 }, { type: 'fire', count: 2 }, { type: 'decoy', count: 1 }], 'so ids');
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.pack(['Flashbang'], [43, 43])), [{ type: 'flash', count: 2 }], 'nomes e ids nao se somam');
  assert.deepEqual(GrenadeInventory.counts(GrenadeInventory.pack(['Smoke Grenade', 'Decoy Grenade'])), { he: 0, flash: 0, smoke: 1, fire: 0, decoy: 1 });
  assert.deepEqual(GrenadeLoadout.TYPES, GrenadeInventory.TYPES, 'main e renderer usam a mesma ordem');
  assert.equal(GrenadeLoadout.BITS, GrenadeInventory.BITS);
});

test('trajetoria: cada explosao leva o percurso real da granada, o momento do arremesso e os quiques', () => {
  const [smoke, fire, flash] = new DemoAnalyzer(fakeEngine()).analyze('x.dem').rounds[0].grenades;
  assert.deepEqual([smoke.type, smoke.t, smoke.thrownT], ['smoke', 14.06, 12.5]);
  assert.deepEqual(smoke.path[0], [12.5, 0, -1500, 100], 'comeca na mao de quem jogou');
  assert.deepEqual(smoke.path.at(-1), [14.06, -900, -1500, 100], 'termina onde explodiu');
  assert.deepEqual(smoke.bounces, [[13.44, -600, -1500, 100]], 'um quique, onde a velocidade muda de repente');
  assert.ok(smoke.path.length < 40, 'percurso amostrado, nao todos os ticks');
  assert.deepEqual([fire.type, fire.thrownT, fire.bounces.length], ['fire', 16.09, 0], 'fogo liga pelo jogador, tipo e lugar (a entidade e a do incendio)');
  assert.deepEqual([flash.type, flash.thrownT], ['flash', 17.97]);
});

test('sem parseGrenades a explosao continua valendo, sem percurso', () => {
  const grenades = new DemoAnalyzer(createFakeEngine({ perSide: 2, failGrenades: true })).analyze('x.dem').rounds[0].grenades;
  assert.equal(grenades.length, 3);
  assert.deepEqual(grenades.map((g) => g.thrownT), grenades.map((g) => g.t));
  assert.ok(grenades.every((g) => g.path === undefined));
});

test('percursos: entidade reaproveitada vira duas granadas, armas seguradas e linhas invalidas sao ignoradas', () => {
  const row = (entity, tick, x) => ({ grenade_entity_id: entity, grenade_type: 'CHEGrenadeProjectile', steamid: '1', tick, x, y: 0, z: 0 });
  const tracks = GrenadeTracks.fromRows([
    ...[100, 101, 102, 103].map((tick, i) => row(9, tick, i * 10)),
    ...[500, 501, 502, 503].map((tick, i) => row(9, tick, 1000 + i * 10)), // mesma entidade, bem depois e em outro lugar
    { grenade_entity_id: 3, grenade_type: 'CHEGrenade', steamid: '1', tick: 100, x: 0, y: 0, z: 0 },
    { grenade_entity_id: 4, grenade_type: 'CHEGrenadeProjectile', steamid: '1', tick: 'x', x: 0, y: 0, z: 0 },
    row(5, 100, 0)
  ]);
  assert.deepEqual(tracks.map((t) => [t.entityId, t.startTick, t.type]), [[9, 100, 'he'], [9, 500, 'he']]);
  assert.equal(GrenadeTracks.fromRows(null).length, 0);
  const found = GrenadeTracks.match(tracks, { tick: 503, type: 'he', x: 1030, y: 0, thrower: '1' }, 64);
  assert.equal(found.startTick, 500, 'liga ao percurso certo');
  assert.equal(GrenadeTracks.match(tracks, { tick: 503, type: 'he', x: 1030, y: 0, thrower: '1' }, 64)?.startTick, undefined, 'cada percurso vale uma vez');
  assert.equal(GrenadeTracks.match(tracks, { tick: 103, type: 'he', x: 30, y: 0, thrower: '2' }, 64), null, 'outro jogador nao liga');
});

test('cegueira: quem, por quanto tempo e quem jogou a flash', () => {
  const { blinds } = new DemoAnalyzer(fakeEngine()).analyze('x.dem').rounds[0];
  assert.deepEqual(blinds, [{ t: 18.91, victim: 2, attacker: 1, duration: 2.5 }]);
});

const GEAR = ['Knife', 'Glock-18'];
const deathDrops = (engine) => new DemoAnalyzer(engine).analyze('x.dem').rounds[0].drops.filter((d) => d.death);

test('granadas no chao: quem morre solta UMA granada, a mais cara do inventario; some quando alguem pega', () => {
  // o jogador 3 morre no tick 1000 com 2 flashes e uma smoke: so a smoke cai (a mais cara); a arma na mao nao importa
  const drops = deathDrops(withInventory(fakeEngine(), '3', [...GEAR, 'Flashbang', 'Flashbang', 'Smoke Grenade']));
  assert.deepEqual(drops.map((d) => [d.type, d.death]), [['smoke', true]]);
  assert.deepEqual([drops[0].x, drops[0].y, drops[0].z, drops[0].t], [-1200, -1000, 120, 15.63]);
  assert.equal(drops[0].until, 20.31, 'o jogador 1 pegou a smoke (tick 1300)');
  // a flash da compra (tick 300, longe e antes) nao fecha nada
  assert.equal(deathDrops(withInventory(fakeEngine(), '3', [...GEAR, 'Flashbang', 'Flashbang']))[0].until, null, 'ninguem pegou a flash');
});

test('morte: a granada que cai e a mais cara (incendiaria/molotov > smoke/HE > flash > decoy), uma so por morte', () => {
  const dropped = (...grenades) => deathDrops(withInventory(fakeEngine(), '3', [...GEAR, ...grenades])).map((d) => d.type);
  assert.deepEqual(dropped('Decoy Grenade', 'Flashbang', 'Smoke Grenade', 'Molotov'), ['fire']);
  assert.deepEqual(dropped('Flashbang', 'Incendiary Grenade', 'High Explosive Grenade'), ['fire']);
  assert.deepEqual(dropped('Decoy Grenade', 'Flashbang', 'Flashbang'), ['flash']);
  assert.deepEqual(dropped('High Explosive Grenade', 'Flashbang'), ['he']);
  assert.deepEqual(dropped('Decoy Grenade'), ['decoy']);
  assert.deepEqual(dropped(), [], 'sem granadas: nada cai');
  assert.equal(deathDrops(fakeEngine()).length, 1, 'o inventario padrao tem 4 granadas e so uma cai');
});

test('nomes dos times vem da demo (o time A e quem comecou como CT) e sao opcionais', () => {
  const named = new DemoAnalyzer(createFakeEngine({ perSide: 2, clanNames: ['Alpha FC', 'Bravo Esports'] })).analyze('x.dem');
  assert.deepEqual(named.teams, { a: 'Alpha FC', b: 'Bravo Esports' });
  assert.equal(named.features.teamNames, true);
  const unnamed = new DemoAnalyzer(fakeEngine()).analyze('x.dem');
  assert.deepEqual(unnamed.teams, { a: null, b: null });
  const same = new DemoAnalyzer(createFakeEngine({ perSide: 2, clanNames: ['Mesmo', 'Mesmo'] })).analyze('x.dem');
  assert.deepEqual(same.teams, { a: 'Mesmo', b: null }, 'nome repetido nos dois lados nao vale');
});

test('nomes de armas: exibicao e classe viram o mesmo nome; principal vence a pistola', () => {
  assert.deepEqual(['AK-47', 'weapon_ak47', 'M4A1-S', 'm4a1_silencer', 'M4A4', 'USP-S', 'Desert Eagle', 'Glock-18', 'Zeus x27', 'C4 Explosive', 'planted_c4', 'Karambit', 'weapon_knife_t', 'High Explosive Grenade', 'Incendiary Grenade', 'SSG 08'].map((n) => WeaponNames.canonical(n)),
    ['ak47', 'ak47', 'm4a1_silencer', 'm4a1_silencer', 'm4a1', 'usp_silencer', 'deagle', 'glock', 'taser', 'c4', 'c4', 'knife', 'knife', 'hegrenade', 'incgrenade', 'ssg08']);
  assert.equal(WeaponNames.canonical(''), '');
  assert.equal(WeaponNames.canonical('Alguma Arma Nova'), 'alguma_arma_nova', 'desconhecida: so normaliza');
  assert.equal(WeaponNames.main(['Knife', 'Glock-18', 'AK-47', 'Smoke Grenade']), 'ak47');
  assert.equal(WeaponNames.main(['Knife', 'USP-S', 'Flashbang']), 'usp_silencer');
  assert.equal(WeaponNames.main(['Knife', 'C4 Explosive']), '');
});

test('C4: bit proprio no inteiro de granadas, igual no main e no renderer', () => {
  const packed = GrenadeInventory.pack(['Knife', 'C4 Explosive', 'Flashbang']);
  assert.equal(GrenadeInventory.hasC4(packed), true);
  assert.equal(GrenadeLoadout.hasC4(packed), true);
  assert.equal(GrenadeInventory.hasC4(GrenadeInventory.pack(['Knife', 'Flashbang'])), false);
  assert.equal(GrenadeInventory.hasC4(GrenadeInventory.pack(null, [42, 49])), true, 'por id (49)');
  assert.deepEqual(GrenadeLoadout.items(packed), [{ type: 'flash', count: 1 }], 'a C4 nao aparece como granada');
  assert.deepEqual(GrenadeInventory.droppable(packed), ['flash', 'c4']);
  assert.equal(GrenadeLoadout.C4_BIT, GrenadeInventory.C4_BIT);
});

test('arma principal do inventario vai em cada frame (a ativa continua no indice 9)', () => {
  const engine = createFakeEngine({ perSide: 2 });
  const parseTicks = engine.parseTicks;
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => (row.inventory ? { ...row, inventory: [...row.inventory, 'AK-47'] } : row));
  const result = new DemoAnalyzer(engine).analyze('x.dem');
  const entry = result.rounds[0].frames[0].p[0];
  assert.equal(result.weapons[entry[12]], 'ak47');
  assert.ok(['m4a1', 'ak47'].includes(result.weapons[entry[9]]));
  assert.equal(result.features.economy, true);
});

/** Parser falso em que o inventario de um jogador perde itens em certos ticks (o resto da partida e a de sempre). */
function engineWithInventory(change) {
  const engine = createFakeEngine({ perSide: 2 });
  const parseTicks = engine.parseTicks;
  const ITEM_ID = { Knife: 42, 'Glock-18': 4, 'Smoke Grenade': 45, Flashbang: 43, 'High Explosive Grenade': 44, 'C4 Explosive': 49, 'AK-47': 7 };
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => {
    if (!row.inventory) return row;
    const inventory = change(row.steamid, row.tick, [...row.inventory]);
    return { ...row, inventory, ...(row.inventory_as_ids ? { inventory_as_ids: inventory.map((name) => ITEM_ID[name]) } : {}) };
  });
  return engine;
}
const without = (list, item) => { const at = list.indexOf(item); if (at >= 0) list.splice(at, 1); return list; };

test('largar de proposito: queda no inventario sem arremesso vira item no chao (e quem pega, fecha)', () => {
  const engine = engineWithInventory((id, tick, inv) => (id === '2' && tick >= 1400 ? without(inv, 'Flashbang') : inv));
  const { drops } = new DemoAnalyzer(engine).analyze('x.dem').rounds[0];
  const voluntary = drops.filter((d) => d.death === false);
  assert.equal(voluntary.length, 1);
  assert.deepEqual([voluntary[0].type, voluntary[0].side, voluntary[0].t], ['flash', 3, 22]);
  assert.deepEqual([voluntary[0].x, voluntary[0].y], [140.8, 20], 'no lugar de quem largou');
  assert.equal(drops.filter((d) => d.death === true).length, 1, 'a morte solta uma granada so');
});

test('largar de proposito: arremesso e plantio explicam a queda e nao viram drop', () => {
  // player 2 joga a flash no tick 1150..1200 (ver createFakeEngine): o inventario cai no momento do arremesso
  const thrown = engineWithInventory((id, tick, inv) => (id === '2' && tick >= 1152 ? without(inv, 'Flashbang') : inv));
  assert.equal(new DemoAnalyzer(thrown).analyze('x.dem').rounds[0].drops.filter((d) => d.death === false).length, 0, 'arremessada');
  // C4 some do inventario logo antes do bomb_planted (tick 3000, round 2)
  const planted = engineWithInventory((id, tick, inv) => (id === '1' && tick < 2990 && tick >= 1920 ? [...inv, 'C4 Explosive'] : inv));
  assert.equal(new DemoAnalyzer(planted).analyze('x.dem').rounds[1].drops.filter((d) => d.type === 'c4').length, 0, 'plantada');
});

test('C4 largada: aparece no chao, tambem quando o carregador morre', () => {
  const engine = engineWithInventory((id, tick, inv) => (id === '1' && tick < 1400 ? [...inv, 'C4 Explosive'] : inv));
  const { drops } = new DemoAnalyzer(engine).analyze('x.dem').rounds[0];
  assert.deepEqual(drops.filter((d) => d.type === 'c4').map((d) => [d.death, d.side]), [[false, 3]]);
});

test('EntityNotFound: eventos e ticks problematicos nao derrubam a analise', () => {
  const entity = () => Object.assign(new Error('EntityNotFound'), { code: 'GenericFailure' });
  const base = createFakeEngine({ perSide: 2 });

  // 1) leitura de eventos em bloco com propriedades de jogador falha; evento a evento sem elas funciona
  const noPlayerProps = { ...base, parseEvents: (path, names, playerProps, other) => { if (names.length > 1 || playerProps.length) throw entity(); return base.parseEvents(path, names, playerProps, other); } };
  assert.equal(new DemoAnalyzer(noPlayerProps).analyze('x.dem').rounds.length, 3);

  // 2) um unico tick quebra o parser (propriedades iguais): so aquele tick e descartado
  let badTick = null;
  const brokenTick = { ...base, parseTicks: (path, props, ticks) => { badTick ??= ticks[Math.floor(ticks.length / 2)]; if (ticks.includes(badTick)) throw entity(); return base.parseTicks(path, props, ticks); } };
  const analyzed = new DemoAnalyzer(brokenTick).analyze('x.dem');
  assert.equal(analyzed.rounds.length, 3);

  // 3) erro real (nada funciona) continua aparecendo com a mensagem do parser
  const dead = { ...base, parseEvents: () => { throw entity(); } };
  assert.throws(() => new DemoAnalyzer(dead).analyze('x.dem'), /EntityNotFound/);
});

test('kit de defuse: entra no inventario, cai na morte e o bit do viewer bate com o do analisador', () => {
  assert.equal(GrenadeLoadout.DEFUSER_BIT, GrenadeInventory.DEFUSER_BIT);
  assert.equal(GrenadeInventory.hasDefuser(GrenadeInventory.pack([], null, true)), true);
  assert.equal(GrenadeInventory.hasDefuser(GrenadeInventory.pack(['Defuse Kit'])), true);
  assert.equal(GrenadeInventory.hasDefuser(GrenadeInventory.pack([], [55])), true);
  assert.equal(GrenadeInventory.hasDefuser(GrenadeInventory.pack(['Smoke Grenade'])), false);
  assert.equal(GrenadeInventory.carriesGear(GrenadeInventory.DEFUSER_BIT), false, 'so o kit nao prova leitura do inventario');
  assert.deepEqual(GrenadeInventory.droppable(GrenadeInventory.pack(['Smoke Grenade'], null, true)), ['smoke', 'defuser']);
  assert.equal(GrenadeInventory.classify('Defuse Kit'), 'defuser');
  assert.equal(GrenadeInventory.classify('defuser'), 'defuser');
  assert.deepEqual(GrenadeLoadout.items(GrenadeInventory.DEFUSER_BIT), [], 'o kit nao vira granada no painel');

  const engine = fakeEngine();
  const parseTicks = engine.parseTicks;
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => (row.steamid === '3' ? { ...row, has_defuser: true } : row));
  const drops = new DemoAnalyzer(engine).analyze('x.dem').rounds[0].drops;
  const kit = drops.find((drop) => drop.type === 'defuser');
  assert.ok(kit, 'quem morre com o kit o larga no chao');
  assert.equal(kit.death, true);
});

test('killfeed completo: assistencia (flash), cego, sem mira, fumaca, parede e faca especifica chegam no round', () => {
  const engine = fakeEngine();
  const parseEvents = engine.parseEvents;
  engine.parseEvents = (path, names, ...rest) => parseEvents(path, names, ...rest).map((e) => (e.event_name === 'player_death' && e.tick === 1000
    ? { ...e, assister_steamid: '2', assister_name: 'P2', assistedflash: true, attackerblind: true, noscope: true, thrusmoke: true, penetrated: 1, weapon: 'knife_karambit' }
    : e));
  const kill = new DemoAnalyzer(engine).analyze('x.dem').rounds[0].kills.find((k) => k.t === 5.62) ?? new DemoAnalyzer(engine).analyze('x.dem').rounds[0].kills[0];
  assert.equal(kill.assister, 1, 'indice do assistente');
  assert.equal(kill.flashAssist, true);
  assert.equal(kill.blind, true);
  assert.equal(kill.noScope, true);
  assert.equal(kill.throughSmoke, true);
  assert.equal(kill.wallbang, true);
  assert.equal(kill.weapon, 'knife_karambit');
  assert.equal(WeaponNames.kill('Karambit'), 'knife', 'sem nome de classe de faca conhecido: generica');
  assert.equal(WeaponNames.kill('weapon_ak47'), 'ak47');
  const plain = new DemoAnalyzer(fakeEngine()).analyze('x.dem').rounds[0].kills[0];
  assert.equal(plain.assister, undefined);
  assert.equal(plain.flashAssist, undefined, 'so entra no abate o que ocorreu');
});

test('erros do leitor de demos viram orientacao (atualizar o CSDraw); as mensagens nossas continuam e ganham a dica', () => {
  const broken = { parseHeader: () => { throw new Error('unsupported demo format'); } };
  assert.throws(() => new DemoAnalyzer(broken, () => {}, '0.42.3').analyze('x.dem'), /demoparser2 0\.42\.3.*atualizado.*unsupported demo format/s);
  assert.throws(() => new DemoAnalyzer(broken).analyze('x.dem'), /\(demoparser2\).*atualizado/s, 'sem versao conhecida');
  const noRounds = { ...createFakeEngine({ perSide: 2 }), parseEvents: () => [] };
  const message = (() => { try { new DemoAnalyzer(noRounds, () => {}, '0.42.3').analyze('x.dem'); } catch (error) { return error.message; } return ''; })();
  assert.match(message, /^Nenhum round encontrado\./);
  assert.match(message, /desatualizado.*0\.42\.3/s);
  assert.equal(new DemoAnalyzer(createFakeEngine({ perSide: 2 }), () => {}, '0.42.3').analyze('x.dem').parserVersion, '0.42.3', 'a analise registra o leitor que a fez');
});

test('ParserVersion: le a versao do pacote, tenta a pasta se o subcaminho for bloqueado e nunca lanca', async () => {
  const { ParserVersion } = await import('../electron/core/demo/ParserVersion.js');
  const fake = (pkg) => Object.assign((id) => { if (id.endsWith('/package.json') && pkg) return pkg; throw new Error('bloqueado'); }, { resolve: () => { throw new Error('nao instalado'); } });
  assert.equal(ParserVersion.read(fake({ version: '1.2.3' })), '1.2.3');
  assert.equal(ParserVersion.read(fake(null)), null, 'nao instalado: null, sem lancar');
  assert.equal(ParserVersion.read(fake({ version: 7 })), null, 'versao que nao e texto nao vale');
  assert.ok(ParserVersion.read() === null || typeof ParserVersion.read() === 'string', 'leitura padrao: versao ou null');
  assert.equal(ParserVersion.read(fake({ version: '9.9.9' })), '9.9.9', 'o teste nao contamina a leitura padrao');
  assert.notEqual(ParserVersion.read(), '9.9.9');
});
