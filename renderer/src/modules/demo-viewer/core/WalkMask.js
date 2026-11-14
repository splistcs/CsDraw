/**
 * Onde ha chao em cada radar: as paredes e o vazio sao transparentes ou escuros na imagem. A smoke e o fogo usam
 * essa mascara para se espalhar so por onde o jogador anda (e nao atravessar paredes).
 */
export class WalkMask {
  static CELL = 2; // pixels do radar (1024) por celula da mascara
  static SIZE = 512; // 1024 / CELL
  static #cache = new WeakMap(); // imagem -> { estrito: mascara }

  /**
   * Mascara de um radar (HTMLImageElement) ou null (sem imagem, fora do navegador ou radar sem chao legivel).
   * `strict` e para o andar de baixo: la o resto do mapa aparece apagado (cinza escuro) e nao conta como chao.
   */
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
        mask = null; // imagem de outra origem ou sem leitura de pixels: o efeito cai no circulo
      }
      byMode.set(strict, mask);
    }
    return byMode.get(strict);
  }

  /** Mascara a partir de pixels RGBA (`size` x `size`). Devolve null se quase nada (ou quase tudo) for chao: imagem estranha. */
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
      // Radares sem transparencia pintam o vazio de quase preto; o andar de baixo apaga o resto em cinza escuro.
      const walkable = strict ? light >= 62 || chroma >= 26 : light >= 28 || chroma >= 16;
      if (walkable) { cells[index] = 1; floor += 1; }
    }
    const share = floor / cells.length;
    if (share < 0.02 || share > 0.97) return null;
    return { size, cells, cell: 1024 / size };
  }

  /** A celula que contem o ponto (px, py) do radar e chao? */
  static isFloor(mask, px, py) {
    if (!mask) return true;
    const x = Math.floor(px / mask.cell);
    const y = Math.floor(py / mask.cell);
    return x >= 0 && y >= 0 && x < mask.size && y < mask.size && mask.cells[y * mask.size + x] === 1;
  }
}
