export class GrenadeLoadout {
  static TYPES = ['he', 'flash', 'smoke', 'fire', 'decoy'];
  static BITS = 2;
  static C4_BIT = 1 << (GrenadeLoadout.TYPES.length * GrenadeLoadout.BITS);
  static DEFUSER_BIT = GrenadeLoadout.C4_BIT << 1;
  static DISPLAY_ORDER = ['flash', 'smoke', 'he', 'fire', 'decoy'];

  static items(packed) {
    const value = Number(packed) || 0;
    const mask = (1 << GrenadeLoadout.BITS) - 1;
    return GrenadeLoadout.DISPLAY_ORDER
      .map((type) => ({ type, count: (value >> (GrenadeLoadout.TYPES.indexOf(type) * GrenadeLoadout.BITS)) & mask }))
      .filter((item) => item.count > 0);
  }

  static hasDefuser(packed) {
    return (Number(packed) & GrenadeLoadout.DEFUSER_BIT) !== 0;
  }

  static hasC4(packed) {
    return (Number(packed) & GrenadeLoadout.C4_BIT) !== 0;
  }
}
