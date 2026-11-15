export class BombFuse {
  static FUSE_SECONDS = 40;
  static NO_KIT_SECONDS = 10;
  static KIT_SECONDS = 5;

  static at(events, time) {
    const list = events ?? [];
    const planted = list.find((e) => e.type === 'planted' && e.t <= time && e.x !== null);
    if (!planted) return null;
    const defused = list.find((e) => e.type === 'defused' && e.t >= planted.t && e.t <= time) ?? null;
    const exploded = list.find((e) => e.type === 'exploded' && e.t >= planted.t && e.t <= time) ?? null;
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
