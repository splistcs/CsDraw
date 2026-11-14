/**
 * Nomes de armas do CS2: o parser entrega ora o nome de exibicao ("AK-47", "M4A1-S"), ora a classe
 * ("weapon_ak47"). Tudo vira o nome de classe sem o prefixo ("ak47", "m4a1_silencer"), que tambem e o
 * nome do arquivo do icone em renderer/public/weapons/.
 */
export class WeaponNames {
  static PRIMARY = new Set([
    'ak47', 'm4a1', 'm4a1_silencer', 'awp', 'aug', 'famas', 'galilar', 'sg556', 'ssg08', 'g3sg1', 'scar20', 'm249', 'negev',
    'mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'bizon', 'nova', 'xm1014', 'mag7', 'sawedoff'
  ]);
  static SECONDARY = new Set(['glock', 'hkp2000', 'usp_silencer', 'p250', 'elite', 'fiveseven', 'tec9', 'cz75a', 'deagle', 'revolver']);

  /** Chave de busca: minusculas e so letras/numeros ("M4A1-S" -> "m4a1s"). */
  static #key(name) {
    return String(name ?? '').toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9]/g, '');
  }

  // chave normalizada -> nome de classe (as classes tambem entram, para aceitar os dois formatos)
  static #TABLE = (() => {
    const table = new Map();
    const add = (classes, ...aliases) => {
      const list = Array.isArray(classes) ? classes : [classes];
      list.forEach((name) => table.set(WeaponNames.#key(name), list[0]));
      aliases.forEach((alias) => table.set(WeaponNames.#key(alias), list[0]));
    };
    ['ak47', 'awp', 'aug', 'famas', 'g3sg1', 'm249', 'negev', 'mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'p90', 'nova', 'xm1014', 'mag7', 'p250', 'tec9', 'deagle', 'taser', 'decoy', 'flashbang', 'molotov', 'revolver', 'fiveseven', 'elite', 'glock', 'ssg08', 'scar20', 'sawedoff', 'cz75a', 'galilar', 'sg556', 'bizon', 'hkp2000']
      .forEach((name) => add(name));
    add('m4a1', 'M4A4');
    add('m4a1_silencer', 'M4A1-S', 'm4a1_silencer_off');
    add('usp_silencer', 'USP-S', 'usp_silencer_off');
    add('hkp2000', 'P2000');
    add('glock', 'Glock-18');
    add('elite', 'Dual Berettas');
    add('cz75a', 'CZ75-Auto');
    add('revolver', 'R8 Revolver');
    add('galilar', 'Galil AR');
    add('sg556', 'SG 553', 'sg553');
    add('bizon', 'PP-Bizon');
    add('deagle', 'Desert Eagle');
    add('taser', 'Zeus x27');
    add('c4', 'C4 Explosive', 'planted_c4');
    add('hegrenade', 'High Explosive Grenade', 'HE Grenade');
    add('smokegrenade', 'Smoke Grenade');
    add('molotov', 'Molotov Cocktail');
    add('incgrenade', 'Incendiary Grenade');
    add('decoy', 'Decoy Grenade');
    add('inferno');
    return table;
  })();

  /** Nome de classe da arma ("AK-47" e "weapon_ak47" -> "ak47"); desconhecida fica em minusculas com `_`; vazio -> ''. */
  static canonical(name) {
    const key = WeaponNames.#key(name);
    if (!key) return '';
    if (WeaponNames.#TABLE.has(key)) return WeaponNames.#TABLE.get(key);
    if (key.startsWith('knife') || key.includes('bayonet') || key.includes('karambit')) return 'knife';
    return String(name).toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /** Facas com icone proprio (public/weapons): o abate com faca mostra a faca de verdade e nao uma generica. */
  static KNIFE_ICONS = new Set(['knife', 'knife_t', 'bayonet', 'knife_bowie', 'knife_butterfly', 'knife_canis', 'knife_cord', 'knife_css', 'knife_falchion', 'knife_flip', 'knife_gut', 'knife_gypsy_jackknife', 'knife_karambit', 'knife_kukri', 'knife_m9_bayonet', 'knife_outdoor', 'knife_push', 'knife_skeleton', 'knife_stiletto', 'knife_survival_bowie', 'knife_tactical', 'knife_twinblade', 'knife_ursus', 'knife_widowmaker']);

  /** Arma do abate: como `canonical`, mas preserva a faca especifica ("knife_karambit") para o icone certo no killfeed. */
  static kill(name) {
    const raw = String(name ?? '').toLowerCase().replace(/^weapon_/, '').replace(/[^a-z0-9_]+/g, '_');
    return WeaponNames.KNIFE_ICONS.has(raw) ? raw : WeaponNames.canonical(name);
  }

  /** Arma de maior valor do inventario (principal, senao pistola): nome de classe ou ''. Aceita nomes e/ou lista de defindex. */
  static main(inventory) {
    const items = typeof inventory === 'string' ? inventory.split(',') : Array.isArray(inventory) ? inventory : [];
    let secondary = '';
    for (const item of items) {
      const name = WeaponNames.canonical(item);
      if (WeaponNames.PRIMARY.has(name)) return name;
      if (!secondary && WeaponNames.SECONDARY.has(name)) secondary = name;
    }
    return secondary;
  }
}
