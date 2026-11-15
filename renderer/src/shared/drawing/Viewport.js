export class Viewport {
  static MIN_FACTOR = 0.35;
  static MAX_FACTOR = 24;
  static MARGIN = 0.96;

  width = 1;
  height = 1;
  dpr = 1;
  scale = 1;
  tx = 0;
  ty = 0;
  world = { x: 0, y: 0, w: 1024, h: 1024 };
  insets = { top: 0, right: 0, bottom: 0, left: 0 };
  #isFitted = true;
  #focus = null;
  #listeners = new Set();

  get availableWidth() { return Math.max(1, this.width - this.insets.left - this.insets.right); }
  get availableHeight() { return Math.max(1, this.height - this.insets.top - this.insets.bottom); }

  get fitScale() {
    return Math.min(this.availableWidth / this.world.w, this.availableHeight / this.world.h) * Viewport.MARGIN;
  }

  get zoomPercent() {
    return Math.round((this.scale / this.fitScale) * 100);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setSize(width, height, dpr = 1) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    if (this.#isFitted) this.#applyFit(this.#focus ?? this.world);
    this.#emit();
  }

  setInsets({ top = 0, right = 0, bottom = 0, left = 0 }) {
    this.insets = { top, right, bottom, left };
    if (this.#isFitted) this.#applyFit(this.#focus ?? this.world);
    this.#emit();
  }

  setWorld(w, h) {
    this.world = { x: 0, y: 0, w, h };
    this.fit();
  }

  fit(rect = this.world) {
    this.#focus = rect === this.world ? null : rect;
    this.#isFitted = true;
    this.#applyFit(rect);
    this.#emit();
  }

  zoomAt(sx, sy, factor) {
    const next = Math.min(this.fitScale * Viewport.MAX_FACTOR, Math.max(this.fitScale * Viewport.MIN_FACTOR, this.scale * factor));
    const ratio = next / this.scale;
    this.tx = sx - (sx - this.tx) * ratio;
    this.ty = sy - (sy - this.ty) * ratio;
    this.scale = next;
    this.#isFitted = false;
    this.#emit();
  }

  zoomCentered(factor) {
    this.zoomAt(this.width / 2, this.height / 2, factor);
  }

  panBy(dx, dy) {
    this.tx += dx;
    this.ty += dy;
    this.#isFitted = false;
    this.#emit();
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale };
  }

  worldToScreen(x, y) {
    return { x: x * this.scale + this.tx, y: y * this.scale + this.ty };
  }

  apply(ctx) {
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.tx, this.dpr * this.ty);
  }

  #applyFit(rect) {
    this.scale = Math.min(this.availableWidth / rect.w, this.availableHeight / rect.h) * Viewport.MARGIN;
    this.tx = this.insets.left + (this.availableWidth - rect.w * this.scale) / 2 - rect.x * this.scale;
    this.ty = this.insets.top + (this.availableHeight - rect.h * this.scale) / 2 - rect.y * this.scale;
  }

  #emit() {
    this.#listeners.forEach((listener) => listener());
  }
}
