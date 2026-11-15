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

  static loadLevels(layout) {
    return Promise.all(layout.levels.map((level) => MapImageLoader.load(level.imageName)));
  }
}
