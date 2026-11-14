import { DropPhysics } from './DropPhysics.js';
import { GrenadeInventory } from './GrenadeInventory.js';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const GRENADE_TYPES = ['he', 'flash', 'smoke', 'fire', 'decoy'];

const BLIP_TICKS = 3; // entidade sem dono por tao pouco tempo e a arma sendo apagada num arremesso, nao um item no chao
const THROW_BLIP_TICKS = 12; // curta e junto de um weapon_fire do mesmo jogador: arremesso
const THROW_MATCH_SECONDS = 0.25;
const DEATH_BEFORE_TICKS = 4; // o item aparece no tick da morte (ou logo depois) com o morto como dono anterior
const DEATH_AFTER_TICKS = 64;
const STEP = 1.5; // um ponto novo no percurso so depois de andar isso
const STILL = 0.3; // andou menos que isso num tick = parado

/**
 * Itens no chao lidos da PROPRIA demo: as armas sem dono (`parseWeapons` do demoparser2) trazem, a cada tick, a posicao
 * que o servidor simulou (queda, rolagem, tombo) e quem as largou por ultimo. Nao ha estimativa: o item aparece quando
 * foi largado, anda como andou e some quando alguem o pega (ou o round acaba).
 *
 * Cada passagem continua de uma entidade pelo chao (ticks seguidos sem dono) e UM drop; largar e pegar de volta varias
 * vezes por segundo gera um drop por passagem. Funcoes puras, sem dependencias do parser.
 */
export class WeaponDrops {
  /**
   * Agrupa as linhas do parser por entidade, so granadas, C4 e kit de defuse (o resto, como rifles, nao importa aqui).
   * `any` diz se o parser entregou alguma arma no chao (sem isso nao ha como saber que ele funciona nesta demo);
   * `seen` guarda os tipos de item vistos.
   */
  static index(rows) {
    const groups = new Map();
    const seen = new Set();
    let any = false;
    for (const row of rows ?? []) {
      any = true;
      const type = GrenadeInventory.classify(row.weapon);
      if (!type) continue;
      seen.add(type);
      const tick = Number(row.tick);
      const x = Number(row.x ?? row.X);
      const y = Number(row.y ?? row.Y);
      const z = Number(row.z ?? row.Z);
      if (!Number.isFinite(tick) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = `${row.entity_id}|${type}`; // o id de uma entidade apagada pode voltar em outro item
      if (!groups.has(key)) groups.set(key, { type, rows: [] });
      const owner = row.steamid === undefined || row.steamid === null || row.steamid === '' || String(row.steamid) === '0' ? null : String(row.steamid);
      groups.get(key).rows.push({ tick, x, y, z: Number.isFinite(z) ? z : 0, owner });
    }
    const list = [...groups.values()];
    list.forEach((group) => group.rows.sort((a, b) => a.tick - b.tick));
    return { groups: list, seen, any };
  }

  /**
   * Tipos de item que esta leitura cobre. Se o parser entregou granadas, todas as cinco valem (ninguem sabe quais
   * ainda vao cair); C4 e kit so se apareceram (o kit pode nao ser uma entidade de arma). O resto cai no palpite
   * do DropTracker.
   */
  static covered(index) {
    const covered = new Set();
    if (!index?.any) return covered;
    if (GRENADE_TYPES.some((type) => index.seen.has(type))) GRENADE_TYPES.forEach((type) => covered.add(type));
    for (const type of ['c4', 'defuser']) if (index.seen.has(type)) covered.add(type);
    return covered;
  }

  /**
   * Drops de um round (`startTick`..`endTick`). `at(tick)` converte para segundos do round; `deaths` ({ tick, victim }),
   * `fires` ({ player, type, t }) e `playerIndex(steamid)` vem do RoundBuilder.
   */
  static build({ index, startTick, endTick, tickRate, at, deaths, fires, sides, playerIndex }) {
    const out = [];
    for (const group of index?.groups ?? []) {
      for (const run of WeaponDrops.#runs(group.rows, startTick, endTick)) {
        const drop = WeaponDrops.#drop(run, group.type, { startTick, endTick, tickRate, at, deaths, fires, sides, playerIndex });
        if (drop) out.push(drop);
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** Passagens continuas pelo chao dentro do round: um buraco de ao menos um tick quer dizer que alguem pegou o item. */
  static #runs(rows, startTick, endTick) {
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (rows[middle].tick < startTick) low = middle + 1; else high = middle;
    }
    const runs = [];
    let run = null;
    for (let i = low; i < rows.length && rows[i].tick <= endTick; i += 1) {
      const row = rows[i];
      if (run && row.tick === run[run.length - 1].tick) continue; // linha repetida no mesmo tick
      if (run && row.tick === run[run.length - 1].tick + 1) run.push(row);
      else { run = [row]; runs.push(run); }
    }
    return runs;
  }

  static #drop(run, type, c) {
    const first = run[0];
    const last = run[run.length - 1];
    if (run.length <= BLIP_TICKS) return null;
    const owner = run.find((row) => row.owner !== null)?.owner ?? null;
    const player = owner === null ? null : c.playerIndex(owner);
    const startSeconds = (first.tick - c.startTick) / c.tickRate;
    // Arremessar apaga a arma da mao: ela pode passar uns ticks sem dono antes de sumir. Isso nao e item no chao.
    if (run.length <= THROW_BLIP_TICKS && player !== null && c.fires.some((fire) => fire.player === player && fire.type === type && Math.abs(fire.t - startSeconds) <= THROW_MATCH_SECONDS)) return null;
    const death = player !== null && c.deaths.some((d) => d.victim === player && first.tick >= d.tick - DEATH_BEFORE_TICKS && first.tick <= d.tick + DEATH_AFTER_TICKS);

    const path = WeaponDrops.#path(run, c.tickRate);
    const drop = {
      type,
      x: round1(first.x),
      y: round1(first.y),
      z: round1(first.z),
      t: c.at(first.tick),
      until: last.tick < c.endTick ? c.at(last.tick + 1) : null,
      side: player === null ? null : c.sides[player] ?? null,
      death
    };
    if (path.length < 2) return drop;
    const end = path[path.length - 1];
    // `path`: [segundos desde o drop, x, y, z] a cada mudanca de posicao; toX/toY/fall resumem onde parou e quando.
    return { ...drop, path, ...(Math.hypot(end[1] - drop.x, end[2] - drop.y) >= DropPhysics.MIN_SHIFT ? { toX: end[1], toY: end[2], fall: end[0] } : {}) };
  }

  /**
   * Percurso do item: o primeiro ponto, cada ponto que andou ao menos `STEP` do anterior e o ponto em que ele para de
   * andar (para o instante do repouso ficar exato). A parte parada do fim nao entra: o item fica no ultimo ponto.
   */
  static #path(run, tickRate) {
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const kept = [run[0]];
    let latest = run[0];
    for (let i = 1; i < run.length; i += 1) {
      const row = run[i];
      const next = run[i + 1];
      const stops = distance(row, run[i - 1]) >= STILL && (!next || distance(next, row) < STILL);
      if (distance(row, latest) >= STEP || stops) { kept.push(row); latest = row; }
    }
    return kept.map((row) => [round2((row.tick - run[0].tick) / tickRate), round1(row.x), round1(row.y), round1(row.z)]);
  }
}
