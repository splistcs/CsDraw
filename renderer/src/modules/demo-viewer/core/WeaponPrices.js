/**
 * Preco de cada arma (CS2) pelo nome de classe sem "weapon_" (o mesmo de WeaponNames e dos PNG em public/weapons).
 * O alcance do cone de visao de cada jogador no radar cresce com o preco da arma que ele segura.
 */
export class WeaponPrices {
  static TABLE = {
    knife: 0, c4: 0, taser: 200,
    glock: 200, hkp2000: 200, usp_silencer: 200, p250: 300, elite: 300, fiveseven: 500, tec9: 500, cz75a: 500, revolver: 600, deagle: 700,
    nova: 1050, sawedoff: 1100, mag7: 1300, xm1014: 2000,
    mac10: 1050, ump45: 1200, mp9: 1250, bizon: 1400, mp7: 1500, mp5sd: 1500, p90: 2350,
    galilar: 1800, famas: 1950, ak47: 2700, m4a1_silencer: 2900, sg556: 3000, m4a1: 3100, aug: 3300,
    ssg08: 1700, awp: 4750, scar20: 5000, g3sg1: 5000,
    negev: 1700, m249: 5200,
    decoy: 50, flashbang: 200, hegrenade: 300, smokegrenade: 300, molotov: 400, incgrenade: 600
  };
  static MAX = 5200;

  /** Preco da arma, ou null se o nome nao e conhecido. */
  static price(name) {
    const key = String(name ?? '').toLowerCase().replace(/^weapon_/, '');
    return Object.hasOwn(WeaponPrices.TABLE, key) ? WeaponPrices.TABLE[key] : null;
  }

  /** Alcance do cone de visao em unidades do mundo do radar: de `min` (faca, granada, desconhecida) a `max` (a arma mais cara). */
  static viewLength(name, { min = 26, max = 80 } = {}) {
    const price = WeaponPrices.price(name) ?? 0;
    const share = Math.min(1, Math.max(0, price / WeaponPrices.MAX)) ** 0.65; // curva suave: as armas baratas ja se distinguem das caras
    return min + (max - min) * share;
  }
}
