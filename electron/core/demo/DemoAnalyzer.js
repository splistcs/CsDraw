import { DropTracker } from './DropTracker.js';
import { EventNormalizer } from './EventNormalizer.js';
import { GrenadeInventory } from './GrenadeInventory.js';
import { GrenadeTracks } from './GrenadeTracks.js';
import { WeaponDrops } from './WeaponDrops.js';
import { RoundBuilder } from './RoundBuilder.js';

export class DemoAnalyzer {
  static EVENTS = [
    'round_start', 'round_freeze_end', 'round_end', 'player_death',
    'round_officially_ended', 'bomb_planted', 'bomb_defused', 'bomb_exploded',
    'smokegrenade_detonate', 'hegrenade_detonate', 'flashbang_detonate', 'inferno_startburn', 'decoy_started'
  ];
  static OPTIONAL_EVENTS = ['player_blind', 'item_pickup', 'item_remove', 'bomb_pickup', 'bomb_dropped', 'weapon_fire'];
  static EVENT_PLAYER_PROPS = ['X', 'Y', 'Z'];
  static REMOVE_PLAYER_PROPS = [['X', 'Y', 'Z', 'yaw', 'pitch'], ['X', 'Y', 'Z', 'yaw'], ['X', 'Y', 'Z'], []];
  static TICK_PROPS = ['X', 'Y', 'Z', 'yaw', 'health', 'team_num', 'name'];
  static OPTIONAL_TICK_GROUPS = [
    ['armor_value', 'balance', 'active_weapon_name'],
    ['pitch'],
    ['inventory'],
    ['inventory_as_ids'],
    ['has_defuser'],
    ['team_clan_name'],
    ['flash_duration'],
    ['has_helmet'],
    ['active_weapon_ammo']
  ];
  static SAMPLE_HZ = 4;
  static MAX_TICK_FAILURES = 60;
  static VERSION = 14;

  #engine;
  #progress;
  #parserVersion;

  constructor(engine, progress = () => {}, parserVersion = null) {
    this.#engine = engine;
    this.#progress = progress;
    this.#parserVersion = parserVersion;
  }

  analyze(filePath) {
    try {
      return this.#run(filePath);
    } catch (error) {
      throw error?.friendly ? error : DemoAnalyzer.#unreadable(error, this.#parserVersion);
    }
  }

