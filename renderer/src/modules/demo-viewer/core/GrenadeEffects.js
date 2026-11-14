import { DropMotion } from './DropMotion.js';
import { IconLibrary } from './IconLibrary.js';
import { SpreadField } from './SpreadField.js';
import { UtilityGlyph } from './UtilityGlyph.js';
import { UtilityStyle } from './UtilityStyle.js';
import { WalkMask } from './WalkMask.js';
import { WeaponIcons } from './WeaponIcons.js';

const LIFE = { smoke: 18, fire: 7, decoy: 15, flash: 1, he: 0.8 };
const UNITS = { smoke: 144, fire: 105, flash: 450, he: 150 }; // raio do efeito em unidades do jogo (flash: so o clarao; HE: a area afetada pela explosao)
const BLOOM_SECONDS = { smoke: 1.1, fire: 1.3 }; // tempo para a nuvem/o fogo se espalharem
const HOLE_UNITS = 140; // raio do buraco que uma HE abre numa smoke
const FIRE_BURNOUT = 0.3; // no fim da vida o fogo se apaga das bordas para o centro (fracao final da vida)
const FIRE_COLORS = ['255, 100, 25', '255, 205, 70', '255, 140, 40'];
const FLASH_OPEN = 0.2; // fracao da vida em que o clarao abre ate o raio total
const HE_OPEN = 0.3; // idem para o pulso da HE (rapido) e depois ele se apaga
const HE_COLOR = '240, 160, 30';
const TRAIL_LINGER = 3; // quanto tempo a trajetoria continua visivel depois de a granada parar
const BOUNCE_PING = 0.6;
const SMOKE_TIMER = { color: '#f0892b', track: 'rgba(10, 14, 17, 0.78)', radius: 16, ring: 4.5, outline: 8 };
const DROP_SIZE = 15;
const DROP_OUTLINE = '#05080a';
const OUTLINE_STEPS = 12; // direcoes em que a silhueta preta e carimbada para formar o contorno
const groundedDrops = new WeakMap(); // item -> posicao final ja cortada pelas paredes
const silhouettes = new WeakMap(); // imagem -> silhueta preta (mesmo tamanho)

/**
 * Tudo que as utilidades desenham no radar: o voo (trilha, quiques), o efeito ao explodir (nuvem de bolinhas,
 * clarao, explosao, fogo), o contador da smoke e as granadas largadas no chao.
 */
export class GrenadeEffects {
  static LIFE = LIFE;

