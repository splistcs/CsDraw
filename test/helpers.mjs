export const TICK_RATE = 64;

export function createFakeEngine({ perSide = 2, movement = false, rounds = DEFAULT_ROUNDS, failExtendedProps = false, failInventory = false, failInventoryIds = false, failGrenades = false, clanNames = null, mapName = 'de_mirage', groundItems = null, failGroundItems = false } = {}) {
  const ids = Array.from({ length: perSide * 2 }, (_, i) => String(i + 1));
  const isTeamA = (id) => Number(id) <= perSide;
  const events = [];
  rounds.forEach((r) => {
    events.push({ event_name: 'round_start', tick: r.freeze - 640 }, { event_name: 'round_freeze_end', tick: r.freeze }, { event_name: 'round_end', tick: r.end, winner: r.winner, reason: 8 });
  });
  const victim = String(perSide + 1);
  events.push({ event_name: 'player_death', tick: 1000, attacker_name: 'P1', attacker_steamid: '1', user_name: `P${victim}`, user_steamid: victim, user_X: -1200, user_Y: -1000, user_Z: 120, weapon: 'weapon_ak47', headshot: true });
  events.push({ event_name: 'smokegrenade_detonate', tick: 900, x: -900, y: -1500, z: 100, user_steamid: '1', entityid: 77 });
  events.push({ event_name: 'inferno_startburn', tick: 1100, x: -400, y: -1100, z: 100, entityid: 500 });
  events.push({ event_name: 'flashbang_detonate', tick: 1200, x: -1100, y: -900, z: 100, user_steamid: '2', entityid: 91 });
  events.push({ event_name: 'player_blind', tick: 1210, user_steamid: victim, attacker_steamid: '2', blind_duration: 2.5 });
  events.push({ event_name: 'item_pickup', tick: 300, user_steamid: '2', item: 'flashbang', user_X: 0, user_Y: 0 });
  events.push({ event_name: 'item_pickup', tick: 1300, user_steamid: '1', item: 'smokegrenade', user_X: -1180, user_Y: -1010 });
  events.push({ event_name: 'bomb_planted', tick: 3000, user_X: -700, user_Y: -1000 }, { event_name: 'bomb_exploded', tick: 3800 });
  const kills = movement ? [[2200, '2', String(perSide + 2)], [2400, String(perSide + 1), '1'], [3300, '3', String(perSide + 1)]] : [];
  kills.forEach(([tick, a, v]) => events.push({ event_name: 'player_death', tick, attacker_name: `P${a}`, attacker_steamid: a, user_name: `P${v}`, user_steamid: v, weapon: 'weapon_m4a1', headshot: false }));

  const weaponsApi = groundItems ? {
    parseWeapons: (_path, _extra, ticks) => {
      if (failGroundItems) throw new Error('parseWeapons indisponivel');
      const wanted = ticks ? new Set(ticks) : null;
      return groundItems.filter((row) => !wanted || wanted.has(row.tick));
    }
  } : {};

  return {
    ...weaponsApi,
    parseHeader: () => ({ map_name: mapName, playback_ticks: 640000, playback_time: 10000 }),
    parseEvents: (_path, names) => events.filter((event) => names.includes(event.event_name)),
    parseGrenades: () => {
      if (failGrenades) throw new Error('parseGrenades indisponivel');
      return grenadeRows();
    },
    parseTicks: (_path, props, ticks) => {
      if (failExtendedProps && props.includes('balance')) throw new Error('prop desconhecida');
      if (failInventory && props.includes('inventory')) throw new Error('prop desconhecida');
      if (failInventoryIds && props.includes('inventory_as_ids')) throw new Error('prop desconhecida');
      const rows = [];
      const wantsExtras = props.includes('balance');
      const wantsPitch = props.includes('pitch');
      const wantsInventory = props.includes('inventory');
      const wantsIds = props.includes('inventory_as_ids');
      const wantsClan = props.includes('team_clan_name');
      for (const tick of ticks) {
        const swapped = tick > 4000;
        const round = rounds.find((r) => tick >= r.freeze && tick <= r.end) ?? rounds[0];
        const progress = Math.min(1, Math.max(0, (tick - round.freeze) / (round.end - round.freeze)));
        ids.forEach((id) => {
          const ct = isTeamA(id) ? !swapped : swapped;
          const dead = kills.some(([killTick, , victim]) => victim === id && tick >= killTick);
          const k = Number(id);
          const x = movement ? -1700 + k * 90 + progress * (500 - k * 40) * (ct ? 1 : -0.4) : tick / 10;
          const y = movement ? (ct ? -2800 : -300) + progress * (ct ? 1300 : -1500 + k * 60) : k * 10;
          rows.push({ tick, steamid: id, name: `P${id}`, X: x, Y: y, Z: movement && k % 2 ? -800 : 100, ...(wantsExtras ? { armor_value: 100, balance: 800 + k * 100, active_weapon_name: ct ? 'weapon_m4a1' : 'weapon_ak47' } : {}), ...(wantsPitch ? { pitch: 5.55 } : {}), ...(wantsInventory ? { inventory: ['Knife', 'Glock-18', 'Smoke Grenade', 'Flashbang', 'Flashbang', 'High Explosive Grenade'] } : {}), ...(wantsIds ? { inventory_as_ids: [42, 4, 45, 43, 43, 44] } : {}), ...(wantsClan ? { team_clan_name: clanNames ? clanNames[isTeamA(id) ? 0 : 1] : '' } : {}), yaw: movement ? (ct ? 80 : 260) + progress * 40 : 90, health: dead ? 0 : 100, team_num: ct ? 3 : 2 });
        });
      }
      return rows;
    }
  };
}

