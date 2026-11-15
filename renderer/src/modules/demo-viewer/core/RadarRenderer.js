import { MapLayout } from '../../../shared/drawing/MapLayout.js';
import { BlindState } from './BlindState.js';
import { BombFuse } from './BombFuse.js';
import { FrameInterpolator } from './FrameInterpolator.js';
import { GrenadeEffects } from './GrenadeEffects.js';
import { GrenadeLoadout } from './GrenadeLoadout.js';
import { HeldItem } from './HeldItem.js';
import { UtilityGlyph } from './UtilityGlyph.js';
import { UtilityStyle } from './UtilityStyle.js';
import { WalkMask } from './WalkMask.js';
import { WeaponIcons } from './WeaponIcons.js';

const BODY_OUTLINE = '#10151a';
const HP_LOST = { 2: 'rgba(38, 22, 4, 0.85)', 3: 'rgba(5, 14, 36, 0.85)' };
const DEFUSER_BADGE = { offset: 8.6, size: 13, icon: 11, fill: 'rgba(13, 17, 20, 0.94)' };
const BLIND = { color: '#ffffff', outline: 'rgba(10, 14, 17, 0.8)', radius: 15.5, glow: 26, fade: 0.6 };
const BOMB = { radius: 17, width: 5.5, icon: 17, base: 'rgba(22, 30, 48, 0.95)', disc: 'rgba(13, 17, 20, 0.92)', progress: '#46a758', noKit: '#f5c542', kit: '#e5484d', defused: '#46a758' };
export const DEFAULT_BRIGHTNESS = 1.25;
export const BRIGHTNESS_RANGE = { min: 0.8, max: 2 };

export class RadarRenderer {
  static COLORS = UtilityStyle.SIDE_COLORS;
  static #lit = new WeakMap();

