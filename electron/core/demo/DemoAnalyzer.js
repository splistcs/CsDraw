import { DropTracker } from './DropTracker.js';
import { EventNormalizer } from './EventNormalizer.js';
import { GrenadeInventory } from './GrenadeInventory.js';
import { GrenadeTracks } from './GrenadeTracks.js';
import { WeaponDrops } from './WeaponDrops.js';
import { RoundBuilder } from './RoundBuilder.js';

/** Orquestra o parser (injetado) para produzir os dados do demo viewer. Sincrono: rode em worker. */
export class DemoAnalyzer {
  static EVENTS = [
    'round_start', 'round_freeze_end', 'round_end', 'player_death',
    'round_officially_ended', 'bomb_planted', 'bomb_defused', 'bomb_exploded',
    'smokegrenade_detonate', 'hegrenade_detonate', 'flashbang_detonate', 'inferno_startburn', 'decoy_started'
  ];
  // Opcionais, lidos um a um: cegueira (player_blind), pegar (item_pickup) e largar (item_remove, com o instante, a posicao e o olhar exatos) itens e a C4 (bomb_pickup, bomb_dropped).
  static OPTIONAL_EVENTS = ['player_blind', 'item_pickup', 'item_remove', 'bomb_pickup', 'bomb_dropped', 'weapon_fire'];
  static EVENT_PLAYER_PROPS = ['X', 'Y', 'Z'];
  // item_remove (largar item) tambem traz para onde o jogador olhava: e dai que sai a direcao do arremesso. Cada grupo e tentado em ordem.
  static REMOVE_PLAYER_PROPS = [['X', 'Y', 'Z', 'yaw', 'pitch'], ['X', 'Y', 'Z', 'yaw'], ['X', 'Y', 'Z'], []];
  static TICK_PROPS = ['X', 'Y', 'Z', 'yaw', 'health', 'team_num', 'name'];
  // Grupos opcionais de propriedades: se o parser nao aceitar um grupo, a analise segue sem ele.
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
  static MAX_TICK_FAILURES = 60; // limite de falhas ao ler ticks em partes antes de desistir
  /** Sobe quando o formato salvo muda; demos analisadas com versao menor sao reanalisadas ao reenviar. */
  static VERSION = 14;

  #engine;
  #progress;
  #parserVersion;

  /** `parserVersion`: versao do leitor de demos (so para as mensagens de erro e para gravar na analise). */
  constructor(engine, progress = () => {}, parserVersion = null) {
    this.#engine = engine;
    this.#progress = progress;
    this.#parserVersion = parserVersion;
  }

