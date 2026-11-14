/** Le o inteiro de granadas de um frame (ver GrenadeInventory.pack no processo principal). */
export class GrenadeLoadout {
  /** Ordem dos tipos dentro do inteiro; precisa ser igual a GrenadeInventory.TYPES. */
  static TYPES = ['he', 'flash', 'smoke', 'fire', 'decoy'];
  static BITS = 2;
  /** Bit da C4, logo depois dos bits dos tipos; igual a GrenadeInventory.C4_BIT. */
  static C4_BIT = 1 << (GrenadeLoadout.TYPES.length * GrenadeLoadout.BITS);
  /** Bit do kit de defuse, logo depois do da C4; igual a GrenadeInventory.DEFUSER_BIT. */
  static DEFUSER_BIT = GrenadeLoadout.C4_BIT << 1;
  /** Ordem em que aparecem no painel do jogador. */
  static DISPLAY_ORDER = ['flash', 'smoke', 'he', 'fire', 'decoy'];

  /** Lista `{ type, count }` das granadas carregadas, na ordem de exibicao. */
  static items(packed) {
    const value = Number(packed) || 0;
    const mask = (1 << GrenadeLoadout.BITS) - 1;
    return GrenadeLoadout.DISPLAY_ORDER
      .map((type) => ({ type, count: (value >> (GrenadeLoadout.TYPES.indexOf(type) * GrenadeLoadout.BITS)) & mask }))
      .filter((item) => item.count > 0);
  }

  /** O jogador tem o kit de defuse? */
  static hasDefuser(packed) {
    return (Number(packed) & GrenadeLoadout.DEFUSER_BIT) !== 0;
  }

  /** O jogador carrega a C4? */
  static hasC4(packed) {
    return (Number(packed) & GrenadeLoadout.C4_BIT) !== 0;
  }
}
