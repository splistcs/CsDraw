/** Aparencia das utilidades (granadas) no demo viewer: cor na linha do tempo e tipo do icone. */
export class UtilityStyle {
  /** Uma cor por tipo de utilidade (os tipos sao os de `round.grenades`). */
  static COLORS = { smoke: '#aeb8c4', flash: '#f6e05e', he: '#e5484d', fire: '#ff8a1f', decoy: '#b794f6', c4: '#ff5a4d', defuser: '#4a9eff' };

  /** Cor de cada lado (2 = T laranja, 3 = CT azul): corpo dos jogadores e trajetoria das granadas. */
  static SIDE_COLORS = { 2: '#e2a33b', 3: '#4a9eff' };

  static color(type) {
    return UtilityStyle.COLORS[type] ?? '#ffffff';
  }

  /** Cor do lado de quem jogou; sem o lado, cai na cor do tipo da utilidade. */
  static sideColor(side, type = null) {
    return UtilityStyle.SIDE_COLORS[side] ?? UtilityStyle.color(type);
  }

  /** Tipo do GrenadeCatalog (icone e rotulo): o fogo e molotov para os T e incendiaria para os CT. */
  static catalogType(type, side) {
    if (type !== 'fire') return type;
    return side === 3 ? 'incendiary' : 'molotov';
  }
}
