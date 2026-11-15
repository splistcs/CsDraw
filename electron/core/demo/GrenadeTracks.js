import { GrenadeInventory } from './GrenadeInventory.js';

const MAX_TICK_GAP = 2;
const MAX_FLIGHT_SECONDS = 12;
const MAX_MATCH_DISTANCE = 320;
const BOUNCE_IMPULSE = 90;
const PATH_STEP_TICKS = 4;

export class GrenadeTracks {
  static fromRows(rows) {
    const byEntity = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const kind = String(row.grenade_type ?? '');
      if (!/projectile/i.test(kind)) continue;
      const type = GrenadeInventory.classify(kind);
      const tick = Number(row.tick);
      const x = Number(row.x);
      const y = Number(row.y);
      if (!type || !Number.isFinite(tick) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = `${row.grenade_entity_id}|${type}`;
      if (!byEntity.has(key)) byEntity.set(key, { entityId: row.grenade_entity_id, type, list: [] });
      byEntity.get(key).list.push({ tick, x, y, z: Number(row.z) || 0, thrower: row.steamid === undefined || row.steamid === null ? null : String(row.steamid) });
    }
    const tracks = [];
    for (const { entityId, type, list } of byEntity.values()) {
      list.sort((a, b) => a.tick - b.tick);
      let points = [];
      const flush = () => {
        if (points.length >= 3) tracks.push({ entityId, type, thrower: points[0].thrower, startTick: points[0].tick, points, used: false });
        points = [];
      };
      for (const point of list) {
        if (points.length && point.tick - points[points.length - 1].tick > MAX_TICK_GAP) flush();
        points.push(point);
      }
      flush();
    }
    return tracks.sort((a, b) => a.startTick - b.startTick);
  }

  static match(tracks, { tick, type, x, y, thrower = null, entityId = null }, tickRate) {
    const maxFlight = MAX_FLIGHT_SECONDS * tickRate;
    let best = null;
    for (const track of tracks) {
      if (track.used || track.type !== type || track.startTick > tick + 2 || tick - track.startTick > maxFlight) continue;
      if (thrower !== null && track.thrower !== null && thrower !== track.thrower) continue;
      const near = GrenadeTracks.#pointAt(track.points, tick);
      const distance = Math.hypot(near.x - x, near.y - y);
      if (distance > MAX_MATCH_DISTANCE) continue;
      const score = (entityId !== null && track.entityId === entityId ? -1e6 : 0) + distance;
      if (!best || score < best.score) best = { track, score };
    }
    if (best) best.track.used = true;
    return best?.track ?? null;
  }

  static path(track, endTick, tickRate) {
    const points = track.points.filter((point) => point.tick <= endTick);
    const bounces = GrenadeTracks.bounces(points, tickRate);
    const bounceTicks = new Set(bounces.map((b) => b.tick));
    const sampled = points.filter((point, index) => index === 0 || index === points.length - 1 || bounceTicks.has(point.tick) || (point.tick - track.startTick) % PATH_STEP_TICKS === 0);
    return { points: sampled, bounces };
  }

  static bounces(points, tickRate) {
    const found = [];
    let previous = null;
    for (let index = 1; index < points.length; index += 1) {
      const dt = (points[index].tick - points[index - 1].tick) / tickRate;
      if (dt <= 0) continue;
      const velocity = ['x', 'y', 'z'].map((axis) => (points[index][axis] - points[index - 1][axis]) / dt);
      if (previous && index > 2) {
        const impulse = Math.hypot(velocity[0] - previous[0], velocity[1] - previous[1], velocity[2] - previous[2]);
        const last = found[found.length - 1];
        if (impulse > BOUNCE_IMPULSE && (!last || points[index - 1].tick - last.tick > 3)) found.push(points[index - 1]);
      }
      previous = velocity;
    }
    return found;
  }

  static #pointAt(points, tick) {
    let best = points[0];
    for (const point of points) if (Math.abs(point.tick - tick) < Math.abs(best.tick - tick)) best = point;
    return best;
  }
}
