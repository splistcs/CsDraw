import { GrenadeCatalog } from '../constants/GrenadeCatalog.js';
import { GrenadeSprites } from './GrenadeSprites.js';
import { MapLayout } from './MapLayout.js';
import { StickerEffect } from './StickerEffect.js';

const SHAPES = ['line', 'arrow', 'rect', 'ellipse'];
const DRAW_TOOLS = ['pen', 'highlighter', ...SHAPES];

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / lengthSquared));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

/**
 * Motor do quadro: tracos (caneta, marca-texto, formas, texto), adesivos de granada, historico,
 * filtros e renderizacao com viewport (pan/zoom). Independente de React.
 */
export class DrawingBoard {
  static STICKER_RADIUS = 28;
  static HIGHLIGHTER_FACTOR = 3;

  #canvas;
  #ctx;
  #viewport;
  #allowStickers;
  #transparent;
  #strokes = [];
  #stickers = [];
  #history = [];
  #effects = [];
  #animationFrame = null;
  #layout = MapLayout.forMap({ slug: 'unknown', name: '', lowerLevel: false });
  #images = [];
  #labels = { missingRadar: '', levels: ['', ''] };
  #activeStroke = null;
  #erasing = null;
  #grabbed = null;
  #grabOffset = { x: 0, y: 0 };
  #grabStart = { x: 0, y: 0 };
  #grabMoved = false;

  tool = 'pen';
  pen = { color: '#e2a33b', width: 4 };
  filters = { hiddenTypes: new Set(), hideStrokes: false };
  onChange = () => {};
  onStickerClick = () => {};