  /**
   * `sides` (indice do jogador -> 2/3) escolhe molotov ou incendiaria no icone da granada em voo.
   * `masks` (uma por andar, de WalkMask) faz a smoke e o fogo se espalharem so pelo chao do radar.
   */
  static draw(ctx, projection, grenades, time, k, { trajectories = true, sides = {}, masks = null } = {}) {
    if (trajectories) grenades.forEach((grenade) => GrenadeEffects.#flight(ctx, projection, grenade, time, k, sides));
    const timers = [];
    grenades.forEach((grenade) => GrenadeEffects.#effect(ctx, projection, grenade, time, k, timers, { masks, grenades }));
    // Contadores por cima de tudo, para nunca ficarem escondidos atras de outra smoke ou fogo.
    timers.forEach((timer) => GrenadeEffects.#smokeTimer(ctx, timer, k));
  }

  /** Desenha o PNG (se ja carregou) centrado em (x, y), mantendo a proporcao dentro de size x size. */
  static icon(ctx, url, x, y, size) {
    const image = IconLibrary.get(url);
    if (!image || typeof ctx.drawImage !== 'function') return false;
    const scale = size / Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
    const w = (image.naturalWidth || size) * scale;
    const h = (image.naturalHeight || size) * scale;
    ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
    return true;
  }

  /** Silhueta preta (so o formato, pelo alfa) da imagem; cacheada. Sem DOM (testes em Node) devolve null. */
  static #silhouette(image) {
    if (typeof document === 'undefined') return null;
    if (!silhouettes.has(image)) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const pen = canvas.getContext('2d');
      pen.drawImage(image, 0, 0);
      pen.globalCompositeOperation = 'source-in';
      pen.fillStyle = DROP_OUTLINE;
      pen.fillRect(0, 0, canvas.width, canvas.height);
      silhouettes.set(image, canvas);
    }
    return silhouettes.get(image);
  }

  /** Icone com contorno preto em volta do formato dele (nao de uma caixa ou circulo). `thickness` na unidade do desenho. */
  static outlinedIcon(ctx, url, x, y, size, thickness) {
    const image = IconLibrary.get(url);
    if (!image || typeof ctx.drawImage !== 'function') return false;
    const scale = size / Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
    const w = (image.naturalWidth || size) * scale;
    const h = (image.naturalHeight || size) * scale;
    const silhouette = GrenadeEffects.#silhouette(image);
    if (silhouette) {
      for (let step = 0; step < OUTLINE_STEPS; step += 1) {
        const angle = (step / OUTLINE_STEPS) * Math.PI * 2;
        ctx.drawImage(silhouette, x - w / 2 + Math.cos(angle) * thickness, y - h / 2 + Math.sin(angle) * thickness, w, h);
      }
    }
    ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
    return true;
  }

  /**
   * Onde o item realmente para: o ponto estimado pela analise pode cair dentro de uma parede, entao o trajeto e
   * cortado no ultimo trecho de chao do radar (`masks`, uma por andar). Sem mascara, vale a estimativa.
   */
  static #grounded(drop, projection, masks) {
    if (drop.path || !masks || !Number.isFinite(drop.toX) || !Number.isFinite(drop.toY)) return drop; // o percurso lido da demo ja e o real: nao se corta
    const level = projection.levelOf?.(drop.z) ?? 0;
    const mask = masks[level];
    if (!mask) return drop;
    const cached = groundedDrops.get(drop);
    if (cached && cached.mask === mask && cached.projection === projection) return cached.value;
    const offsetX = projection.layout?.levels?.[level]?.offsetX ?? 0;
    const [ax, ay] = projection.project(drop.x, drop.y, drop.z);
    const [bx, by] = projection.project(drop.toX, drop.toY, drop.z);
    const STEPS = 24;
    let reach = 0;
    for (let step = 1; step <= STEPS; step += 1) {
      const f = step / STEPS;
      if (!WalkMask.isFloor(mask, ax + (bx - ax) * f - offsetX, ay + (by - ay) * f)) break;
      reach = f;
    }
    const value = reach >= 1 ? drop : reach <= 0
      ? { ...drop, toX: undefined, toY: undefined, fall: undefined }
      : { ...drop, toX: drop.x + (drop.toX - drop.x) * reach, toY: drop.y + (drop.toY - drop.y) * reach };
    groundedDrops.set(drop, { mask, projection, value });
    return value;
  }

  /**
   * Itens largados (morte ou de proposito): voam ate onde param (sem atravessar paredes), aparecem na hora e somem
   * quando alguem os pega. O icone fica centrado no ponto onde o item esta; varios no mesmo ponto abrem em leque.
   */
  static drawDrops(ctx, projection, drops, time, k, masks = null) {
    const stacks = new Map();
    for (const original of drops ?? []) {
      if (original.t > time || (original.until !== null && time >= original.until)) continue;
      const drop = GrenadeEffects.#grounded(original, projection, masks);
      const rest = DropMotion.rest(drop);
      const key = `${Math.round(rest.x / 40)},${Math.round(rest.y / 40)}`;
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key).push(drop);
    }
    const size = DROP_SIZE * k;
    for (const stack of stacks.values()) {
      stack.forEach((drop, index) => {
        const here = DropMotion.at(drop, time);
        const [x, y] = projection.project(here.x, here.y, here.z ?? drop.z);
        const px = x + (index - (stack.length - 1) / 2) * size * 1.3;
        const color = UtilityStyle.color(drop.type);
        const radius = size * (1 + 0.35 * here.lift); // no ar o item "cresce" um pouco, como se estivesse mais perto de quem olha
        ctx.save();
        ctx.globalAlpha = Math.min(1, (time - drop.t) / 0.3 + 0.2);
        if (here.lift > 0) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath(); ctx.arc(px, y + size * 0.55, size * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        const iconY = y - size * 0.45 * here.lift;
        const url = WeaponIcons.dropUrl(drop.type, drop.side);
        const iconSize = radius * 1.35;
        // Sem a bolinha: so o icone do item, com contorno preto acompanhando o proprio formato.
        if (!GrenadeEffects.outlinedIcon(ctx, url, px, iconY, iconSize, 1.5 * k)) {
          UtilityGlyph.draw(ctx, drop.type, px, iconY, iconSize * 0.75 + 4 * k, DROP_OUTLINE);
          UtilityGlyph.draw(ctx, drop.type, px, iconY, iconSize * 0.75, color);
        }
        ctx.restore();
      });
    }
  }

