export class WeaponIcons {
  static WEAPONS_DIR = './weapons';
  static GRENADES_DIR = './grenades';
  static KNIFE_ICONS = new Set(['knife', 'knife_t', 'bayonet', 'knife_bowie', 'knife_butterfly', 'knife_canis', 'knife_cord', 'knife_css', 'knife_falchion', 'knife_flip', 'knife_gut', 'knife_gypsy_jackknife', 'knife_karambit', 'knife_kukri', 'knife_m9_bayonet', 'knife_outdoor', 'knife_push', 'knife_skeleton', 'knife_stiletto', 'knife_survival_bowie', 'knife_tactical', 'knife_twinblade', 'knife_ursus', 'knife_widowmaker']);
  static GRENADE_FILES = { hegrenade: 'he', flashbang: 'flash', smokegrenade: 'smoke', molotov: 'molotov', incgrenade: 'incendiary', decoy: 'decoy' };

  static grenadeFile(type, side) {
    if (type === 'fire') return side === 3 ? 'incendiary' : 'molotov';
    return type;
  }

  static grenadeUrl(type, side) {
    return `${WeaponIcons.GRENADES_DIR}/${WeaponIcons.grenadeFile(type, side)}.png`;
  }

  static flashAssistUrl() {
    return `${WeaponIcons.WEAPONS_DIR}/flashbang_assist.png`;
  }

  static headshotUrl() {
    return `${WeaponIcons.WEAPONS_DIR}/headshot.png`;
  }

  static c4Url() {
    return `${WeaponIcons.WEAPONS_DIR}/c4.png`;
  }

  static defuserUrl() {
    return `${WeaponIcons.WEAPONS_DIR}/defuser.png`;
  }

  static dropUrl(type, side) {
    if (type === 'c4') return WeaponIcons.c4Url();
    if (type === 'defuser') return WeaponIcons.defuserUrl();
    return WeaponIcons.grenadeUrl(type, side);
  }

  static resolve(name, side = null) {
    const key = String(name ?? '').toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9_]/g, '');
    if (!key) return null;
    if (key === 'inferno') return { key, url: WeaponIcons.grenadeUrl('fire', side) };
    if (WeaponIcons.GRENADE_FILES[key]) return { key, url: `${WeaponIcons.GRENADES_DIR}/${WeaponIcons.GRENADE_FILES[key]}.png` };
    if (key === 'planted_c4' || key === 'c4') return { key: 'c4', url: WeaponIcons.c4Url() };
    if (WeaponIcons.KNIFE_ICONS.has(key)) return { key, url: `${WeaponIcons.WEAPONS_DIR}/${key}.png` };
    if (key.startsWith('knife') || key.includes('bayonet') || key.includes('karambit')) return { key: 'knife', url: `${WeaponIcons.WEAPONS_DIR}/knife.png` };
    return { key, url: `${WeaponIcons.WEAPONS_DIR}/${key}.png` };
  }

  static label(name) {
    return String(name ?? '').replace(/^weapon_/, '').replace(/_/g, ' ').toUpperCase();
  }
}