  constructor(canvas, viewport, { allowStickers = true, transparent = false } = {}) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#viewport = viewport;
    this.#allowStickers = allowStickers;
    this.#transparent = transparent;
    GrenadeSprites.preload().then(() => this.render());
  }

  // ---------- estado ----------
  get isEmpty() { return this.#strokes.length === 0 && this.#stickers.length === 0; }

  serialize() {
    return {
      strokes: this.#strokes.map((s) => {
        const base = { kind: s.kind, color: s.color, width: s.width, points: s.points };
        return s.kind === 'text' ? { ...base, text: s.text } : base;
      }),
      stickers: this.#stickers.map((s) => ({
        id: s.id, type: s.type, x: Math.round(s.x), y: Math.round(s.y),
        images: s.images.map((image) => ({ mediaId: image.mediaId, caption: image.caption }))
      }))
    };
  }

  load({ strokes = [], stickers = [] }) {
    this.#effects = [];
    this.#strokes = strokes.map((s) => ({ ...s, kind: s.kind ?? 'pen', points: s.points.map((p) => [...p]) }));
    this.#stickers = this.#allowStickers
      ? stickers.map((s) => ({ ...s, id: s.id ?? crypto.randomUUID(), images: (s.images ?? []).map((image) => ({ ...image })) }))
      : [];
    this.#history = [
      ...this.#strokes.map((ref) => ({ kind: 'stroke', ref })),
      ...this.#stickers.map((ref) => ({ kind: 'sticker', ref }))
    ];
    this.render();
  }

  /** Limpa tudo; a limpeza entra no historico (Ctrl+Z restaura). Retorna false se ja estava vazio. */
  clear() {
    if (this.isEmpty) return false;
    this.#history = [{ kind: 'clear', snapshot: { strokes: this.#strokes, stickers: this.#stickers, history: this.#history } }];
    this.#strokes = [];
    this.#stickers = [];
    this.render();
    this.onChange();
    return true;
  }

  reset() {
    this.load({});
    this.onChange();
  }

  undo() {
    while (this.#history.length) {
      const last = this.#history.pop();
      if (this.#revert(last)) {
        this.render();
        this.onChange();
        return true;
      }
    }
    return false;
  }

  #revert(entry) {
    if (entry.kind === 'clear') {
      this.#strokes = entry.snapshot.strokes;
      this.#stickers = entry.snapshot.stickers;
      this.#history = entry.snapshot.history;
      return true;
    }
    if (entry.kind === 'erase') {
      [...entry.items].reverse().forEach(({ stroke, index }) => this.#strokes.splice(index, 0, stroke));
      return true;
    }
    const list = entry.kind === 'stroke' ? this.#strokes : this.#stickers;
    const had = list.includes(entry.ref);
    if (entry.kind === 'stroke') this.#strokes = this.#strokes.filter((s) => s !== entry.ref);
    else this.#stickers = this.#stickers.filter((s) => s !== entry.ref);
    return had;
  }

  // ---------- fundo e filtros ----------
  setBackdrop(layout, images, labels) {
    this.#layout = layout;
    this.#images = images;
    this.#labels = labels;
    this.render();
  }

  setFilters(filters) {
    this.filters = filters;
    this.render();
  }

  isTypeVisible(type) { return !this.filters.hiddenTypes.has(type); }

  toPoint(event) {
    const rect = this.#canvas.getBoundingClientRect();
    return this.#viewport.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  }

  // ---------- interacao (coordenadas do mundo) ----------
  /** Inicia a acao da ferramenta atual. Retorna 'stroke' | 'erase' | 'sticker' | 'text' | null. */
  beginAt(point) {
    if (this.tool === 'text') return 'text';
    if (this.tool === 'eraser') {
      this.#erasing = { items: [] };
      this.#eraseAt(point);
      return 'erase';
    }
    if (this.#allowStickers) {
      const sticker = this.#hitSticker(point);
      if (sticker) {
        this.#grabbed = sticker;
        this.#grabOffset = { x: sticker.x - point.x, y: sticker.y - point.y };
        this.#grabStart = point;
        this.#grabMoved = false;
        return 'sticker';
      }
    }
    if (!DRAW_TOOLS.includes(this.tool) || this.filters.hideStrokes) return null;
    const width = this.tool === 'highlighter' ? this.pen.width * DrawingBoard.HIGHLIGHTER_FACTOR : this.pen.width;
    const start = [point.x, point.y];
    this.#activeStroke = { kind: this.tool, color: this.pen.color, width, points: SHAPES.includes(this.tool) ? [start, [...start]] : [start] };
    this.#strokes.push(this.#activeStroke);
    this.#history.push({ kind: 'stroke', ref: this.#activeStroke });
    this.render();
    return 'stroke';
  }

  moveTo(point) {
    const stroke = this.#activeStroke;
    if (stroke) {
      if (SHAPES.includes(stroke.kind)) {
        stroke.points[1] = [point.x, point.y];
      } else if (stroke.points.length < 6000) {
        const last = stroke.points[stroke.points.length - 1];
        if (Math.hypot(point.x - last[0], point.y - last[1]) * this.#viewport.scale < 1) return;
        stroke.points.push([point.x, point.y]);
      }
      this.render();
    } else if (this.#erasing) {
      this.#eraseAt(point);
    } else if (this.#grabbed) {
      if (!this.#grabMoved && Math.hypot(point.x - this.#grabStart.x, point.y - this.#grabStart.y) * this.#viewport.scale < 6) return;
      this.#grabMoved = true;
      this.#grabbed.x = Math.min(this.#layout.width, Math.max(0, point.x + this.#grabOffset.x));
      this.#grabbed.y = Math.min(this.#layout.height, Math.max(0, point.y + this.#grabOffset.y));
      this.render();
    }
  }

  /** Finaliza traco, apagamento ou arraste. Clique sem arrastar num adesivo dispara onStickerClick. */
  end() {
    const stroke = this.#activeStroke;
    const erasing = this.#erasing;
    const sticker = this.#grabbed;
    const moved = this.#grabMoved;
    this.#activeStroke = null;
    this.#erasing = null;
    this.#grabbed = null;
    this.#grabMoved = false;

    if (sticker && !moved) { this.onStickerClick(sticker); return; }
    if (stroke && SHAPES.includes(stroke.kind)) {
      const [a, b] = stroke.points;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * this.#viewport.scale < 4) {
        this.#strokes = this.#strokes.filter((s) => s !== stroke);
        this.#history = this.#history.filter((h) => h.ref !== stroke);
        this.render();
        return;
      }
    }
    if (erasing?.items.length) {
      this.#history.push({ kind: 'erase', items: erasing.items });
      this.onChange();
      return;
    }
    if (stroke || sticker) this.onChange();
  }

  addText(point, text) {
    const stroke = { kind: 'text', color: this.pen.color, width: this.pen.width, points: [[point.x, point.y]], text };
    this.#strokes.push(stroke);
    this.#history.push({ kind: 'stroke', ref: stroke });
    this.render();
    this.onChange();
  }

  #eraseAt(point) {
    const reach = 10 / this.#viewport.scale;
    for (let index = this.#strokes.length - 1; index >= 0; index -= 1) {
      const stroke = this.#strokes[index];
      if (this.filters.hideStrokes || this.#strokeDistance(stroke, point) > Math.max(stroke.width / 2, 2) + reach) continue;
      this.#strokes.splice(index, 1);
      this.#erasing.items.push({ stroke, index });
    }
    if (this.#erasing.items.length) this.render();
  }

  #outline(stroke) {
    const [a, b] = stroke.points;
    if (stroke.kind === 'rect') return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]];
    if (stroke.kind === 'ellipse') {
      const cx = (a[0] + b[0]) / 2; const cy = (a[1] + b[1]) / 2;
      const rx = Math.abs(b[0] - a[0]) / 2; const ry = Math.abs(b[1] - a[1]) / 2;
      return Array.from({ length: 41 }, (_, i) => [cx + rx * Math.cos((i / 40) * Math.PI * 2), cy + ry * Math.sin((i / 40) * Math.PI * 2)]);
    }
    if (stroke.kind === 'text') {
      const box = this.#textBox(stroke);
      return [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h], [box.x, box.y]];
    }
    return stroke.points;
  }

  #strokeDistance(stroke, point) {
    const outline = this.#outline(stroke);
    if (outline.length === 1) return Math.hypot(point.x - outline[0][0], point.y - outline[0][1]);
    let best = Infinity;
    for (let i = 1; i < outline.length; i += 1) best = Math.min(best, distanceToSegment(point, outline[i - 1], outline[i]));
    return best;
  }

  #fontSize(stroke) { return Math.max(18, stroke.width * 4); }

  #textBox(stroke) {
    const size = this.#fontSize(stroke);
    this.#ctx.save();
    this.#ctx.font = `600 ${size}px "IBM Plex Sans", sans-serif`;
    const width = this.#ctx.measureText(stroke.text).width;
    this.#ctx.restore();
    return { x: stroke.points[0][0], y: stroke.points[0][1] - size / 2, w: width, h: size };
  }

  // ---------- adesivos ----------
  addSticker(type, point) {
    if (!this.#allowStickers || !GrenadeCatalog.findByType(type)) return null;
    const sticker = { id: crypto.randomUUID(), type, x: point.x, y: point.y, images: [] };
    this.#stickers.push(sticker);
    this.#history.push({ kind: 'sticker', ref: sticker });
    this.#spawnEffect(type, point);
    this.render();
    this.onChange();
    return sticker;
  }

  getSticker(id) { return this.#stickers.find((s) => s.id === id) ?? null; }

  /** Adesivo visivel sob o ponto (ou null). */
  findStickerAt(point) { return this.#allowStickers ? this.#hitSticker(point) : null; }

  setStickerImages(id, images) {
    const sticker = this.getSticker(id);
    if (!sticker) return;
    sticker.images = images;
    this.onChange();
  }

  removeStickerAt(point) {
    const sticker = this.#hitSticker(point);
    if (!sticker) return;
    this.#stickers = this.#stickers.filter((s) => s !== sticker);
    this.#history = this.#history.filter((h) => h.ref !== sticker);
    this.render();
    this.onChange();
  }

  #hitSticker(point) {
    const reach = DrawingBoard.STICKER_RADIUS + 4;
    for (let i = this.#stickers.length - 1; i >= 0; i -= 1) {
      const s = this.#stickers[i];
      if (this.isTypeVisible(s.type) && Math.hypot(s.x - point.x, s.y - point.y) <= reach) return s;
    }
    return null;
  }

  // ---------- efeitos ----------
  #spawnEffect(type, point) {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.#effects.push(new StickerEffect(type, point.x, point.y));
    if (this.#animationFrame) return;
    const tick = () => {
      this.#effects = this.#effects.filter((effect) => effect.isAlive(performance.now()));
      this.render();
      this.#animationFrame = this.#effects.length ? requestAnimationFrame(tick) : null;
    };
    this.#animationFrame = requestAnimationFrame(tick);
  }

  // ---------- renderizacao ----------
  render() {
    const ctx = this.#ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    this.#viewport.apply(ctx);
    this.#drawWorld(ctx, { withEffects: true, ignoreFilters: false });
  }

  /** Imagem do mundo inteiro (independente do pan/zoom), sem efeitos e sem filtros. */
  createThumbnail(width = 320) {
    const height = Math.round((width * this.#layout.height) / this.#layout.width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.scale(width / this.#layout.width, width / this.#layout.width);
    this.#drawWorld(ctx, { withEffects: false, ignoreFilters: true });
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  #drawWorld(ctx, { withEffects, ignoreFilters }) {
    if (!this.#transparent) this.#drawBackdrop(ctx);
    if (ignoreFilters || !this.filters.hideStrokes) this.#strokes.forEach((stroke) => this.#drawStroke(ctx, stroke));
    if (!this.#allowStickers) return;
    const visible = (type) => ignoreFilters || this.isTypeVisible(type);
    if (withEffects) {
      const now = performance.now();
      this.#effects.forEach((effect) => visible(effect.type) && effect.draw(ctx, now));
    }
    this.#stickers.forEach((sticker) => visible(sticker.type) && this.#drawSticker(ctx, sticker));
  }

  #drawBackdrop(ctx) {
    ctx.fillStyle = '#10151a';
    ctx.fillRect(0, 0, this.#layout.width, this.#layout.height);
    this.#layout.levels.forEach((level, index) => {
      const image = this.#images[index];
      if (image) { ctx.drawImage(image, level.offsetX, 0, MapLayout.LEVEL_SIZE, MapLayout.LEVEL_SIZE); return; }
      const size = MapLayout.LEVEL_SIZE;
      ctx.fillStyle = '#1a2128';
      ctx.fillRect(level.offsetX, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let p = 0; p <= size; p += 64) {
        ctx.moveTo(level.offsetX + p, 0); ctx.lineTo(level.offsetX + p, size);
        ctx.moveTo(level.offsetX, p); ctx.lineTo(level.offsetX + size, p);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.font = '700 120px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.#layout.name.toUpperCase(), level.offsetX + size / 2, size / 2 - 20);
      ctx.font = '500 26px "IBM Plex Sans", sans-serif';
      const levelLabel = this.#layout.levels.length > 1 ? this.#labels.levels[index] : '';
      ctx.fillText([levelLabel, index === 0 ? this.#labels.missingRadar : ''].filter(Boolean).join(' — '), level.offsetX + size / 2, size / 2 + 60);
    });
  }

  #drawStroke(ctx, stroke) {
    const { kind, color, width, points } = stroke;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const [a, b] = points;

    if (kind === 'text') {
      const size = this.#fontSize(stroke);
      ctx.font = `600 ${size}px "IBM Plex Sans", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, size / 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(stroke.text, a[0], a[1]);
      ctx.fillText(stroke.text, a[0], a[1]);
    } else if (kind === 'line' || kind === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      if (kind === 'arrow') {
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const head = Math.max(16, width * 4);
        ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - head * Math.cos(angle - 0.45), b[1] - head * Math.sin(angle - 0.45));
        ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - head * Math.cos(angle + 0.45), b[1] - head * Math.sin(angle + 0.45));
      }
      ctx.stroke();
    } else if (kind === 'rect') {
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    } else if (kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(Math.abs(b[0] - a[0]) / 2, 0.5), Math.max(Math.abs(b[1] - a[1]) / 2, 0.5), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      if (kind === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineCap = 'square'; }
      this.#drawFreehand(ctx, points, width);
    }
    ctx.restore();
  }

  #drawFreehand(ctx, points, width) {
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i += 1) {
      ctx.quadraticCurveTo(points[i][0], points[i][1], (points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }

  #drawSticker(ctx, { type, x, y }) {
    const grenade = GrenadeCatalog.findByType(type);
    if (!grenade) return;
    const radius = DrawingBoard.STICKER_RADIUS;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grenade.color;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    const sprite = GrenadeSprites.get(type);
    if (sprite) {
      const box = radius * 1.4;
      const ratio = sprite.width / sprite.height;
      const width = ratio >= 1 ? box : box * ratio;
      const height = ratio >= 1 ? box / ratio : box;
      ctx.drawImage(sprite, x - width / 2, y - height / 2, width, height);
      return;
    }
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(grenade.emoji, x, y + 2);
  }
}
