import { api } from '../api/api.js';
import { LibraryEvents } from '../events/LibraryEvents.js';

export class MediaIndex {
  static #promise = null;
  static #subscribed = false;

  static async find(id) {
    if (!MediaIndex.#subscribed) {
      MediaIndex.#subscribed = true;
      LibraryEvents.subscribe(() => { MediaIndex.#promise = null; });
    }
    MediaIndex.#promise ??= api.media.tree();
    const tree = await MediaIndex.#promise;
    return tree.items.find((item) => item.id === id) ?? null;
  }
}
