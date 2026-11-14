/**
 * Cache dos icones PNG do demo viewer (public/weapons e public/grenades). Um arquivo que nao existe vira
 * "falhou" uma unica vez e o desenho cai no icone vetorial/texto. Quem desenha em canvas assina `subscribe`
 * para redesenhar quando um icone termina de carregar.
 */
export class IconLibrary {
  static #entries = new Map();
  static #listeners = new Set();

  /** Imagem pronta ou null (ainda carregando, inexistente ou fora do navegador). Comeca a carregar na 1a chamada. */
  static get(url) {
    if (!url) return null;
    let entry = IconLibrary.#entries.get(url);
    if (!entry) {
      entry = { state: 'loading', image: null };
      IconLibrary.#entries.set(url, entry);
      if (typeof Image === 'undefined') {
        entry.state = 'failed';
      } else {
        const image = new Image();
        image.onload = () => { entry.state = 'ready'; entry.image = image; IconLibrary.#notify(); };
        image.onerror = () => { entry.state = 'failed'; IconLibrary.#notify(); };
        image.src = url;
      }
    }
    return entry.state === 'ready' ? entry.image : null;
  }

  /** O arquivo ja se mostrou inexistente/ilegivel? (para trocar por texto/vetor sem esperar) */
  static failed(url) {
    return IconLibrary.#entries.get(url)?.state === 'failed';
  }

  static subscribe(listener) {
    IconLibrary.#listeners.add(listener);
    return () => IconLibrary.#listeners.delete(listener);
  }

  static #notify() {
    IconLibrary.#listeners.forEach((listener) => listener());
  }
}
