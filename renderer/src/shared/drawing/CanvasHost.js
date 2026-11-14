/** Mantem o canvas com o tamanho do elemento (e devicePixelRatio) e informa o viewport. */
export class CanvasHost {
  #canvas;
  #viewport;
  #onResize;
  #observer;
  #driveViewport;

  constructor(canvas, viewport, onResize, { driveViewport = true } = {}) {
    this.#canvas = canvas;
    this.#viewport = viewport;
    this.#onResize = onResize;
    this.#driveViewport = driveViewport;
    this.#observer = new ResizeObserver(() => this.sync());
    this.#observer.observe(canvas);
    this.sync();
  }

  sync() {
    const width = this.#canvas.clientWidth;
    const height = this.#canvas.clientHeight;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.round(width * dpr);
    this.#canvas.height = Math.round(height * dpr);
    if (this.#driveViewport) this.#viewport.setSize(width, height, dpr);
    else this.#viewport.dpr = dpr;
    this.#onResize();
  }

  dispose() {
    this.#observer.disconnect();
  }
}
