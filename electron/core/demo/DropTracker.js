import { DropPhysics } from './DropPhysics.js';
import { GrenadeInventory } from './GrenadeInventory.js';

const round1 = (value) => Math.round(value * 10) / 10;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const number = (value) => (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

// ---- tempos (segundos) ----
const DROP_SETTLE_SECONDS = 1; // no inicio do round o jogo remonta os inventarios (troca de lados): nada vale
const CARRIED_MAX_AGE = 3; // a ultima leitura do inventario antes da morte pode ser um pouco velha (sem as sondagens e de ate 0,25 s)
const DEATH_BEFORE = 0.15; // item_remove tao perto da morte pertence a morte, nao e drop de proposito
const DEATH_AFTER = 0.5;
const THROW_MATCH = 0.3; // item_remove <-> weapon_fire / inicio do percurso da granada: e arremesso, nao drop
const THROW_SLACK = 0.6; // folga entre o arremesso e a queda do inventario (caminho sem eventos)
const MAX_UNTRACKED_FLIGHT = 6.5; // sem trajetoria nem weapon_fire so se sabe quando explodiu
const REMOVAL_SLACK = 0.3;
const PICKUP_EARLY_EXACT = 0.05; // drop com instante exato: so pode ser pego depois dele (alguns ticks de folga)
const PICKUP_EARLY_COARSE = 0.5; // drop achado pelo inventario (quadros de 0,25 s): o instante real e anterior
const SAME_DROP_SECONDS = 1.5; // dois avisos de C4 largada tao proximos sao o mesmo drop
const MAX_LOST_PER_STEP = 2; // perder mais que isso de uma vez e remontagem do inventario, nao um drop

// ---- distancias (unidades do jogo) ----
const TIGHT_RADIUS = 160; // pega a esta distancia do ponto estimado de repouso (ou da origem): casamento seguro
const LOOSE_RADIUS = 350; // segunda chance: pega ate aqui da origem (o item voa/desliza antes de parar)
const MAX_REST_SHIFT = 260; // item que "andou" mais que isso da origem nao e plausivel: ignora a posicao de quem pegou
const SAME_C4_RADIUS = 350;

// ---- sondagens: ticks lidos so para estas decisoes (alem dos quadros de 4 Hz) ----
// Granada que cai na morte: UMA, a mais cara do inventario (mp_death_drop_grenade 1), nao a que estava na mao. Ordem de valor
// (incendiaria 600 / molotov 400, smoke 300, HE 300, flash 200, decoy 50). Smoke e HE custam o mesmo: o empate e decidido por
// esta ordem (suposicao; basta trocar as duas posicoes se o jogo escolher a outra).
const DEATH_GRENADE_PRIORITY = ['fire', 'smoke', 'he', 'flash', 'decoy'];
const DEATH_PROBES = [1, 6]; // 1 tick antes (inventario/arma na mao exatos) e 6 (para a velocidade)
const REMOVE_PROBES = [1, 6]; // a velocidade de quem largou sai de duas leituras do proprio jogador
const VELOCITY_MIN_TICKS = 2;
const VELOCITY_WINDOW_SECONDS = 0.6;

/**
 * Itens no chao (granadas, C4 e kit de defuse) de um round. Funcoes puras.
 *
 * O demo so diz com exatidao QUANDO e ONDE o item saiu do jogador e QUANDO alguem o pegou; onde ele para e estimado
 * (DropPhysics) e corrigido pelo lugar de quem pegou. Regras:
 *
 * - Kit de defuse: so cai na MORTE de quem o tem (o jogo nao deixa largar o kit; perder `has_defuser` de um quadro para o outro
 *   e remontagem do inventario, nao drop). Pegar o kit do chao vale normalmente.
 * - Morte: o jogador solta UMA granada, a mais cara do inventario (`DEATH_GRENADE_PRIORITY`), mais a C4 e o kit de
 *   defuse. As outras granadas somem com ele: nao existem no chao. Sem o inventario lido, nenhuma granada cai.
 * - Largar de proposito: cada `item_remove` que nao e morte, arremesso ou round novo e um drop, com o instante, o
 *   lugar e o olhar exatos. Vale para varios por segundo e para largar-e-pegar dentro do mesmo quadro. Sem o evento
 *   (parser que nao o entrega), o drop vem da queda do inventario entre dois quadros seguidos.
 * - Pegar: `item_pickup`/`bomb_pickup` fecham o drop do mesmo tipo mais plausivel (perto de onde ele deve ter parado,
 *   ja existente naquele instante). So ha pega por crescimento de inventario quando a demo nao traz `item_pickup`.
 * - So existe uma C4 por round: nunca ha duas no chao, e depois do plantio nao ha nenhuma.
 */
export class DropTracker {
  /** Ticks extras a ler: logo antes de cada morte e de cada item_remove (so dentro dos rounds). */
  static probeTicks(events, rounds) {
    const ticks = new Set();
    const inside = (tick) => rounds.some((round) => tick >= round.startTick && tick <= round.endTick);
    const add = (list, offsets) => {
      for (const event of list ?? []) {
        const tick = Number(event.tick);
        if (!Number.isFinite(tick)) continue;
        for (const offset of offsets) if (inside(tick - offset)) ticks.add(tick - offset);
      }
    };
    add(events.player_death, DEATH_PROBES);
    add(events.item_remove, REMOVE_PROBES);
    return [...ticks].sort((a, b) => a - b);
  }

  /**
   * @param {object} c
   *  startTick, tickRate  inicio do round e taxa de ticks
   *  frames               quadros do round ({ t, p: [entradas] }), usados no caminho sem eventos
   *  timeline             Map(jogador -> [{ tick, entry }]) com TODAS as leituras (quadros + sondagens), por tick
   *  deaths [{ tick, victim, x, y, z }], removals, pickups, bombPickups, bombDrops (eventos crus do round)
   *  fires [{ player, type, t }], throws (granadas arremessadas do round), bomb [{ t, type }]
   *  sides, playerIndex(steamid), hasRemoveEvents, hasPickupEvents, hasFireEvents (a demo traz o evento)
   */
  static build(c) {
    const env = { ...c, at: (tick) => Math.max(0, Math.round(((tick - c.startTick) / c.tickRate) * 100) / 100) };
    const drops = [...DropTracker.#deathDrops(env)];
    const evented = DropTracker.#removalDrops(env);
    const diff = DropTracker.#inventoryDiff(env, evented);
    drops.push(...evented, ...diff.lost);
    drops.push(...DropTracker.#bombDrops(env, drops));

    const unique = DropTracker.#withoutDuplicateC4(drops);
    unique.sort((a, b) => a.t - b.t);
    unique.forEach((drop) => { drop.rest = DropTracker.#rest(drop); });
    DropTracker.#match(unique, DropTracker.#pickups(env, diff.gained));
    DropTracker.#singleC4(unique, c.bomb);
    return unique.map((drop) => DropTracker.#settled(drop, c.sides));
  }

  // ---------------------------------------------------------------- leituras do jogador

  /** Leitura do jogador mais proxima de `tick` (viva ou nao); null se ele nao aparece. */
  static #nearest(c, player, tick) {
    const list = c.timeline.get(player);
    if (!list?.length) return null;
    let best = null;
    for (const item of list) {
      const gap = Math.abs(item.tick - tick);
      if (best && gap >= best.gap) { if (item.tick > tick) break; continue; }
      best = { gap, item };
    }
    return best?.item ?? null;
  }

  /** Ultima leitura com o jogador vivo ate `tick`. */
  static #liveBefore(c, player, tick) {
    const list = c.timeline.get(player) ?? [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index].tick <= tick && list[index].entry[4] > 0) return list[index];
    }
    return null;
  }

  /**
   * Posicao de um evento. Sem as propriedades do jogador (o parser recusou: propriedade ausente), vem da leitura mais
   * proxima dele; propriedade presente mas invalida descarta o evento.
   */
  static #locate(c, player, tick, x, y, z) {
    if (x === undefined || x === null || y === undefined || y === null) {
      const near = player === null ? null : DropTracker.#nearest(c, player, tick);
      return near ? { x: near.entry[1], y: near.entry[2], z: near.entry[6], exact: false } : null;
    }
    return Number.isFinite(Number(x)) && Number.isFinite(Number(y)) ? { x: Number(x), y: Number(y), z: Number(z) || 0, exact: true } : null;
  }

  /** Velocidade horizontal em `tick`: duas leituras do proprio jogador (mesma fonte), a mais nova ate `tick` e uma anterior. */
  static #velocity(c, player, tick) {
    const list = c.timeline.get(player) ?? [];
    let newest = null;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const { tick: at, entry } = list[index];
      if (at > tick || entry[4] <= 0) continue;
      if (!newest) { newest = { tick: at, x: entry[1], y: entry[2] }; continue; }
      const gap = newest.tick - at;
      if (gap < VELOCITY_MIN_TICKS) continue;
      if (gap / c.tickRate > VELOCITY_WINDOW_SECONDS) break;
      return DropPhysics.velocity({ x: entry[1], y: entry[2] }, newest, gap / c.tickRate);
    }
    return { vx: 0, vy: 0 };
  }

  static #aim(c, player, tick, event) {
    const near = player === null ? null : DropTracker.#nearest(c, player, tick)?.entry;
    return { yaw: number(event.user_yaw) ?? number(near?.[3]), pitch: number(event.user_pitch) ?? number(near?.[10]) ?? 0 };
  }

  // ---------------------------------------------------------------- morte

  /**
   * Quem morre solta UMA granada, a mais cara do inventario (a que estava na mao nao importa), a C4 e o kit de defuse.
   * Quem arremessou uma granada um instante antes de morrer (weapon_fire ou percurso) ja nao a tem: ela sai da lista
   * antes da escolha, e a mais cara das que sobraram e que cai.
   */
  static #deathDrops(c) {
    const out = [];
    for (const death of c.deaths) {
      const victim = death.victim;
      if (victim === null) continue;
      const last = DropTracker.#liveBefore(c, victim, death.tick);
      const place = DropTracker.#locate(c, victim, death.tick, death.x, death.y, death.z);
      if (!last || !place) continue;
      const age = (death.tick - last.tick) / c.tickRate;
      const packed = age <= CARRIED_MAX_AGE ? last.entry[11] : 0;
      const range = { player: victim, from: (last.tick - c.startTick) / c.tickRate, to: (death.tick - c.startTick) / c.tickRate, fires: c.fires, throws: c.throws };
      const grenades = DropTracker.#withoutThrown(GrenadeInventory.droppable(packed).filter((type) => type !== 'c4' && type !== 'defuser'), range);
      const best = DEATH_GRENADE_PRIORITY.find((type) => grenades.includes(type));
      const items = best ? [best] : [];
      if (GrenadeInventory.hasC4(packed)) items.push('c4');
      if (GrenadeInventory.hasDefuser(packed)) items.push('defuser');
      const motion = { ...DropTracker.#velocity(c, victim, death.tick), yaw: null, pitch: 0 };
      for (const type of items) out.push({ type, x: place.x, y: place.y, z: place.z, t: c.at(death.tick), exact: true, kind: 'death', player: victim, until: null, motion });
    }
    return out;
  }

  /** Tira da lista o que o jogador arremessou entre `from` e `to`: essas granadas nao caem no chao. */
  static #withoutThrown(list, { player, from, to, fires, throws }) {
    const remove = (type) => { const at = list.indexOf(type); if (at >= 0) list.splice(at, 1); };
    const fired = fires.filter((fire) => fire.player === player && fire.t >= from - 0.02 && fire.t <= to + 0.05);
    fired.forEach((fire) => remove(fire.type));
    for (const grenade of throws) {
      if (grenade.thrower !== player || !grenade.path || grenade.thrownT < from - 0.02 || grenade.thrownT > to + 0.05) continue;
      if (!fired.some((fire) => fire.type === grenade.type && Math.abs(fire.t - grenade.thrownT) <= THROW_SLACK)) remove(grenade.type);
    }
    return list;
  }

  // ---------------------------------------------------------------- largar de proposito (eventos)

  /** Cada item_remove que nao e morte, arremesso nem round novo e um drop, com o instante, o lugar e o olhar exatos. */
  static #removalDrops(c) {
    const out = [];
    const usedFires = new Set();
    const usedThrows = new Set();
    for (const event of c.removals) {
      const player = c.playerIndex(event.user_steamid);
      const type = GrenadeInventory.classify(event.item ?? event.weapon);
      if (player === null || !type || type === 'c4' || type === 'defuser') continue; // a C4 tem eventos proprios (bomb_dropped); o kit nao pode ser largado: so cai na morte
      const t = c.at(event.tick);
      if (t <= DROP_SETTLE_SECONDS) continue;
      if (c.deaths.some((death) => death.victim === player && t >= c.at(death.tick) - DEATH_BEFORE && t <= c.at(death.tick) + DEATH_AFTER)) continue;
      if (DropTracker.#wasThrown(c, { player, type, t, usedFires, usedThrows })) continue;
      const place = DropTracker.#locate(c, player, event.tick, event.user_X, event.user_Y, event.user_Z);
      if (!place) continue;
      const motion = { ...DropTracker.#velocity(c, player, event.tick), ...DropTracker.#aim(c, player, event.tick, event) };
      out.push({ type, x: place.x, y: place.y, z: place.z, t, exact: true, kind: 'drop', player, until: null, motion });
    }
    return out;
  }

  /** O item sumiu por arremesso? weapon_fire e o inicio do percurso provam; cada prova vale uma vez. */
  static #wasThrown(c, { player, type, t, usedFires, usedThrows }) {
    const fire = c.fires.find((f) => !usedFires.has(f) && f.player === player && f.type === type && Math.abs(f.t - t) <= THROW_MATCH);
    const grenade = c.throws.find((g) => {
      if (usedThrows.has(g) || g.type !== type || (g.thrower !== null && g.thrower !== player)) return false;
      if (g.path) return Math.abs(g.thrownT - t) <= THROW_MATCH;
      return !c.hasFireEvents && g.t >= t - THROW_MATCH / 2 && g.t <= t + MAX_UNTRACKED_FLIGHT;
    });
    if (fire) usedFires.add(fire);
    if (grenade && (fire || !c.hasFireEvents)) usedThrows.add(grenade);
    return Boolean(fire || grenade);
  }

  // ---------------------------------------------------------------- caminho sem eventos: inventario entre quadros

  /**
   * Compara os inventarios de quadros seguidos de cada jogador vivo. `lost`: o que sumiu sem explicacao (largado);
   * `gained`: o que apareceu (pegou do chao ou comprou). Quando a demo traz item_remove, as granadas ficam por conta
   * dos eventos (so C4 e kit usam este caminho); o que um evento ja explica nao se repete.
   */
  static #inventoryDiff(c, evented) {
    const lost = [];
    const gained = [];
    const claimed = new Set();
    const usedThrows = new Set();
    const usedFires = new Set();
    const plantedAt = c.bomb.filter((b) => b.type === 'planted').map((b) => b.t);
    const fired = (type, player, from, to) => {
      const fire = c.fires.find((f) => !usedFires.has(f) && f.type === type && f.player === player && f.t >= from - THROW_SLACK && f.t <= to + THROW_SLACK);
      if (fire) usedFires.add(fire);
      return Boolean(fire);
    };
    const explains = (type, player, from, to) => c.throws.find((g) => {
      if (usedThrows.has(g) || g.type !== type || (g.thrower !== null && g.thrower !== player)) return false;
      return g.path ? g.thrownT >= from - THROW_SLACK && g.thrownT <= to + THROW_SLACK : g.t >= from - THROW_SLACK / 2 && g.t <= to + MAX_UNTRACKED_FLIGHT;
    });

    const previous = new Map();
    for (const frame of c.frames) {
      for (const entry of frame.p) {
        const before = previous.get(entry[0]);
        previous.set(entry[0], { t: frame.t, entry });
        if (!before || entry[4] <= 0 || before.entry[4] <= 0 || entry[5] !== before.entry[5]) continue;
        const now = GrenadeInventory.droppable(entry[11]);
        const gone = GrenadeInventory.droppable(before.entry[11]).filter((type) => {
          const at = now.indexOf(type);
          if (at >= 0) { now.splice(at, 1); return false; }
          return true;
        });
        now.forEach((type) => gained.push({ player: entry[0], type, t: frame.t, x: entry[1], y: entry[2] })); // o que sobrou apareceu
        if (!gone.length || frame.t <= DROP_SETTLE_SECONDS || gone.length > MAX_LOST_PER_STEP) continue;
        for (const type of gone) {
          if (type === 'defuser') continue; // o kit nao pode ser largado (so cai na morte): sumir do inventario e troca de round, compra ou leitura, nunca drop
          const special = type === 'c4';
          if (type === 'c4' && plantedAt.some((t) => t >= before.t - 1 && t <= frame.t + 1)) continue; // plantou
          if (!special && c.hasRemoveEvents) continue; // os item_remove mandam nas granadas
          const known = evented.findIndex((d, index) => !claimed.has(index) && d.player === entry[0] && d.type === type && d.t >= before.t - REMOVAL_SLACK && d.t <= frame.t + REMOVAL_SLACK);
          if (known >= 0) { claimed.add(known); continue; }
          if (!special && fired(type, entry[0], before.t, frame.t)) {
            const match = explains(type, entry[0], before.t, frame.t);
            if (match) usedThrows.add(match); // a mesma granada nao explica outra queda
            continue;
          }
          const grenade = special ? null : explains(type, entry[0], before.t, frame.t);
          if (grenade) { usedThrows.add(grenade); continue; }
          const dt = frame.t - before.t;
          const motion = {
            vx: dt > 0 ? (entry[1] - before.entry[1]) / dt : 0,
            vy: dt > 0 ? (entry[2] - before.entry[2]) / dt : 0,
            yaw: entry[3],
            pitch: entry[10]
          };
          lost.push({ type, x: entry[1], y: entry[2], z: entry[6], t: frame.t, exact: false, kind: 'drop', player: entry[0], until: null, motion });
        }
      }
    }
    return { lost, gained };
  }

  // ---------------------------------------------------------------- C4

  /** bomb_dropped cobre quem largou a C4 quando o inventario nao foi lido (ou nao trouxe a C4). */
  static #bombDrops(c, existing) {
    const out = [];
    for (const event of c.bombDrops) {
      const player = c.playerIndex(event.user_steamid);
      const place = DropTracker.#locate(c, player, event.tick, event.user_X, event.user_Y, event.user_Z);
      const t = c.at(event.tick);
      if (!place) continue;
      if ([...existing, ...out].some((d) => d.type === 'c4' && Math.abs(d.t - t) <= SAME_DROP_SECONDS && distance(d, place) <= SAME_C4_RADIUS)) continue;
      const died = c.deaths.some((death) => death.victim === player && Math.abs(c.at(death.tick) - t) <= 0.5);
      const motion = { ...DropTracker.#velocity(c, player, event.tick), ...(died ? { yaw: null, pitch: 0 } : DropTracker.#aim(c, player, event.tick, event)) };
      out.push({ type: 'c4', x: place.x, y: place.y, z: place.z, t, exact: true, kind: died ? 'death' : 'drop', player, until: null, motion });
    }
    return out;
  }

  /** Uma C4 so existe uma vez: dois avisos do mesmo drop (inventario + bomb_dropped) viram um. */
  static #withoutDuplicateC4(drops) {
    const kept = [];
    for (const drop of [...drops].sort((a, b) => a.t - b.t)) {
      const twin = drop.type === 'c4' && kept.find((d) => d.type === 'c4' && Math.abs(d.t - drop.t) <= SAME_DROP_SECONDS && distance(d, drop) <= SAME_C4_RADIUS);
      if (!twin) kept.push(drop);
    }
    return kept;
  }

  /**
   * Nunca duas C4 no chao: quando aparece uma C4 nova, a anterior ja foi pega por quem a largou agora; e depois do
   * plantio nao ha C4 no chao. Corrige o caso em que o aviso de "pegou" nao veio.
   */
  static #singleC4(drops, bomb) {
    const c4 = drops.filter((drop) => drop.type === 'c4').sort((a, b) => a.t - b.t);
    const plantedAt = bomb.find((b) => b.type === 'planted')?.t;
    c4.forEach((drop, index) => {
      const limits = [c4[index + 1]?.t, plantedAt].filter((value) => value !== undefined && value >= drop.t);
      if (!limits.length) return;
      const limit = Math.min(...limits);
      if (drop.until === null || drop.until > limit) drop.until = limit;
    });
  }

  // ---------------------------------------------------------------- pegar

  /** Quem pegou o que e quando: item_pickup, bomb_pickup e (so sem item_pickup na demo) o inventario que cresceu. */
  static #pickups(c, gained) {
    const list = [];
    for (const event of c.pickups) {
      const player = c.playerIndex(event.user_steamid);
      const type = GrenadeInventory.classify(event.item ?? event.weapon);
      const place = DropTracker.#locate(c, player, event.tick, event.user_X, event.user_Y, event.user_Z);
      if (type && place) list.push({ player, type, t: c.at(event.tick), x: place.x, y: place.y });
    }
    // A C4 tem evento proprio (bomb_pickup); vale o item_pickup tambem, mas um aviso so conta uma vez.
    for (const event of c.bombPickups) {
      const player = c.playerIndex(event.user_steamid);
      const place = DropTracker.#locate(c, player, event.tick, event.user_X, event.user_Y, event.user_Z);
      const t = c.at(event.tick);
      if (place && !list.some((p) => p.type === 'c4' && p.player === player && Math.abs(p.t - t) <= 1)) list.push({ player, type: 'c4', t, x: place.x, y: place.y });
    }
    // Sem item_pickup na demo, o inventario que cresceu e a unica pista de grenada pega; C4 e kit tambem a aceitam. Aviso ja visto vale uma vez.
    for (const g of gained) {
      if (c.hasPickupEvents && g.type !== 'c4' && g.type !== 'defuser') continue;
      if (!list.some((p) => p.type === g.type && p.player === g.player && Math.abs(p.t - g.t) <= 1)) list.push(g);
    }
    return list.sort((a, b) => a.t - b.t);
  }

  /**
   * Cada pega fecha UM drop aberto do mesmo tipo que ja existia naquele instante. Primeiro o mais perto do ponto onde
   * ele deve ter parado (ou da origem) dentro de um raio curto; so se nenhum serve, o mais perto de onde parou dentro
   * de um raio largo (o item voa/desliza). Como cada pega so enxerga drops anteriores a ela e fecha o escolhido,
   * quem larga e pega varias vezes seguidas fecha cada drop com a sua propria pega.
   */
  static #match(drops, pickups) {
    for (const pickup of pickups) {
      const open = drops.filter((d) => d.until === null && d.type === pickup.type && d.t <= pickup.t + (d.exact ? PICKUP_EARLY_EXACT : PICKUP_EARLY_COARSE));
      const best = DropTracker.#closest(open, (d) => {
        const near = Math.min(distance(d.rest, pickup), distance(d, pickup));
        return near <= TIGHT_RADIUS ? near : null;
      }) ?? DropTracker.#closest(open, (d) => (distance(d, pickup) <= LOOSE_RADIUS ? distance(d.rest, pickup) : null));
      if (best) { best.until = pickup.t; best.pickedAt = { x: pickup.x, y: pickup.y }; }
    }
  }

  /** Menor pontuacao (null descarta); empate fica com o mais antigo (a lista vem ordenada por tempo). */
  static #closest(list, score) {
    let best = null;
    for (const drop of list) {
      const value = score(drop);
      if (value !== null && (!best || value < best.value)) best = { drop, value };
    }
    return best?.drop ?? null;
  }

  // ---------------------------------------------------------------- onde para

  /** Ponto de repouso pelo modelo (sem considerar quem pegou). */
  static #rest(drop) {
    const motion = drop.motion ?? {};
    const model = drop.kind === 'death'
      ? DropPhysics.died({ x: drop.x, y: drop.y, vx: motion.vx, vy: motion.vy })
      : DropPhysics.thrown({ x: drop.x, y: drop.y, vx: motion.vx, vy: motion.vy, yaw: motion.yaw, pitch: motion.pitch });
    return { x: model?.x ?? drop.x, y: model?.y ?? drop.y, fall: model?.fall ?? null, moves: Boolean(model) };
  }

  /** Formato final do drop: onde para (quem pegou estava encostado no item; senao o modelo) e quanto leva. */
  static #settled(drop, sides) {
    const origin = { x: drop.x, y: drop.y };
    const death = drop.kind === 'death';
    let target = null;
    if (drop.pickedAt && distance(origin, drop.pickedAt) <= MAX_REST_SHIFT) target = drop.pickedAt;
    else if (drop.rest.moves) target = drop.rest;
    const out = { type: drop.type, x: round1(drop.x), y: round1(drop.y), z: round1(drop.z), t: drop.t, until: drop.until, side: sides[drop.player] ?? null, death };
    if (!target || distance(origin, target) < DropPhysics.MIN_SHIFT) return out;
    return { ...out, toX: round1(target.x), toY: round1(target.y), fall: drop.rest.fall ?? (death ? DropPhysics.DEATH_FALL_SECONDS : 0.7) };
  }
}
