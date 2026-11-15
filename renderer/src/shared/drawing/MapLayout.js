export class MapLayout {
  static LEVEL_SIZE = 1024;
  static GAP = 64;

  static forMap(map) {
    const size = MapLayout.LEVEL_SIZE;
    const levels = [{ key: 'upper', offsetX: 0, imageName: map.slug }];
    if (map.lowerLevel) levels.push({ key: 'lower', offsetX: size + MapLayout.GAP, imageName: `${map.slug}-lower` });
    return { slug: map.slug, name: map.name, width: levels.length * size + (levels.length - 1) * MapLayout.GAP, height: size, levels };
  }

  static levelRect(layout, index) {
    const level = layout.levels[Math.min(index, layout.levels.length - 1)];
    return { x: level.offsetX, y: 0, w: MapLayout.LEVEL_SIZE, h: MapLayout.LEVEL_SIZE };
  }
}
