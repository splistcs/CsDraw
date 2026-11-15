export class IconLibrary {
  static #entries = new Map();
  static #listeners = new Set();

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
