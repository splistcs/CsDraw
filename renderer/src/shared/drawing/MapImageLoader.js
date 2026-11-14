/** Carrega (com cache) radares de public/maps/<nome>.png; null quando o arquivo nao existe. */
export class MapImageLoader {
  static #cache = new Map();

  static load(name) {
    if (!MapImageLoader.#cache.has(name)) {
      MapImageLoader.#cache.set(
        name,
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = `./maps/${name}.png`;
        })
      );
    }
    return MapImageLoader.#cache.get(name);
  }

  /** Um radar por andar do layout (mesma ordem de layout.levels). */
  static loadLevels(layout) {
    return Promise.all(layout.levels.map((level) => MapImageLoader.load(level.imageName)));
  }
}