  static draw(ctx, { viewport, layout, images, projection, round, time, players, weapons = [], showNames, labels, options = {} }) {
    const { trajectories = true, dropped = true, brightness = DEFAULT_BRIGHTNESS } = options;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    viewport.apply(ctx);
    RadarRenderer.#background(ctx, layout, images, projection, labels, brightness);

    const k = Math.pow(Math.max(viewport.scale / viewport.fitScale, 0.2), -0.5);
    const sampled = FrameInterpolator.sample(round.frames, time);
    const positions = new Map(sampled.map((p) => [p.idx, p]));
    const dead = new Set(round.kills.filter((kill) => kill.t <= time && kill.victim !== null).map((kill) => kill.victim));

    const blinded = BlindState.remaining(round.blinds, time);
    const masks = projection.isCalibrated ? (images ?? []).map((image, index) => WalkMask.from(image, { strict: index > 0 })) : null;

    GrenadeEffects.draw(ctx, projection, round.grenades, time, k, { trajectories, sides: round.sides, masks });
    RadarRenderer.#bomb(ctx, projection, round.bomb, time, k);
    RadarRenderer.#killLines(ctx, projection, round.kills, positions, time, k);
    const entries = sampled.map((p) => ({ p, isDead: dead.has(p.idx) || p.hp <= 0 }));
    const nameOf = (p) => players[p.idx]?.name ?? '';
    entries.filter((e) => e.isDead).forEach(({ p }) => RadarRenderer.#player(ctx, projection, p, true, nameOf(p), showNames, k, weapons[p.weapon] ?? ''));
    if (dropped) GrenadeEffects.drawDrops(ctx, projection, round.drops, time, k, masks);
    entries.filter((e) => !e.isDead).forEach(({ p }) => {
      RadarRenderer.#player(ctx, projection, p, false, nameOf(p), showNames, k, weapons[p.weapon] ?? '', blinded.get(p.idx) ?? 0);
      if (GrenadeLoadout.hasC4(p.nades)) RadarRenderer.#carrier(ctx, projection, p, k);
      if (p.side === 3 && GrenadeLoadout.hasDefuser(p.nades)) RadarRenderer.#defuser(ctx, projection, p, k);
    });
  }

  static #bright(image, factor) {
    if (!image || Math.abs(factor - 1) < 0.01 || typeof document === 'undefined') return image;
    const key = Math.round(factor * 100);
    let byFactor = RadarRenderer.#lit.get(image);
    if (!byFactor) { byFactor = new Map(); RadarRenderer.#lit.set(image, byFactor); }
    if (!byFactor.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const lit = canvas.getContext('2d');
      lit.filter = `brightness(${factor})`;
      lit.drawImage(image, 0, 0);
      byFactor.set(key, canvas);
    }
    return byFactor.get(key);
  }

  static #background(ctx, layout, images, projection, labels, brightness) {
    ctx.fillStyle = '#0d1114';
    ctx.fillRect(0, 0, layout.width, layout.height);
    const size = MapLayout.LEVEL_SIZE;
    layout.levels.forEach((level, index) => {
      const image = images[index];
      if (image && projection.isCalibrated) { ctx.drawImage(RadarRenderer.#bright(image, brightness), level.offsetX, 0, size, size); return; }
      ctx.fillStyle = '#1a2128';
      ctx.fillRect(level.offsetX, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let p = 0; p <= size; p += 64) {
        ctx.moveTo(level.offsetX + p, 0); ctx.lineTo(level.offsetX + p, size);
        ctx.moveTo(level.offsetX, p); ctx.lineTo(level.offsetX + size, p);
      }
      ctx.stroke();
      if (layout.levels.length > 1 && labels) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = '700 64px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels.levels[index] ?? '', level.offsetX + size / 2, 90);
      }
    });
  }

  static #bomb(ctx, projection, events, time, k) {
    const bomb = BombFuse.at(events, time);
    if (!bomb) return;
    const [x, y] = projection.project(bomb.x, bomb.y, bomb.z);
    ctx.save();
    if (bomb.exploded) {
      const progress = Math.min(1, (time - bomb.explodedAt) / 1.2);
      ctx.strokeStyle = `rgba(255,120,30,${1 - progress})`;
      ctx.lineWidth = 6 * k;
      ctx.beginPath(); ctx.arc(x, y, (14 + 90 * progress) * k, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    const R = BOMB.radius * k;
    const top = -Math.PI / 2;
    ctx.fillStyle = BOMB.disc;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'butt';
    ctx.lineWidth = BOMB.width * k;
    ctx.strokeStyle = BOMB.base;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    if (bomb.progress > 0) {
      ctx.strokeStyle = bomb.defused ? BOMB.defused : BOMB.progress;
      ctx.beginPath(); ctx.arc(x, y, R, top, top + Math.PI * 2 * bomb.progress); ctx.stroke();
    }
    for (const [fraction, color] of [[bomb.marks.noKit, BOMB.noKit], [bomb.marks.kit, BOMB.kit]]) {
      const angle = top + Math.PI * 2 * fraction;
      const inner = R - (BOMB.width / 2 + 1.5) * k;
      const outer = R + (BOMB.width / 2 + 1.5) * k;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6 * k;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    const pulse = bomb.defused ? 0 : (Math.sin(time * 8) + 1) / 2;
    ctx.globalAlpha = bomb.defused ? 1 : 0.8 + 0.2 * pulse;
    if (!GrenadeEffects.icon(ctx, WeaponIcons.c4Url(), x, y, BOMB.icon * k)) UtilityGlyph.draw(ctx, 'c4', x, y, BOMB.icon * k, bomb.defused ? BOMB.defused : UtilityStyle.color('c4'));
    ctx.restore();
  }

  static #killLines(ctx, projection, kills, positions, time, k) {
    for (const kill of kills) {
      const age = time - kill.t;
      if (age < 0 || age > 1.2 || kill.killer === null || kill.victim === null) continue;
      const from = positions.get(kill.killer);
      const to = positions.get(kill.victim);
      if (!from || !to) continue;
      const [x1, y1] = projection.project(from.x, from.y, from.z);
      const [x2, y2] = projection.project(to.x, to.y, to.z);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - age / 1.2)})`;
      ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }

  static #carrier(ctx, projection, player, k) {
    const [x, y] = projection.project(player.x, player.y, player.z);
    const cx = x + 15 * k;
    const cy = y + 13 * k;
    const color = UtilityStyle.color('c4');
    ctx.save();
    ctx.fillStyle = 'rgba(13, 17, 20, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(cx, cy, 10 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (!GrenadeEffects.icon(ctx, WeaponIcons.c4Url(), cx, cy, 15 * k)) UtilityGlyph.draw(ctx, 'c4', cx, cy, 14 * k, color);
    ctx.restore();
  }

  static #blind(ctx, x, y, remaining, k) {
    const fade = Math.min(1, remaining / BLIND.fade);
    ctx.save();
    ctx.globalAlpha = fade;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, BLIND.glow * k);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.45, 'rgba(255, 255, 255, 0.85)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, BLIND.glow * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = BLIND.outline;
    ctx.lineWidth = 6.5 * k;
    ctx.beginPath(); ctx.arc(x, y, BLIND.radius * k, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = BLIND.color;
    ctx.lineWidth = 3.2 * k;
    ctx.beginPath(); ctx.arc(x, y, BLIND.radius * k, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `700 ${15 * k}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3.5 * k;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(`${remaining.toFixed(1)}s`, x, y + (BLIND.radius + 4) * k);
    ctx.fillStyle = BLIND.color;
    ctx.fillText(`${remaining.toFixed(1)}s`, x, y + (BLIND.radius + 4) * k);
    ctx.restore();
  }