export const DEFAULT_ROUNDS = [
  { freeze: 640, end: 1920, winner: 'CT' },
  { freeze: 2560, end: 3840, winner: 'T' },
  { freeze: 5120, end: 6400, winner: 'CT' }
];

function grenadeRows() {
  const row = (entity, type, thrower, tick, x, y) => ({ grenade_entity_id: entity, grenade_type: type, steamid: thrower, name: `P${thrower}`, tick, x, y, z: 100 });
  const rows = [];
  for (let tick = 1; tick <= 64; tick += 1) rows.push(row(5, 'CSmokeGrenadeProjectile', '1', tick, 10, 10));
  for (let tick = 800; tick <= 960; tick += 1) {
    const x = tick <= 860 ? -10 * (tick - 800) : tick <= 900 ? -600 - 7.5 * (tick - 860) : -900;
    rows.push(row(77, 'CSmokeGrenadeProjectile', '1', tick, x, -1500));
  }
  for (let tick = 1030; tick <= 1100; tick += 1) rows.push(row(90, 'CMolotovProjectile', '2', tick, (-400 * (tick - 1030)) / 70, -1100));
  for (let tick = 1150; tick <= 1200; tick += 1) rows.push(row(91, 'CFlashbangProjectile', '2', tick, (-1100 * (tick - 1150)) / 50, -900));
  rows.push({ grenade_entity_id: 300, grenade_type: 'CSmokeGrenade', steamid: '1', name: 'P1', tick: 800, x: 0, y: 0, z: 0 });
  return rows;
}

const ITEM_IDS = { Knife: 42, 'Glock-18': 4, 'AK-47': 7, 'Smoke Grenade': 45, Flashbang: 43, 'High Explosive Grenade': 44, Molotov: 46, 'Incendiary Grenade': 48, 'Decoy Grenade': 47, 'C4 Explosive': 49 };

export function withInventory(engine, id, inventory, { from = 0, to = Infinity, ...extra } = {}) {
  const parseTicks = engine.parseTicks;
  engine.parseTicks = (path, props, ticks) => parseTicks(path, props, ticks).map((row) => (row.steamid === id && row.inventory && row.tick >= from && row.tick <= to
    ? { ...row, inventory, inventory_as_ids: inventory.map((name) => ITEM_IDS[name]), ...extra }
    : row));
  return engine;
}

export function groundRows({ entity, weapon = 'Flashbang', owner = null, from, to, place = () => [0, 0, 0], skip = [] }) {
  const rows = [];
  for (let tick = from; tick <= to; tick += 1) {
    if (skip.includes(tick)) continue;
    const [x, y, z] = place(tick);
    rows.push({ tick, entity_id: entity, weapon, x, y, z, steamid: owner, name: owner === null ? null : `P${owner}` });
  }
  return rows;
}
