const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value) => Math.min(1, Math.max(0, value));
const easeOut = (t) => 1 - (1 - t) ** 3;

export class StickerEffect {
  static DURATIONS = { he: 900, flash: 750, smoke: 2600, molotov: 2400, incendiary: 2400, decoy: 1000 };

  #type;
  #x;
  #y;
  #start;
  #duration;
  #particles;

  constructor(type, x, y, start = performance.now()) {
    this.#type = type;
    this.#x = x;
    this.#y = y;
    this.#start = start;
    this.#duration = StickerEffect.DURATIONS[type] ?? 800;
    this.#particles = StickerEffect.#createParticles(type);
  }

  get type() {
    return this.#type;
  }

  isAlive(now) {
    return now - this.#start < this.#duration;
  }

  draw(ctx, now) {
    const elapsed = now - this.#start;
    const t = clamp(elapsed / this.#duration);
    ctx.save();
    ctx.translate(this.#x, this.#y);
    switch (this.#type) {
      case 'he': this.#drawExplosion(ctx, t); break;
      case 'flash': this.#drawFlash(ctx, t); break;
      case 'smoke': this.#drawSmoke(ctx, t); break;
      case 'molotov':
      case 'incendiary': this.#drawFire(ctx, t, elapsed / 1000); break;
      case 'decoy': this.#drawRipples(ctx, t); break;
      default: break;
    }
    ctx.restore();
  }

  static #createParticles(type) {
    switch (type) {
      case 'he':
        return Array.from({ length: 16 }, () => ({ angle: random(0, Math.PI * 2), speed: random(70, 160) }));
      case 'flash':
        return Array.from({ length: 12 }, (_, i) => ({ angle: (i / 12) * Math.PI * 2 + random(-0.1, 0.1) }));
      case 'smoke':
        return Array.from({ length: 12 }, () => ({
          angle: random(0, Math.PI * 2), distance: random(10, 65), size: random(30, 62), delay: random(0, 0.3), drift: random(-1, 1)
        }));
      case 'molotov':
      case 'incendiary': {
        const count = type === 'incendiary' ? 26 : 20;
        return Array.from({ length: count }, () => ({
          offsetX: random(-38, 38), phase: random(0, 1), life: random(0.45, 0.8), height: random(55, 115), size: random(8, 19)
        }));
      }
      default:
        return [];
    }
  }

  #drawExplosion(ctx, t) {
    const alpha = (1 - t) ** 1.2;
    const radius = 15 + 80 * easeOut(t);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, `rgba(255, 244, 190, ${alpha})`);
    gradient.addColorStop(0.45, `rgba(255, 140, 30, ${alpha * 0.9})`);
    gradient.addColorStop(1, 'rgba(200, 40, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * (1 - t)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255, 190, 70, ${alpha})`;
    ctx.lineWidth = 3.5 * (1 - t) + 0.5;
    this.#particles.forEach(({ angle, speed }) => {
      const distance = speed * easeOut(t);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * distance * 0.7, Math.sin(angle) * distance * 0.7);
      ctx.lineTo(Math.cos(angle) * distance, Math.sin(angle) * distance);
      ctx.stroke();
    });
  }

  #drawFlash(ctx, t) {
    const alpha = (1 - t) ** 1.5;
    const radius = 20 + 150 * easeOut(t);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    gradient.addColorStop(0.4, `rgba(255, 244, 160, ${alpha * 0.6})`);
    gradient.addColorStop(1, 'rgba(255, 244, 160, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 3;
    this.#particles.forEach(({ angle }) => {
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.35, Math.sin(angle) * radius * 0.35);
      ctx.lineTo(Math.cos(angle) * radius * 1.05, Math.sin(angle) * radius * 1.05);
      ctx.stroke();
    });
  }

  #drawSmoke(ctx, t) {
    this.#particles.forEach(({ angle, distance, size, delay, drift }) => {
      const local = clamp((t - delay) / (1 - delay));
      if (local <= 0) return;
      const x = Math.cos(angle) * distance * local + drift * 22 * local;
      const y = Math.sin(angle) * distance * local * 0.6 - local * 30;
      const radius = size * (0.5 + local);
      const alpha = Math.sin(Math.PI * local) * 0.6;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(205, 210, 217, ${alpha})`);
      gradient.addColorStop(1, 'rgba(150, 158, 168, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  #drawFire(ctx, t, seconds) {
    const fade = t < 0.8 ? 1 : (1 - t) / 0.2;
    const pulse = 0.85 + Math.sin(seconds * 14) * 0.15;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 62);
    glow.addColorStop(0, `rgba(255, 150, 40, ${0.4 * fade * pulse})`);
    glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    this.#particles.forEach(({ offsetX, phase, life, height, size }) => {
      const local = ((seconds + phase * life) % life) / life;
      const x = offsetX * (1 - local * 0.45) + Math.sin(seconds * 7 + phase * 10) * 6;
      const y = 8 - local * height;
      const radius = size * (1 - local * 0.8);
      ctx.fillStyle = `hsla(${52 - local * 46}, 100%, ${58 - local * 16}%, ${(1 - local) * 0.85 * fade})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(radius, 0.5), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  #drawRipples(ctx, t) {
    for (let i = 0; i < 3; i += 1) {
      const local = clamp(t * 1.4 - i * 0.25);
      if (local <= 0 || local >= 1) continue;
      ctx.strokeStyle = `rgba(90, 167, 232, ${0.7 * (1 - local)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + 62 * local, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