  // ---- voo: trilha da mao ate onde parou, com um ping a cada quique ----

  static #flight(ctx, projection, grenade, time, k, sides) {
    const path = grenade.path;
    if (!path || path.length < 2 || time < path[0][0]) return;
    const sinceLanding = time - grenade.t;
    if (sinceLanding > TRAIL_LINGER) return;
    const alpha = sinceLanding <= 0 ? 1 : 1 - sinceLanding / TRAIL_LINGER;
    const color = UtilityStyle.sideColor(sides[grenade.thrower], grenade.type); // CT azul, T laranja (sem variar pelo tipo)

    const points = [];
    for (let index = 0; index < path.length; index += 1) {
      const [t, x, y, z] = path[index];
      if (t <= time) { points.push(projection.project(x, y, z)); continue; }
      const [t0, x0, y0, z0] = path[index - 1];
      const f = (time - t0) / (t - t0);
      points.push(projection.project(x0 + (x - x0) * f, y0 + (y - y0) * f, z0 + (z - z0) * f));
      break;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85 * alpha;
    ctx.lineWidth = 2.4 * k;
    ctx.beginPath();
    points.forEach(([px, py], index) => (index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();

    for (const [t, x, y, z] of grenade.bounces ?? []) {
      if (t > time) break;
      const [bx, by] = projection.project(x, y, z);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#0d1114';
      ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.arc(bx, by, 3.6 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const progress = (time - t) / BOUNCE_PING;
      if (progress < 1) {
        ctx.globalAlpha = (1 - progress) * alpha;
        ctx.beginPath(); ctx.arc(bx, by, (5 + 20 * progress) * k, 0, Math.PI * 2); ctx.stroke();
      }
    }

    if (sinceLanding <= 0) {
      const [hx, hy] = points[points.length - 1];
      ctx.globalAlpha = 1;
      // Com o PNG da granada, ele voa na ponta da trilha; sem ele, a bolinha colorida de sempre.
      if (!GrenadeEffects.icon(ctx, WeaponIcons.grenadeUrl(grenade.type, sides[grenade.thrower]), hx, hy, 20 * k)) {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8 * k;
        ctx.beginPath(); ctx.arc(hx, hy, 5 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- efeitos no ponto onde a granada explodiu ----

  static #effect(ctx, projection, grenade, time, k, timers, { masks = null, grenades = [] } = {}) {
    const age = time - grenade.t;
    const life = LIFE[grenade.type];
    if (age < 0 || age > life) return;
    const [x, y] = projection.project(grenade.x, grenade.y, grenade.z);
    const fade = Math.min(1, (life - age) / Math.min(2, life));
    ctx.save();
    if (grenade.type === 'smoke') {
      GrenadeEffects.#smoke(ctx, projection, grenade, time, age, fade, k, masks, grenades);
      timers.push({ x, y, remaining: life - age, life });
    } else if (grenade.type === 'fire') {
      GrenadeEffects.#fire(ctx, projection, grenade, age, fade, life, masks);
    } else if (grenade.type === 'flash') {
      GrenadeEffects.#flash(ctx, x, y, age / life, projection.radius(UNITS.flash));
    } else if (grenade.type === 'he') {
      GrenadeEffects.#explosion(ctx, projection, grenade, x, y, age / life, k, masks);
    } else {
      GrenadeEffects.#decoy(ctx, x, y, age, fade, k);
    }
    ctx.restore();
  }

  /**
   * Celulas da smoke/fogo desta granada (em pixels do radar do andar) e o deslocamento do andar. Calcula uma vez por
   * granada: andar so pelo chao do radar, a partir do ponto onde ela parou.
   */
  static #field(grenade, projection, masks, units) {
    const level = projection.levelOf?.(grenade.z) ?? 0;
    const mask = masks?.[level] ?? null;
    const cached = GrenadeEffects.#fields.get(grenade);
    if (cached && cached.projection === projection && cached.mask === mask) return cached;
    const [wx, wy] = projection.project(grenade.x, grenade.y, grenade.z);
    const offsetX = projection.layout?.levels?.[level]?.offsetX ?? 0;
    const field = { projection, mask, offsetX, wx, wy, cells: SpreadField.compute(mask, wx - offsetX, wy, projection.radius(units)) };
    GrenadeEffects.#fields.set(grenade, field);
    return field;
  }

  static #fields = new WeakMap();

  /** Um unico preenchimento com varios circulos: onde eles se sobrepoem a cor nao se soma (a nuvem fica uniforme). */
  static #fillCells(ctx, cells, offsetX, radius, fill) {
    if (!cells.length) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const cell of cells) {
      const cx = offsetX + cell.x;
      ctx.moveTo(cx + radius, cell.y);
      ctx.arc(cx, cell.y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /** Smoke: enche o chao ao redor (sem passar pelas paredes); uma HE que explode dentro abre um buraco que fecha aos poucos. */
  static #smoke(ctx, projection, grenade, time, age, fade, k, masks, grenades) {
    const field = GrenadeEffects.#field(grenade, projection, masks, UNITS.smoke);
    const progress = Math.min(1, age / BLOOM_SECONDS.smoke);
    const spread = 1 - (1 - progress) ** 3;
    const holes = SpreadField.holes(grenade, grenades, { life: LIFE.smoke, smokeUnits: UNITS.smoke, holeUnits: HOLE_UNITS }).map((hole) => {
      const [hx, hy] = projection.project(hole.x, hole.y, grenade.z);
      const size = SpreadField.holeSize(time - hole.t);
      return { x: hx, y: hy, radius: projection.radius(HOLE_UNITS) * size, size, age: time - hole.t };
    }).filter((hole) => hole.size > 0);
    const visible = field.cells.filter((cell) => {
      if (cell.d > spread) return false;
      return !holes.some((hole) => Math.hypot(field.offsetX + cell.x - hole.x, cell.y - hole.y) < hole.radius);
    });
    const cell = field.mask?.cell ?? WalkMask.CELL;
    GrenadeEffects.#fillCells(ctx, visible, field.offsetX, cell * 2.3, `rgba(205, 211, 220, ${0.16 * fade})`);
    GrenadeEffects.#fillCells(ctx, visible, field.offsetX, cell * 1.3, `rgba(205, 211, 220, ${0.3 * fade})`);
    GrenadeEffects.#fillCells(ctx, visible.filter((_, index) => index % 9 === 0), field.offsetX, cell * 3.4, `rgba(230, 234, 240, ${0.08 * fade})`);
    // O buraco aberto pela HE nao tem contorno: a fumaca so se afasta na regiao afetada e volta a fechar.
  }

  /** Fogo da molotov: se espalha pelo chao a partir de onde caiu e se apaga das bordas para o centro no fim. */
  static #fire(ctx, projection, grenade, age, fade, life, masks) {
    const field = GrenadeEffects.#field(grenade, projection, masks, UNITS.fire);
    const progress = Math.min(1, age / BLOOM_SECONDS.fire);
    const spread = 1 - (1 - progress) ** 3;
    const burnout = Math.max(0, (age - life * (1 - FIRE_BURNOUT)) / (life * FIRE_BURNOUT));
    const limit = Math.min(spread, 1 - burnout * 0.85);
    const burning = field.cells.filter((cell) => cell.d <= limit);
    const cell = field.mask?.cell ?? WalkMask.CELL;
    GrenadeEffects.#fillCells(ctx, burning, field.offsetX, cell * 2.4, `rgba(255, 110, 30, ${0.2 * fade})`);
    FIRE_COLORS.forEach((color, group) => {
      const flicker = 0.78 + Math.sin(age * 14 + group * 2.1) * 0.22;
      GrenadeEffects.#fillCells(ctx, burning.filter((_, index) => index % FIRE_COLORS.length === group), field.offsetX, cell * (1.5 + 0.4 * flicker), `rgba(${color}, ${0.5 * fade * flicker})`);
    });
  }

  /**
   * Flash: halo grande e suave, branco no centro e cinza claro nas bordas, que abre rapido e se apaga.
   * Nao respeita paredes (e so um clarao sobre o radar, como o do jogo).
   */
  static #flash(ctx, x, y, progress, maxRadius) {
    const open = Math.min(1, progress / FLASH_OPEN);
    const radius = maxRadius * (0.3 + 0.7 * (1 - (1 - open) ** 3));
    const alpha = (1 - progress) ** 1.3;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, 255, 255, ${0.95 * alpha})`);
    glow.addColorStop(0.1, `rgba(255, 255, 255, ${0.8 * alpha})`);
    glow.addColorStop(0.4, `rgba(228, 231, 236, ${0.42 * alpha})`);
    glow.addColorStop(0.8, `rgba(200, 205, 212, ${0.18 * alpha})`);
    glow.addColorStop(1, 'rgba(190, 196, 204, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  /**
   * HE: pulso laranja que abre bem rapido e se apaga, ocupando so a area afetada pela explosao (o mesmo chao da smoke:
   * nao passa pelas paredes). O ponto da explosao fica marcado no centro.
   */
  static #explosion(ctx, projection, grenade, x, y, progress, k, masks) {
    const field = GrenadeEffects.#field(grenade, projection, masks, UNITS.he);
    const open = Math.min(1, progress / HE_OPEN);
    const spread = 0.25 + 0.75 * (1 - (1 - open) ** 3);
    const alpha = progress <= HE_OPEN ? 1 : Math.max(0, 1 - (progress - HE_OPEN) / (1 - HE_OPEN)) ** 1.4;
    const cell = field.mask?.cell ?? WalkMask.CELL;
    GrenadeEffects.#fillCells(ctx, field.cells.filter((c) => c.d <= spread), field.offsetX, cell * 1.6, `rgba(${HE_COLOR}, ${0.85 * alpha})`);
    ctx.fillStyle = `rgba(255, 190, 160, ${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, 2.6 * k, 0, Math.PI * 2); ctx.fill();
  }

  static #decoy(ctx, x, y, age, fade, k) {
    const r = 8 * k;
    ctx.fillStyle = `rgba(183,148,246,${0.9 * fade})`;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
    const pulse = age % 1;
    ctx.strokeStyle = `rgba(183,148,246,${(1 - pulse) * fade})`;
    ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(x, y, (8 + 24 * pulse) * k, 0, Math.PI * 2); ctx.stroke();
  }

  /** Anel que se esvazia no sentido horario ate a smoke acabar, com os segundos restantes no centro. */
  static #smokeTimer(ctx, { x, y, remaining, life }, k) {
    const start = -Math.PI / 2;
    const radius = SMOKE_TIMER.radius * k;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = SMOKE_TIMER.track;
    ctx.lineWidth = SMOKE_TIMER.outline * k;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = SMOKE_TIMER.color;
    ctx.lineWidth = SMOKE_TIMER.ring * k;
    ctx.beginPath(); ctx.arc(x, y, radius, start, start + Math.PI * 2 * Math.min(1, Math.max(0, remaining / life))); ctx.stroke();
    ctx.font = `700 ${13 * k}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(String(Math.ceil(remaining)), x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(Math.ceil(remaining)), x, y);
    ctx.restore();
  }
}