  static #player(ctx, projection, player, isDead, name, showNames, k, weapon = '', blindLeft = 0) {
    const [x, y] = projection.project(player.x, player.y, player.z);
    const color = RadarRenderer.COLORS[player.side] ?? '#999';
    ctx.save();
    if (isDead) {
      const r = 8 * k;
      ctx.strokeStyle = 'rgba(200,200,200,0.8)';
      ctx.lineWidth = 4 * k;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (blindLeft > 0) RadarRenderer.#blind(ctx, x, y, blindLeft, k);
    else RadarRenderer.#body(ctx, x, y, player, color, HeldItem.of(weapon), k);
    if (showNames && name) {
      ctx.font = `600 ${20 * k}px "IBM Plex Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4 * k;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(name, x, y - 18 * k);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, x, y - 18 * k);
    }
    ctx.restore();
  }

  static #body(ctx, x, y, player, color, held, k) {
    const R = 11 * k;
    const angle = (-player.yaw * Math.PI) / 180;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = BODY_OUTLINE;
    ctx.lineWidth = 6 * k;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    if (held.kind === 'gun') {
      const half = 4.5 * k;
      const length = Math.max(held.length * k, R + 4 * k);
      ctx.rect(0, -half, length, half * 2);
    } else if (held.kind === 'knife') {
      ctx.moveTo(R * 0.62, -R * 0.78);
      ctx.lineTo(R * 1.95, 0);
      ctx.lineTo(R * 0.62, R * 0.78);
    }
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    RadarRenderer.#health(ctx, x, y, R, player.hp, player.side);
    if (held.kind === 'grenade') RadarRenderer.#heldGrenade(ctx, x, y, held.grenade, player.side, color, k);
  }

  static #health(ctx, x, y, R, hp, side) {
    const lost = 1 - Math.min(100, Math.max(0, Number(hp) || 0)) / 100;
    if (lost <= 0.005) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = HP_LOST[side] ?? 'rgba(10, 14, 17, 0.85)';
    ctx.fillRect(x - R, y - R, R * 2, R * 2 * lost);
    ctx.restore();
  }

  static #heldGrenade(ctx, x, y, type, side, color, k) {
    const cx = x + 16 * k;
    const cy = y - 5 * k;
    if (GrenadeEffects.outlinedIcon(ctx, WeaponIcons.grenadeUrl(type, side), cx, cy, 20 * k, 1.5 * k)) return;
    UtilityGlyph.draw(ctx, type, cx, cy, 19 * k, BODY_OUTLINE);
    UtilityGlyph.draw(ctx, type, cx, cy, 14 * k, color);
  }

  static #defuser(ctx, projection, player, k) {
    const [x, y] = projection.project(player.x, player.y, player.z);
    const cx = x + DEFUSER_BADGE.offset * k;
    const cy = y + DEFUSER_BADGE.offset * k;
    const half = (DEFUSER_BADGE.size * k) / 2;
    ctx.save();
    ctx.fillStyle = DEFUSER_BADGE.fill;
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
    if (!GrenadeEffects.icon(ctx, WeaponIcons.defuserUrl(), cx, cy, DEFUSER_BADGE.icon * k)) UtilityGlyph.draw(ctx, 'defuser', cx, cy, DEFUSER_BADGE.icon * k, UtilityStyle.color('defuser'));
    ctx.restore();
  }
}
