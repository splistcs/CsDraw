export class UtilityStyle {
  static COLORS = { smoke: '#aeb8c4', flash: '#f6e05e', he: '#e5484d', fire: '#ff8a1f', decoy: '#b794f6', c4: '#ff5a4d', defuser: '#4a9eff' };

  static SIDE_COLORS = { 2: '#e2a33b', 3: '#4a9eff' };

  static color(type) {
    return UtilityStyle.COLORS[type] ?? '#ffffff';
  }

  static sideColor(side, type = null) {
    return UtilityStyle.SIDE_COLORS[side] ?? UtilityStyle.color(type);
  }

  static catalogType(type, side) {
    if (type !== 'fire') return type;
    return side === 3 ? 'incendiary' : 'molotov';
  }
}