  /**
   * Erros nossos ja sao mensagens para o usuario; um erro cru do leitor de demos (formato novo que ele nao entende,
   * entidade inesperada...) vira uma orientacao: o leitor embutido pode estar velho demais para essa demo.
   */
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
    return DemoAnalyzer.#friendly(`Não foi possível ler esta demo com o leitor embutido (${reader}). Se ela for recente, o CSDraw pode estar desatualizado: instale a versão mais nova. Detalhe: ${error?.message ?? error}`);
  }

  #run(filePath) {
    this.#progress('Lendo cabeçalho…', 5);
    const header = this.#engine.parseHeader(filePath) ?? {};
    const tickRate = DemoAnalyzer.#tickRate(header);

    this.#progress('Lendo eventos (rounds, kills, granadas)…', 15);
    const events = this.#readEvents(filePath);
    for (const name of DemoAnalyzer.OPTIONAL_EVENTS) Object.assign(events, this.#readOptionalEvent(filePath, name));
    const boundaries = RoundBuilder.buildBoundaries(events, tickRate);
    if (!boundaries.length) throw DemoAnalyzer.#friendly(`Nenhum round encontrado. O arquivo é uma demo de partida válida do CS2? Se ela for recente, o CSDraw pode estar desatualizado (leitor demoparser2${this.#parserVersion ? ` ${this.#parserVersion}` : ''}).`);

    this.#progress('Lendo trajetórias das granadas…', 30);
    const tracks = this.#readTracks(filePath);

    this.#progress('Lendo itens largados no chão…', 38);
    const groundItems = this.#readGroundItems(filePath, boundaries);

    this.#progress('Lendo posições dos jogadores…', 55);
    const wantedTicks = RoundBuilder.sampleTicks(boundaries, tickRate, DemoAnalyzer.SAMPLE_HZ);
    // Alem dos quadros de 4 Hz, le uns poucos ticks logo antes de cada morte e de cada item largado: o que o jogador
    // tinha na mao e a velocidade dele naquele instante (so quadros de 0,25 s deixariam a morte imprecisa).
    const probes = DropTracker.probeTicks(events, boundaries);
    const rows = this.#readTicks(filePath, [...new Set([...wantedTicks, ...probes])].sort((a, b) => a - b));

    this.#progress('Montando rounds…', 85);
    const assembled = RoundBuilder.assemble({ rounds: boundaries, events, rows, tickRate, tracks, groundItems });
    if (!assembled.rounds.length) throw DemoAnalyzer.#friendly('Não foi possível ler as posições dos jogadores desta demo.');

    const mapName = String(header.map_name ?? '');
    return { version: DemoAnalyzer.VERSION, parserVersion: this.#parserVersion, map: { name: mapName, slug: RoundBuilder.slugFromMapName(mapName) }, ...assembled };
  }

  /**
   * Eventos obrigatorios. Demos novas podem fazer o parser lancar `EntityNotFound` (uma entidade citada pelo evento ja nao
   * existe): se a leitura em bloco falhar, le evento por evento e, se preciso, sem as propriedades do jogador.
   */
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

  /**
   * Eventos opcionais. Com as propriedades do jogador o parser pode lancar `EntityNotFound` (o jogador citado ja nao existe):
   * nesse caso tenta de novo com menos propriedades (ate nenhuma) em vez de perder o evento. Cegueira, por exemplo, nao
   * precisa de posicao; quem precisa dela (pegar/largar item) recebe a posicao pelo quadro mais proximo do jogador.
   */
  #readOptionalEvent(filePath, name) {
    const attempts = name === 'item_remove' ? DemoAnalyzer.REMOVE_PLAYER_PROPS : [DemoAnalyzer.EVENT_PLAYER_PROPS, []];
    for (const props of attempts) {
      try {
        const events = EventNormalizer.group(this.#engine.parseEvents(filePath, [name], props, []));
        // weapon_fire traz todos os tiros da partida: so os arremessos de granada interessam (mostram quando cada granada saiu da mao).
        if (events.weapon_fire) events.weapon_fire = events.weapon_fire.filter((e) => GrenadeInventory.isThrowable(e.weapon));
        // item_remove e item_pickup tambem trazem armas comuns: so o que pode ser largado (granadas, C4, kit) interessa.
        for (const key of ['item_remove', 'item_pickup']) {
          if (events[key]) events[key] = events[key].filter((e) => GrenadeInventory.classify(e.item ?? e.weapon) !== null);
        }
        return events;
      } catch {
        // tenta com menos propriedades
      }
    }
    return {};
  }

  /** Percursos dos projeteis (so os projeteis: as armas seguradas nao trazem posicao e pesam muito). */
  #readTracks(filePath) {
    try {
      return GrenadeTracks.fromRows(this.#engine.parseGrenades?.(filePath, [], false) ?? []);
    } catch {
      return [];
    }
  }

  /**
   * Armas sem dono no chao (granadas, C4, kit) a CADA tick dos rounds: elas caem, rolam e tombam, entao a posicao so e
   * confiavel tick a tick. Exige um demoparser2 com `parseWeapons`; sem ele (ou se falhar) devolve null e os drops
   * voltam a ser deduzidos dos eventos e do inventario (DropTracker).
   */
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
        // tenta sem a lista de propriedades extras
      }
    }
    return null;
  }

  /** Tenta o conjunto completo de propriedades; se o parser recusar, descobre quais grupos ele aceita. */
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
          // segue: tenta ticks em partes (um tick com entidade ausente nao derruba a demo inteira)
        }
        const rows = this.#readTicksInParts(filePath, props, wantedTicks);
        if (rows) return rows;
      }
      throw fullError;
    }
  }

  /** Divide os ticks ao meio quando o parser falha (EntityNotFound em ticks soltos) e descarta so os ticks ruins. */
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

  /** Grupo aceito = funciona em todos os ticks da amostra (varios pontos da partida, nao so o primeiro). */
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
