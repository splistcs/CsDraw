import { DropTracker } from './DropTracker.js';
import { WeaponDrops } from './WeaponDrops.js';
import { GrenadeInventory } from './GrenadeInventory.js';
import { FlashBlinds } from './FlashBlinds.js';
import { GrenadeTracks } from './GrenadeTracks.js';
import { WeaponNames } from './WeaponNames.js';

const GRENADE_EVENTS = {
  smokegrenade_detonate: 'smoke',
  hegrenade_detonate: 'he',
  flashbang_detonate: 'flash',
  inferno_startburn: 'fire',
  decoy_started: 'decoy'
};
const MAX_BLIND_SECONDS = 10;
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const byTick = (a, b) => a.tick - b.tick;
const MAX_FREEZE_SECONDS = 60;
const POST_ROUND_SECONDS = 5;

export class RoundBuilder {
  static normalizeSide(value) {
    const text = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['2', 't', 'terrorist', 'terrorists'].includes(text)) return 'T';
    if (['3', 'ct', 'counterterrorist', 'counterterrorists'].includes(text)) return 'CT';
    return null;
  }

  static buildBoundaries(events, tickRate) {
    const ends = (events.round_end ?? []).filter((e) => Number.isFinite(e.tick)).sort(byTick);
    const freezes = (events.round_freeze_end ?? []).map((e) => e.tick).filter(Number.isFinite).sort((a, b) => a - b);
    const starts = (events.round_start ?? []).map((e) => e.tick).filter(Number.isFinite).sort((a, b) => a - b);
    const officials = (events.round_officially_ended ?? []).map((e) => e.tick).filter(Number.isFinite).sort((a, b) => a - b);
    const rounds = [];
    let previousEnd = 0;
    for (const [position, end] of ends.entries()) {
      const freezeEndTick = freezes.find((tick) => tick > previousEnd && tick < end.tick) ?? null;
      const candidates = starts.filter((tick) => tick >= previousEnd && tick <= (freezeEndTick ?? end.tick));
      let startTick = candidates.length ? candidates[candidates.length - 1] : (freezeEndTick ?? previousEnd);
      const liveStart = freezeEndTick ?? startTick;
      startTick = Math.max(startTick, liveStart - MAX_FREEZE_SECONDS * tickRate);
      const nextEndTick = ends[position + 1]?.tick ?? Infinity;
      const official = officials.find((tick) => tick > end.tick && tick < nextEndTick);
      const closeTick = official !== undefined ? official - 1 : end.tick + POST_ROUND_SECONDS * tickRate;
      const roundEnd = Math.min(closeTick, nextEndTick - 1);
      const lastStart = Math.max(...starts.filter((tick) => tick > end.tick && tick <= roundEnd), -Infinity);
      const endTick = Number.isFinite(lastStart) ? Math.max(end.tick, lastStart - 1) : roundEnd;
      previousEnd = end.tick;
      if (end.tick - liveStart < tickRate * 2) continue;
      rounds.push({ number: rounds.length + 1, startTick, freezeEndTick: liveStart, endTick, winnerTick: end.tick, winner: RoundBuilder.normalizeSide(end.winner), rawReason: end.reason });
    }
    return rounds;
  }

  static sampleTicks(rounds, tickRate, hz) {
    const step = Math.max(1, Math.round(tickRate / hz));
    const ticks = new Set();
    for (const round of rounds) {
      for (let tick = round.startTick; tick < round.endTick; tick += step) ticks.add(tick);
      ticks.add(round.endTick);
    }
    return [...ticks].sort((a, b) => a - b);
  }

  static assemble({ rounds, events, rows, tickRate, tracks = [], groundItems = null }) {
    const players = [];
    const indexById = new Map();
    const weapons = [];
    const weaponIndex = new Map();
    const rowsByTick = new Map();
    const timeline = new Map();
    const clanByPlayer = new Map();
    const flashSamples = new Map();
    let hasInventory = false;
    let hasEconomy = false;
    const weaponId = (name) => {
      if (!name) return -1;
      if (!weaponIndex.has(name)) { weaponIndex.set(name, weapons.length); weapons.push(name); }
      return weaponIndex.get(name);
    };
    for (const row of rows) {
      const side = Number(row.team_num);
      const x = Number(row.X);
      const y = Number(row.Y);
      if ((side !== 2 && side !== 3) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const id = String(row.steamid);
      if (!indexById.has(id)) {
        indexById.set(id, players.length);
        players.push({ id, name: String(row.name ?? id) });
      }
      const clan = RoundBuilder.#teamName(row.team_clan_name);
      if (clan && !clanByPlayer.has(indexById.get(id))) clanByPlayer.set(indexById.get(id), clan);
      const weapon = WeaponNames.canonical(row.active_weapon_name);
      const main = WeaponNames.main(row.inventory) || weapon;
      if (row.balance !== undefined) hasEconomy = true;
      const entry = [
        indexById.get(id), round1(x), round1(y), round1(Number(row.yaw) || 0),
        Math.max(0, Math.round(Number(row.health) || 0)), side, round1(Number(row.Z) || 0),
        Math.max(0, Math.round(Number(row.armor_value) || 0)), Math.max(0, Math.round(Number(row.balance) || 0)),
        weaponId(weapon),
        round1(Number(row.pitch) || 0), GrenadeInventory.pack(row.inventory, row.inventory_as_ids, row.has_defuser),
        weaponId(main),
        row.has_helmet ? 1 : 0,
        RoundBuilder.#ammo(row.active_weapon_ammo)
      ];
      if (GrenadeInventory.carriesGear(entry[11])) hasInventory = true;
      if (!rowsByTick.has(row.tick)) rowsByTick.set(row.tick, []);
      rowsByTick.get(row.tick).push(entry);
      if (!timeline.has(entry[0])) timeline.set(entry[0], []);
      timeline.get(entry[0]).push({ tick: Number(row.tick), entry });
      if (row.flash_duration !== undefined && row.flash_duration !== null) {
        if (!flashSamples.has(entry[0])) flashSamples.set(entry[0], []);
        flashSamples.get(entry[0]).push({ tick: Number(row.tick), flash: Number(row.flash_duration) || 0, alive: entry[4] > 0 });
      }
    }
    timeline.forEach((list) => list.sort((a, b) => a.tick - b.tick));

    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const output = [];
    let teamA = null;
    let scoreA = 0;
    let scoreB = 0;

    for (const round of rounds) {
      const frames = [];
      for (const tick of RoundBuilder.sampleTicks([round], tickRate, 4)) {
        const entries = rowsByTick.get(tick);
        if (!entries) continue;
        entries.forEach(([, x, y]) => {
          bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
          bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
        });
        frames.push({ t: round2((tick - round.startTick) / tickRate), p: entries });
      }
      if (!frames.length) continue;

      const sides = {};
      frames[0].p.forEach((entry) => { sides[entry[0]] = entry[5]; });
      if (!teamA) teamA = new Set(Object.entries(sides).filter(([, side]) => side === 3).map(([idx]) => Number(idx)));
      const aSides = [...teamA].map((idx) => sides[idx]).filter(Boolean);
      const sideA = aSides.filter((s) => s === 3).length >= aSides.length / 2 ? 'CT' : 'T';
      if (round.winner) { if (round.winner === sideA) scoreA += 1; else scoreB += 1; }

      const inRound = (event) => event.tick >= round.startTick && event.tick <= round.endTick;
      const secondsAt = (tick) => Math.max(0, round2((tick - round.startTick) / tickRate));
      const seconds = (event) => secondsAt(event.tick);
      const playerIndex = (id) => indexById.get(String(id)) ?? null;

      const kills = (events.player_death ?? []).filter(inRound).sort(byTick).map((e) => ({
        t: seconds(e),
        killer: playerIndex(e.attacker_steamid),
        victim: playerIndex(e.user_steamid),
        killerName: e.attacker_name ? String(e.attacker_name) : null,
        victimName: e.user_name ? String(e.user_name) : null,
        weapon: WeaponNames.kill(e.weapon),
        headshot: Boolean(e.headshot),
        ...RoundBuilder.#killDetails(e, playerIndex),
        ...RoundBuilder.#position(e.user_X, e.user_Y, e.user_Z)
      }));

      const grenades = [];
      for (const [eventName, type] of Object.entries(GRENADE_EVENTS)) {
        for (const e of (events[eventName] ?? []).filter(inRound)) {
          const x = Number(e.x);
          const y = Number(e.y);
          if (Number.isFinite(x) && Number.isFinite(y)) grenades.push({ tick: e.tick, entityId: e.entityid ?? null, steamId: e.user_steamid ?? null, grenade: { t: seconds(e), type, x: round1(x), y: round1(y), z: round1(Number(e.z) || 0), thrower: playerIndex(e.user_steamid) } });
        }
      }
      grenades.sort((a, b) => a.tick - b.tick);
      const thrown = grenades.map(({ tick, entityId, steamId, grenade }) => {
        const track = GrenadeTracks.match(tracks, { tick, type: grenade.type, x: grenade.x, y: grenade.y, thrower: steamId === null ? null : String(steamId), entityId: grenade.type === 'fire' ? null : entityId }, tickRate);
        if (!track) return { ...grenade, thrownT: grenade.t };
        const { points, bounces } = GrenadeTracks.path(track, tick, tickRate);
        const point = (p) => [secondsAt(p.tick), Math.round(p.x) || 0, Math.round(p.y) || 0, Math.round(p.z) || 0];
        const thrower = grenade.thrower ?? (track.thrower === null ? null : playerIndex(track.thrower));
        return { ...grenade, thrower, thrownT: secondsAt(track.startTick), path: points.map(point), bounces: bounces.map(point) };
      });

      const fires = (events.weapon_fire ?? []).filter(inRound)
        .map((e) => ({ player: playerIndex(e.user_steamid), type: GrenadeInventory.classify(e.weapon), t: seconds(e) }))
        .filter((fire) => fire.player !== null && fire.type && fire.type !== 'c4' && fire.type !== 'defuser');

      const hasBlindEvents = (events.player_blind?.length ?? 0) > 0;
      const blinds = hasBlindEvents
        ? (events.player_blind ?? []).filter(inRound).map((e) => ({
          t: seconds(e), victim: playerIndex(e.user_steamid), attacker: playerIndex(e.attacker_steamid), duration: round2(Math.min(MAX_BLIND_SECONDS, Number(e.blind_duration)))
        })).filter((blind) => blind.victim !== null && blind.duration > 0.1).sort((a, b) => a.t - b.t)
        : FlashBlinds.derive({ samples: flashSamples, detonations: (events.flashbang_detonate ?? []).filter(inRound), startTick: round.startTick, endTick: round.endTick, tickRate, secondsAt, playerIndex });

      const bomb = [];
      for (const [eventName, type] of [['bomb_planted', 'planted'], ['bomb_defused', 'defused'], ['bomb_exploded', 'exploded']]) {
        for (const e of (events[eventName] ?? []).filter(inRound)) {
          const x = Number(e.user_X ?? e.X);
          const y = Number(e.user_Y ?? e.Y);
          bomb.push({ t: seconds(e), type, x: Number.isFinite(x) ? round1(x) : null, y: Number.isFinite(y) ? round1(y) : null, z: round1(Number(e.user_Z ?? e.Z) || 0) });
        }
      }
      bomb.sort((a, b) => a.t - b.t);

      const deathEvents = (events.player_death ?? []).filter(inRound).sort(byTick).map((e) => ({ tick: e.tick, victim: playerIndex(e.user_steamid), x: e.user_X, y: e.user_Y, z: e.user_Z }));
      const guessed = DropTracker.build({
        startTick: round.startTick,
        tickRate,
        frames,
        timeline,
        deaths: deathEvents,
        removals: (events.item_remove ?? []).filter(inRound).sort(byTick),
        pickups: (events.item_pickup ?? []).filter(inRound).sort(byTick),
        bombPickups: (events.bomb_pickup ?? []).filter(inRound).sort(byTick),
        bombDrops: (events.bomb_dropped ?? []).filter(inRound).sort(byTick),
        fires,
        throws: thrown,
        bomb,
        sides,
        playerIndex,
        hasRemoveEvents: (events.item_remove?.length ?? 0) > 0,
        hasPickupEvents: (events.item_pickup?.length ?? 0) > 0,
        hasFireEvents: (events.weapon_fire?.length ?? 0) > 0
      });
      const covered = WeaponDrops.covered(groundItems);
      const drops = [
        ...(groundItems ? WeaponDrops.build({ index: groundItems, startTick: round.startTick, endTick: round.endTick, tickRate, at: secondsAt, deaths: deathEvents, fires, sides, playerIndex }) : []),
        ...guessed.filter((drop) => !covered.has(drop.type))
      ].sort((a, b) => a.t - b.t);

      output.push({
        number: output.length + 1,
        durationSeconds: round2(Math.min((round.endTick - round.startTick) / tickRate, frames[frames.length - 1].t)),
        freezeSeconds: round2((round.freezeEndTick - round.startTick) / tickRate),
        winner: round.winner,
        reason: RoundBuilder.#reason(round, bomb),
        sideOfTeamA: sideA,
        scoreA,
        scoreB,
        sides,
        frames,
        kills,
        grenades: thrown,
        blinds,
        drops,
        bomb
      });
    }

    const teams = RoundBuilder.#teamNames(clanByPlayer, teamA);
    const features = {
      inventory: hasInventory,
      economy: hasEconomy,
      trajectories: output.some((r) => r.grenades.some((g) => g.path)),
      blinds: output.some((r) => r.blinds.length > 0),
      blindEvents: (events.player_blind ?? []).length,
      blindSource: (events.player_blind?.length ?? 0) > 0 ? 'event' : (flashSamples.size > 0 ? 'ticks' : null),
      teamNames: Boolean(teams.a || teams.b)
    };
    return { players, weapons, teams, features, rounds: output, bounds: Number.isFinite(bounds.minX) ? bounds : null, tickRate };
  }

  static #ammo(value) {
    const ammo = Number(value);
    return value === undefined || value === null || !Number.isFinite(ammo) || ammo < 0 ? -1 : Math.round(ammo);
  }

  static #position(x, y, z) {
    const px = Number(x);
    const py = Number(y);
    return Number.isFinite(px) && Number.isFinite(py) ? { x: round1(px), y: round1(py), z: round1(Number(z) || 0) } : {};
  }

  static #killDetails(e, playerIndex) {
    const details = {};
    const assister = playerIndex(e.assister_steamid);
    if (assister !== null) details.assister = assister;
    if (e.assister_name && assister === null && String(e.assister_name).trim()) details.assisterName = String(e.assister_name).slice(0, 40);
    if (e.assistedflash) details.flashAssist = true;
    if (e.attackerblind) details.blind = true;
    if (e.noscope) details.noScope = true;
    if (e.thrusmoke) details.throughSmoke = true;
    if (Number(e.penetrated) > 0) details.wallbang = true;
    return details;
  }

  static #teamName(value) {
    const name = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
    return name || null;
  }

  static #teamNames(clanByPlayer, teamA) {
    const mostCommon = (names) => {
      const counts = new Map();
      names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const entries = [...clanByPlayer.entries()];
    const a = mostCommon(entries.filter(([idx]) => teamA?.has(idx)).map(([, name]) => name));
    const b = mostCommon(entries.filter(([idx]) => !teamA?.has(idx)).map(([, name]) => name));
    return { a, b: b === a ? null : b };
  }

  static #reason(round, bomb) {
    if (bomb.some((b) => b.type === 'exploded')) return 'bomb_exploded';
    if (bomb.some((b) => b.type === 'defused')) return 'bomb_defused';
    const raw = String(round.rawReason ?? '').toLowerCase();
    if (round.winner === 'CT' && (raw.includes('saved') || raw === '12')) return 'time';
    return 'elimination';
  }

  static slugFromMapName(mapName) {
    return String(mapName ?? '').toLowerCase().replace(/^(de|cs|ar|gd)_/, '').replace(/_/g, '-').replace(/[^a-z0-9-]/g, '') || 'unknown';
  }
}
