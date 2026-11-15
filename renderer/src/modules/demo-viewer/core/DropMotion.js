const LIFT_HEIGHT = 40;

export class DropMotion {
  static at(drop, time) {
    if (Array.isArray(drop.path) && drop.path.length >= 2) return DropMotion.#along(drop, time);
    if (!Number.isFinite(drop.toX) || !Number.isFinite(drop.toY) || !(drop.fall > 0)) return { x: drop.x, y: drop.y, lift: 0 };
    const progress = Math.min(1, Math.max(0, (time - drop.t) / drop.fall));
    const ease = 1 - (1 - progress) ** 2;
    return { x: drop.x + (drop.toX - drop.x) * ease, y: drop.y + (drop.toY - drop.y) * ease, lift: progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) : 0 };
  }

  static #along(drop, time) {
    const path = drop.path;
    const local = time - drop.t;
    const rest = path[path.length - 1];
    let from = path[0];
    let to = path[0];
    if (local >= rest[0]) { from = rest; to = rest; }
    else if (local > path[0][0]) {
      let low = 0;
      let high = path.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (path[middle][0] <= local) low = middle; else high = middle;
      }
      from = path[low];
      to = path[high];
    }
    const span = to[0] - from[0];
    const f = span > 0 ? Math.min(1, Math.max(0, (local - from[0]) / span)) : 1;
    const z = from[3] + (to[3] - from[3]) * f;
    return {
      x: from[1] + (to[1] - from[1]) * f,
      y: from[2] + (to[2] - from[2]) * f,
      z,
      lift: Math.min(1, Math.max(0, (z - rest[3]) / LIFT_HEIGHT))
    };
  }

  static rest(drop) {
    if (Array.isArray(drop.path) && drop.path.length >= 2) { const end = drop.path[drop.path.length - 1]; return { x: end[1], y: end[2] }; }
    return Number.isFinite(drop.toX) && Number.isFinite(drop.toY) ? { x: drop.toX, y: drop.toY } : { x: drop.x, y: drop.y };
  }
}
