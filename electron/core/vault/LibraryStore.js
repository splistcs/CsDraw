/** Biblioteca do usuario (desenhos, playbooks, pastas, indice de midias) em um unico blob criptografado. */
export class LibraryStore {
  static BLOB_ID = 'library';
  static VERSION = 1;

  #blobStore;
  #data = LibraryStore.emptyLibrary();
  #queue = Promise.resolve();

  constructor(blobStore) {
    this.#blobStore = blobStore;
  }

  static emptyLibrary() {
    return { version: LibraryStore.VERSION, drawings: [], playbooks: [], folders: [], media: [], demos: [] };
  }

  async load() {
    if (await this.#blobStore.exists(LibraryStore.BLOB_ID)) {
      const parsed = JSON.parse((await this.#blobStore.getBuffer(LibraryStore.BLOB_ID)).toString('utf8'));
      this.#data = { ...LibraryStore.emptyLibrary(), ...parsed };
    }
  }

  get data() {
    return this.#data;
  }

  /** Aplica a mutacao e grava em disco (gravacoes sao serializadas). */
  async mutate(mutator) {
    const result = mutator(this.#data);
    await this.persist();
    return result;
  }

  async replace(newData) {
    this.#data = { ...LibraryStore.emptyLibrary(), ...newData };
    await this.persist();
  }

  persist() {
    const snapshot = Buffer.from(JSON.stringify(this.#data), 'utf8');
    this.#queue = this.#queue.catch(() => {}).then(() => this.#blobStore.putBuffer(LibraryStore.BLOB_ID, snapshot));
    return this.#queue;
  }
}
