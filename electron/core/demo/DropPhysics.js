export class DropPhysics {
  static GRAVITY = 800;
  static EYE_HEIGHT = 64;
  static THROW_SPEED = 200;
  static ROLL_SECONDS = 0.3;
  static MAX_THROW = 330;
  static SLIDE_SECONDS = 0.5;
  static SLIDE_MAX = 120;
  static DEATH_FALL_SECONDS = 0.6;
  static MIN_SHIFT = 6;
  static MAX_SPEED = 450;

  static thrown({ x, y, vx = 0, vy = 0, yaw, pitch = 0 }) {
    if (!Number.isFinite(yaw) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const p = (Math.max(-89, Math.min(89, Number(pitch) || 0)) * Math.PI) / 180;
    const a = (yaw * Math.PI) / 180;
    const horizontal = Math.cos(p) * DropPhysics.THROW_SPEED;
    const vertical = -Math.sin(p) * DropPhysics.THROW_SPEED;
    const flight = (vertical + Math.sqrt(vertical * vertical + 2 * DropPhysics.GRAVITY * DropPhysics.EYE_HEIGHT)) / DropPhysics.GRAVITY;
    const speedX = Math.cos(a) * horizontal;
    const speedY = Math.sin(a) * horizontal;
    const move = DropPhysics.#clamp(
      (speedX + vx) * flight + speedX * DropPhysics.ROLL_SECONDS,
      (speedY + vy) * flight + speedY * DropPhysics.ROLL_SECONDS
    );
    return DropPhysics.#result(x, y, move, flight + DropPhysics.ROLL_SECONDS);
  }

  static died({ x, y, vx = 0, vy = 0 }) {
    const speed = Math.hypot(vx, vy);
    if (!(speed > 1) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = Math.min(DropPhysics.SLIDE_MAX, speed * DropPhysics.SLIDE_SECONDS);
    return DropPhysics.#result(x, y, { dx: (vx / speed) * distance, dy: (vy / speed) * distance }, DropPhysics.DEATH_FALL_SECONDS);
  }

  static velocity(from, to, seconds) {
    if (!(seconds > 0)) return { vx: 0, vy: 0 };
    const vx = (to.x - from.x) / seconds;
    const vy = (to.y - from.y) / seconds;
    return Math.hypot(vx, vy) > DropPhysics.MAX_SPEED ? { vx: 0, vy: 0 } : { vx, vy };
  }

  static #clamp(dx, dy) {
    const length = Math.hypot(dx, dy);
    const scale = length > DropPhysics.MAX_THROW ? DropPhysics.MAX_THROW / length : 1;
    return { dx: dx * scale, dy: dy * scale };
  }

  static #result(x, y, { dx, dy }, fall) {
    if (Math.hypot(dx, dy) < DropPhysics.MIN_SHIFT) return null;
    return { x: x + dx, y: y + dy, fall: Math.round(fall * 100) / 100 };
  }
}
