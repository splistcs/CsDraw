/**
 * Cegueira deduzida da propriedade `flash_duration` do jogador (lida junto das posicoes), para demos em que o servidor
 * nao grava o evento `player_blind` (comum em demos de servidor de campeonato). A propriedade vale o tempo da flash a
 * partir do tick da detonacao e volta a 0 quando a cegueira acaba; o tempo total em que ela fica ligada passa um pouco
 * do valor (medido em demo real: ~1,35x), entao o fim e estimado e limitado pelo ultimo tick ligado e o primeiro zerado.
 */
export class FlashBlinds {
  static TOTAL_FACTOR = 1.35;
  static MAX_SECONDS = 10;
  static MIN_FLASH = 0.05;

  /**
   * `samples`: Map<jogador, [{ tick, flash, alive }]>; `detonations`: eventos flashbang_detonate do round.
   * Devolve [{ t, victim, attacker, duration }] no formato de `blinds` do round, ordenado por tempo.
   */
  static derive({ samples, detonations = [], startTick, endTick, tickRate, secondsAt, playerIndex }) {
    const round2 = (value) => Math.round(value * 100) / 100;
    const blasts = detonations.filter((e) => Number.isFinite(e.tick)).sort((a, b) => a.tick - b.tick);
    const blinds = [];

    for (const [victim, all] of samples) {
      const list = all.filter((s) => s.tick >= startTick && s.tick <= endTick).sort((a, b) => a.tick - b.tick);
      let previous = null;
      let open = null;

      const close = (limitTick, replaced) => {
        const model = open.onset + open.flash * FlashBlinds.TOTAL_FACTOR * tickRate;
        const end = replaced ? Math.min(model, limitTick) : Math.min(Math.max(model, open.lastOn), limitTick);
        const duration = Math.min(FlashBlinds.MAX_SECONDS, (end - open.onset) / tickRate);
        if (duration > 0.1) blinds.push({ t: secondsAt(open.onset), victim, attacker: open.attacker, duration: round2(duration) });
        open = null;
      };

      for (const sample of list) {
        const active = sample.alive && sample.flash > FlashBlinds.MIN_FLASH;
        if (open && active && Math.abs(sample.flash - open.flash) <= 0.01) { open.lastOn = sample.tick; previous = sample; continue; }
        const from = previous ? previous.tick : sample.tick - 1;
        const blast = active ? [...blasts].reverse().find((e) => e.tick > from && e.tick <= sample.tick) : null;
        const onset = blast ? blast.tick : previous ? Math.round((previous.tick + sample.tick) / 2) : sample.tick;
        if (open) close(active ? onset : sample.tick, active); // zerou/morreu, ou veio outra flash por cima (nasce onde ela detonou)
        if (active) open = { onset, flash: sample.flash, lastOn: sample.tick, attacker: blast ? playerIndex(blast.user_steamid) : null };
        previous = sample;
      }
      if (open) close(endTick, false);
    }
    return blinds.sort((a, b) => a.t - b.t);
  }
}
