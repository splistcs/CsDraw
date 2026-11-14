// Uso: npm run inspect-demo -- caminho/para/partida.dem [--raw]
// Imprime um resumo da analise (ou o formato bruto dos eventos) para depurar o parser.
// Com --probe mostra como o parser entrega inventario, pitch, nome dos times, trajetorias das granadas, cegueira e pickups (usados no viewer).
import demoparser from '@laihoe/demoparser2';
import { DemoAnalyzer } from '../electron/core/demo/DemoAnalyzer.js';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('Informe o caminho de um arquivo .dem');
  process.exit(1);
}
if (flag === '--probe') {
  const header = demoparser.parseHeader(file);
  const tick = Math.round(Number(header.playback_ticks) / 2) || Math.round((Number(header.playback_time) * 64) / 2) || 20000;
  const tryProps = (label, fn) => {
    try { console.log(`${label} ->`); console.dir(fn(), { depth: 3 }); } catch (error) { console.error(`${label} FALHOU:`, error.message); }
  };
  for (const props of [['inventory'], ['inventory_as_ids'], ['pitch', 'yaw'], ['team_clan_name']]) {
    tryProps(`parseTicks ${props.join('+')} (tick ${tick})`, () => demoparser.parseTicks(file, ['name', ...props], [tick]).slice(0, 3));
  }
  tryProps('parseGrenades (projeteis)', () => {
    const rows = demoparser.parseGrenades(file, [], false);
    return { linhas: rows.length, exemplo: rows.slice(0, 2) };
  });
  tryProps('parseWeapons (armas sem dono no chao; exige demoparser2 recente)', () => {
    if (typeof demoparser.parseWeapons !== 'function') return 'AUSENTE: atualize com `npm install @laihoe/demoparser2@latest`';
    const ticks = Array.from({ length: 640 }, (_, i) => tick + i); // 10 s seguidos
    const rows = demoparser.parseWeapons(file, [], ticks);
    const names = {};
    rows.forEach((row) => { names[row.weapon] = (names[row.weapon] ?? 0) + 1; });
    return { linhas: rows.length, porArma: names, exemplo: rows.slice(0, 2) };
  });
  for (const name of ['player_blind', 'item_pickup', 'item_remove']) {
    tryProps(`evento ${name}`, () => {
      const events = demoparser.parseEvents(file, [name], ['X', 'Y', 'Z'], []);
      return { quantidade: events.length, exemplo: events.slice(0, 1) };
    });
  }
} else if (flag === '--raw') {
  console.log('header:', demoparser.parseHeader(file));
  const raw = demoparser.parseEvents(file, ['round_end', 'round_freeze_end', 'player_death'], ['X', 'Y'], []);
  console.log('parseEvents ->', Array.isArray(raw) ? `array(${raw.length})` : typeof raw);
  console.dir(raw?.slice?.(0, 3), { depth: 4 });
} else {
  const result = new DemoAnalyzer(demoparser, (stage, percent) => console.log(`[${percent}%] ${stage}`)).analyze(file);
  console.log(`Mapa: ${result.map.name} (${result.map.slug}) | tickrate ${result.tickRate} | jogadores ${result.players.length}`);
  for (const round of result.rounds) {
    console.log(`R${round.number}: vencedor ${round.winner} (${round.reason}) ${round.scoreA}-${round.scoreB} | ${round.durationSeconds}s | frames ${round.frames.length} | kills ${round.kills.length} | granadas ${round.grenades.length} | cegueiras ${round.blinds.length} | itens no chao ${round.drops.length} (${round.drops.filter((d) => d.path).length} com percurso)`);
  }
}
