/** Aviso simples de que a biblioteca mudou (salvar, importar...), para as abas se atualizarem. */
export class LibraryEvents {
  static #listeners = new Set();

  static subscribe(listener) {
    LibraryEvents.#listeners.add(listener);
    return () => LibraryEvents.#listeners.delete(listener);
  }

  static emit() {
    LibraryEvents.#listeners.forEach((listener) => listener());
  }
}
