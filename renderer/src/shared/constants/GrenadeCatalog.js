export class GrenadeCatalog {
  static GRENADES = [
    { type: 'he', label: 'HE', emoji: '💥', color: '#d6453d' },
    { type: 'flash', label: 'Flash', emoji: '⚡', color: '#e9b824' },
    { type: 'smoke', label: 'Smoke', emoji: '☁️', color: '#7b8794' },
    { type: 'molotov', label: 'Molotov', emoji: '🍾', color: '#e8590c' },
    { type: 'incendiary', label: 'Incendiária', emoji: '🔥', color: '#c2410c' },
    { type: 'decoy', label: 'Decoy', emoji: '📡', color: '#3b82c4' }
  ].map((grenade) => ({ ...grenade, imageUrl: `./grenades-board/${grenade.type}.png` }));

  static findByType(type) {
    return GrenadeCatalog.GRENADES.find((grenade) => grenade.type === type) ?? null;
  }
}
