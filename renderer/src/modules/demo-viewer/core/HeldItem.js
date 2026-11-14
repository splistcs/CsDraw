import { WeaponPrices } from './WeaponPrices.js';

/**
 * O que o jogador segura na mao e como isso vira forma no radar:
 *  - granada  -> iconezinho da granada ao lado do corpo;
 *  - faca     -> ponta triangular na direcao do olhar;
 *  - arma     -> retangulo (o "cano") cujo comprimento cresce com a arma (pistola curta, AK media, AWP longa);
 *  - C4/taser/desconhecida -> corpo redondo (a C4 ganha o selo proprio e o taser um cano curto).
 */
export class HeldItem {
  static GRENADES = { hegrenade: 'he', flashbang: 'flash', smokegrenade: 'smoke', molotov: 'fire', incgrenade: 'fire', decoy: 'decoy' };
  /** Cano em unidades do radar a partir do centro do corpo (o corpo tem raio 11). */
  static BARREL = { min: 17, max: 36 };

  static #clean(name) {
    return String(name ?? '').toLowerCase().replace(/^weapon_/, '');
  }

  /** `{ kind: 'grenade' | 'knife' | 'gun' | 'none', grenade?, length? }`. */
  static of(name) {
    const key = HeldItem.#clean(name);
    if (!key) return { kind: 'none' };
    if (Object.hasOwn(HeldItem.GRENADES, key)) return { kind: 'grenade', grenade: HeldItem.GRENADES[key] };
    if (key.startsWith('knife') || key.includes('bayonet') || key.includes('karambit')) return { kind: 'knife' };
    if (key === 'c4' || key === 'planted_c4') return { kind: 'none' };
    return { kind: 'gun', length: HeldItem.barrel(key) };
  }

  /** Comprimento do cano: arma mais cara, cano mais longo; arma fora da tabela usa o menor. */
  static barrel(name) {
    return WeaponPrices.viewLength(name, HeldItem.BARREL);
  }
}
