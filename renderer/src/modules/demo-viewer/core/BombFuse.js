/**
 * Estado da C4 plantada num instante: quanto do pavio ja queimou e onde ficam as marcas dos defuses.
 * O pavio dura 40 s (mp_c4timer); sem kit o defuse leva 10 s e com kit 5 s, entao as marcas ficam a 10 s e a 5 s do fim.
 */
export class BombFuse {
  static FUSE_SECONDS = 40;
  static NO_KIT_SECONDS = 10; // marca amarela: ultimo instante para comecar um defuse sem kit
  static KIT_SECONDS = 5; // marca vermelha: ultimo instante para comecar um defuse com kit

  /** `null` antes do plantio; senao `{ x, y, z, progress, remaining, fuse, defused, exploded, explodedAt, marks }`. */
  static at(events, time) {
    const list = events ?? [];
    const planted = list.find((e) => e.type === 'planted' && e.t <= time && e.x !== null);
    if (!planted) return null;
    const defused = list.find((e) => e.type === 'defused' && e.t >= planted.t && e.t <= time) ?? null;
    const exploded = list.find((e) => e.type === 'exploded' && e.t >= planted.t && e.t <= time) ?? null;
    // Se a demo registrou a explosao, o pavio real vale o que ela mediu (pausas e ajustes de servidor).
    const blast = list.find((e) => e.type === 'exploded' && e.t >= planted.t);
    const fuse = blast ? Math.max(1, blast.t - planted.t) : BombFuse.FUSE_SECONDS;
    const stop = defused ? defused.t : exploded ? exploded.t : time;
    const elapsed = Math.min(fuse, Math.max(0, stop - planted.t));
    return {
      x: planted.x, y: planted.y, z: planted.z,
      fuse,
      elapsed,
      remaining: fuse - elapsed,
      progress: elapsed / fuse,
      defused: Boolean(defused),
      exploded: Boolean(exploded),
      explodedAt: exploded ? exploded.t : null,
      marks: {
        noKit: Math.max(0, 1 - BombFuse.NO_KIT_SECONDS / fuse),
        kit: Math.max(0, 1 - BombFuse.KIT_SECONDS / fuse)
      }
    };
  }
}
