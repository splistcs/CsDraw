export class PlaybookIpc {
  #playbooks;
  constructor({ playbooks }) { this.#playbooks = playbooks; }

  register(registry) {
    registry.handle('playbooks:list', () => this.#playbooks.list());
    registry.handle('playbooks:get', (_e, id) => this.#playbooks.get(id));
    registry.handle('playbooks:save', (_e, payload) => this.#playbooks.save(payload));
    registry.handle('playbooks:remove', (_e, id) => this.#playbooks.remove(id));
  }
}
