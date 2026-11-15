import { WeaponPrices } from './WeaponPrices.js';

export class HeldItem {
  static GRENADES = { hegrenade: 'he', flashbang: 'flash', smokegrenade: 'smoke', molotov: 'fire', incgrenade: 'fire', decoy: 'decoy' };
  static BARREL = { min: 17, max: 36 };

  static #clean(name) {
    return String(name ?? '').toLowerCase().replace(/^weapon_/, '');
  }

  static of(name) {
    const key = HeldItem.#clean(name);
    if (!key) return { kind: 'none' };
    if (Object.hasOwn(HeldItem.GRENADES, key)) return { kind: 'grenade', grenade: HeldItem.GRENADES[key] };
    if (key.startsWith('knife') || key.includes('bayonet') || key.includes('karambit')) return { kind: 'knife' };
    if (key === 'c4' || key === 'planted_c4') return { kind: 'none' };
    return { kind: 'gun', length: HeldItem.barrel(key) };
  }

  static barrel(name) {
    return WeaponPrices.viewLength(name, HeldItem.BARREL);
  }
}
