import { GrenadeCatalog } from '../constants/GrenadeCatalog.js';

/** Pre-carrega e guarda em cache os PNGs das granadas para uso no canvas. */
export class GrenadeSprites {
  static #images = new Map();
  static #loading = null;

  static preload() {
    if (!GrenadeSprites.#loading) {
      GrenadeSprites.#loading = Promise.all(
        GrenadeCatalog.GRENADES.map(
          (grenade) =>
            new Promise((resolve) => {
              const image = new Image();
              image.onload = () => {
                GrenadeSprites.#images.set(grenade.type, image);
                resolve();
              };
              image.onerror = resolve; // sem PNG: o canvas usa o emoji
              image.src = grenade.imageUrl;
            })
        )
      );
    }
    return GrenadeSprites.#loading;
  }

  static get(type) {
    return GrenadeSprites.#images.get(type) ?? null;
  }
}
