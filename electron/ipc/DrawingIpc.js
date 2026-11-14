export class DrawingIpc {
  #drawings;
  constructor({ drawings }) { this.#drawings = drawings; }

  register(registry) {
    registry.handle('drawings:list', () => this.#drawings.list());
    registry.handle('drawings:get', (_e, id) => this.#drawings.get(id));
    registry.handle('drawings:save', (_e, payload) => this.#drawings.save(payload));
    registry.handle('drawings:remove', (_e, id) => this.#drawings.remove(id));
  }
}