  static #friendly(message) {
    return Object.assign(new Error(message), { friendly: true });
  }

  static #unreadable(error, version) {
    const reader = version ? `demoparser2 ${version}` : 'demoparser2';
    return DemoAnalyzer.#friendly(`Could not read this demo with the built-in reader (${reader}). If it is recent, CsDraw may be outdated: install the latest version. Detail: ${error?.message ?? error}`);
  }

  #run(filePath) {
    this.#progress('Reading header…', 5);
    const header = this.#engine.parseHeader(filePath) ?? {};
    const tickRate = DemoAnalyzer.#tickRate(header);

    this.#progress('Reading events (rounds, kills, grenades)…', 15);
    const events = this.#readEvents(filePath);
    for (const name of DemoAnalyzer.OPTIONAL_EVENTS) Object.assign(events, this.#readOptionalEvent(filePath, name));
    const boundaries = RoundBuilder.buildBoundaries(events, tickRate);
    if (!boundaries.length) throw DemoAnalyzer.#friendly(`No rounds found. Is the file a valid CS2 match demo? If it is recent, CsDraw may be outdated (reader demoparser2${this.#parserVersion ? ` ${this.#parserVersion}` : ''}).`);

    this.#progress('Reading grenade trajectories…', 30);
    const tracks = this.#readTracks(filePath);

    this.#progress('Reading items dropped on the ground…', 38);
    const groundItems = this.#readGroundItems(filePath, boundaries);

    this.#progress('Reading player positions…', 55);
    const wantedTicks = RoundBuilder.sampleTicks(boundaries, tickRate, DemoAnalyzer.SAMPLE_HZ);
    const probes = DropTracker.probeTicks(events, boundaries);
    const rows = this.#readTicks(filePath, [...new Set([...wantedTicks, ...probes])].sort((a, b) => a - b));

    this.#progress('Building rounds…', 85);
    const assembled = RoundBuilder.assemble({ rounds: boundaries, events, rows, tickRate, tracks, groundItems });
    if (!assembled.rounds.length) throw DemoAnalyzer.#friendly('Could not read the player positions in this demo.');

    const mapName = String(header.map_name ?? '');
    return { version: DemoAnalyzer.VERSION, parserVersion: this.#parserVersion, map: { name: mapName, slug: RoundBuilder.slugFromMapName(mapName) }, ...assembled };
  }

  #readEvents(filePath) {
    try {
      return EventNormalizer.group(this.#engine.parseEvents(filePath, DemoAnalyzer.EVENTS, DemoAnalyzer.EVENT_PLAYER_PROPS, []));
    } catch (blockError) {
      const events = {};
      let failure = blockError;
      for (const name of DemoAnalyzer.EVENTS) {
        for (const playerProps of [DemoAnalyzer.EVENT_PLAYER_PROPS, []]) {
          try {
            Object.assign(events, EventNormalizer.group(this.#engine.parseEvents(filePath, [name], playerProps, [])));
            break;
          } catch (error) {
            failure = error;
          }
        }
      }
      if (!events.round_end && !events.round_start) throw failure;
      return events;
    }
  }

  #readOptionalEvent(filePath, name) {
    const attempts = name === 'item_remove' ? DemoAnalyzer.REMOVE_PLAYER_PROPS : [DemoAnalyzer.EVENT_PLAYER_PROPS, []];
    for (const props of attempts) {
      try {
        const events = EventNormalizer.group(this.#engine.parseEvents(filePath, [name], props, []));
        if (events.weapon_fire) events.weapon_fire = events.weapon_fire.filter((e) => GrenadeInventory.isThrowable(e.weapon));
        for (const key of ['item_remove', 'item_pickup']) {
          if (events[key]) events[key] = events[key].filter((e) => GrenadeInventory.classify(e.item ?? e.weapon) !== null);
        }
        return events;
      } catch {
      }
    }
    return {};
  }

  #readTracks(filePath) {
    try {
      return GrenadeTracks.fromRows(this.#engine.parseGrenades?.(filePath, [], false) ?? []);
    } catch {
      return [];
    }
  }

  #readGroundItems(filePath, boundaries) {
    if (typeof this.#engine.parseWeapons !== 'function') return null;
    const ticks = new Set();
    for (const round of boundaries) for (let tick = round.startTick; tick <= round.endTick; tick += 1) ticks.add(tick);
    const wanted = [...ticks].sort((a, b) => a - b);
    for (const extra of [[], undefined]) {
      try {
        const index = WeaponDrops.index(this.#engine.parseWeapons(filePath, extra, wanted));
        return index.any ? index : null;
      } catch {
      }
    }
    return null;
  }

  #readTicks(filePath, wantedTicks) {
    const all = DemoAnalyzer.OPTIONAL_TICK_GROUPS.flat();
    try {
      return this.#engine.parseTicks(filePath, [...DemoAnalyzer.TICK_PROPS, ...all], wantedTicks) ?? [];
    } catch (fullError) {
      const probe = DemoAnalyzer.#spread(wantedTicks, 6);
      const supported = DemoAnalyzer.OPTIONAL_TICK_GROUPS.filter((group) => this.#accepts(filePath, group, probe));
      for (const props of [[...DemoAnalyzer.TICK_PROPS, ...supported.flat()], DemoAnalyzer.TICK_PROPS]) {
        try {
          return this.#engine.parseTicks(filePath, props, wantedTicks) ?? [];
        } catch {
        }
        const rows = this.#readTicksInParts(filePath, props, wantedTicks);
        if (rows) return rows;
      }
      throw fullError;
    }
  }

  #readTicksInParts(filePath, props, ticks) {
    let failures = 0;
    const read = (part) => {
      try {
        return this.#engine.parseTicks(filePath, props, part) ?? [];
      } catch {
        failures += 1;
        if (part.length <= 1 || failures > DemoAnalyzer.MAX_TICK_FAILURES) return [];
        const mid = Math.ceil(part.length / 2);
        return [...read(part.slice(0, mid)), ...read(part.slice(mid))];
      }
    };
    const rows = read(ticks);
    return failures > DemoAnalyzer.MAX_TICK_FAILURES || !rows.length ? null : rows;
  }

  #accepts(filePath, group, ticks) {
    try {
      this.#engine.parseTicks(filePath, [...DemoAnalyzer.TICK_PROPS, ...group], ticks);
      return true;
    } catch {
      return false;
    }
  }

  static #spread(list, count) {
    if (list.length <= count) return list;
    return Array.from({ length: count }, (_, i) => list[Math.floor((i * (list.length - 1)) / (count - 1))]);
  }

  static #tickRate(header) {
    const rate = Number(header.playback_ticks) / Number(header.playback_time);
    return Number.isFinite(rate) && rate >= 16 && rate <= 130 ? Math.round(rate) : 64;
  }
}
