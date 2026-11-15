export class WalkMask {
  static CELL = 2;
  static SIZE = 512;
  static #cache = new WeakMap();

  static from(image, { strict = false } = {}) {
    if (!image || typeof document === 'undefined') return null;
    let byMode = WalkMask.#cache.get(image);
    if (!byMode) { byMode = new Map(); WalkMask.#cache.set(image, byMode); }
    if (!byMode.has(strict)) {
      let mask = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = WalkMask.SIZE;
        canvas.height = WalkMask.SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, WalkMask.SIZE, WalkMask.SIZE);
        mask = WalkMask.fromPixels(context.getImageData(0, 0, WalkMask.SIZE, WalkMask.SIZE).data, WalkMask.SIZE, { strict });
      } catch {
        mask = null;
      }
      byMode.set(strict, mask);
    }
    return byMode.get(strict);
  }

  static fromPixels(rgba, size, { strict = false } = {}) {
    const cells = new Uint8Array(size * size);
    let floor = 0;
    for (let index = 0; index < cells.length; index += 1) {
      const at = index * 4;
      const alpha = rgba[at + 3];
      if (alpha < 128) continue;
      const r = rgba[at]; const g = rgba[at + 1]; const b = rgba[at + 2];
      const light = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const walkable = strict ? light >= 62 || chroma >= 26 : light >= 28 || chroma >= 16;
      if (walkable) { cells[index] = 1; floor += 1; }
    }
    const share = floor / cells.length;
    if (share < 0.02 || share > 0.97) return null;
    return { size, cells, cell: 1024 / size };
  }

  static isFloor(mask, px, py) {
    if (!mask) return true;
    const x = Math.floor(px / mask.cell);
    const y = Math.floor(py / mask.cell);
    return x >= 0 && y >= 0 && x < mask.size && y < mask.size && mask.cells[y * mask.size + x] === 1;
  }
}
