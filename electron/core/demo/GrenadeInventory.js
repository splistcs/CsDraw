export class GrenadeInventory {
  static TYPES = ['he', 'flash', 'smoke', 'fire', 'decoy'];
  static BITS = 2;
  static MAX_PER_TYPE = 3;
  static C4_BIT = 1 << (GrenadeInventory.TYPES.length * GrenadeInventory.BITS);
  static DEFUSER_BIT = GrenadeInventory.C4_BIT << 1;
  static ITEM_IDS = { 43: 'flash', 44: 'he', 45: 'smoke', 46: 'fire', 47: 'decoy', 48: 'fire' };
  static C4_ITEM_ID = 49;
  static DEFUSER_ITEM_ID = 55;

  static pack(inventory, ids = null, hasDefuser = false) {
    const fromNames = GrenadeInventory.#count(inventory, GrenadeInventory.classify);
    const fromIds = GrenadeInventory.#count(ids, (id) => GrenadeInventory.ITEM_IDS[Number(id)] ?? null);
    const grenades = fromNames.reduce((packed, count, index) => packed | (Math.max(count, fromIds[index]) << (index * GrenadeInventory.BITS)), 0);
    return grenades
      | (GrenadeInventory.#hasC4(inventory, ids) ? GrenadeInventory.C4_BIT : 0)
      | (hasDefuser === true || hasDefuser === 1 || GrenadeInventory.#hasDefuser(inventory, ids) ? GrenadeInventory.DEFUSER_BIT : 0);
  }

  static hasC4(packed) {
    return (Number(packed) & GrenadeInventory.C4_BIT) !== 0;
  }

  static hasDefuser(packed) {
    return (Number(packed) & GrenadeInventory.DEFUSER_BIT) !== 0;
  }

  static carriesGear(packed) {
    return (Number(packed) & (GrenadeInventory.DEFUSER_BIT - 1)) !== 0;
  }

  static droppable(packed) {
    const list = Object.entries(GrenadeInventory.counts(packed)).flatMap(([type, count]) => Array(count).fill(type));
    if (GrenadeInventory.hasC4(packed)) list.push('c4');
    if (GrenadeInventory.hasDefuser(packed)) list.push('defuser');
    return list;
  }

  static counts(packed) {
    const value = Number(packed) || 0;
    const mask = (1 << GrenadeInventory.BITS) - 1;
    return Object.fromEntries(GrenadeInventory.TYPES.map((type, index) => [type, (value >> (index * GrenadeInventory.BITS)) & mask]));
  }

  static isThrowable(name) {
    const type = GrenadeInventory.classify(name);
    return type !== null && type !== 'c4' && type !== 'defuser';
  }

  static classify(name) {
    const key = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === 'c4' || key === 'weaponc4' || key.startsWith('c4explosive') || key.includes('plantedc4')) return 'c4';
    if (key.includes('defus')) return 'defuser';
    if (key.includes('flashbang')) return 'flash';
    if (key.includes('smoke')) return 'smoke';
    if (key.includes('highexplosive') || key.includes('hegrenade')) return 'he';
    if (key.includes('molotov') || key.includes('incendiary') || key.includes('incgrenade')) return 'fire';
    if (key.includes('decoy')) return 'decoy';
    return null;
  }

  static #hasDefuser(inventory, ids) {
    const asList = (list) => (typeof list === 'string' ? list.split(',') : Array.isArray(list) ? list : []);
    return asList(inventory).some((item) => GrenadeInventory.classify(item) === 'defuser') || asList(ids).some((id) => Number(id) === GrenadeInventory.DEFUSER_ITEM_ID);
  }

  static #hasC4(inventory, ids) {
    const asList = (list) => (typeof list === 'string' ? list.split(',') : Array.isArray(list) ? list : []);
    return asList(inventory).some((item) => GrenadeInventory.classify(item) === 'c4') || asList(ids).some((id) => Number(id) === GrenadeInventory.C4_ITEM_ID);
  }

  static #count(list, toType) {
    const items = typeof list === 'string' ? list.split(',') : Array.isArray(list) ? list : [];
    const counts = new Array(GrenadeInventory.TYPES.length).fill(0);
    for (const item of items) {
      const index = GrenadeInventory.TYPES.indexOf(toType(item));
      if (index >= 0) counts[index] = Math.min(GrenadeInventory.MAX_PER_TYPE, counts[index] + 1);
    }
    return counts;
  }
}
