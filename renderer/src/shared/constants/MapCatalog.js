/**
 * Catalogo de mapas do Counter-Strike 2. Para adicionar um mapa, inclua uma linha e o radar em public/maps/<slug>.png
 * (mapas de dois andares: marque `lowerLevel: true` e adicione public/maps/<slug>-lower.png).
 * O icone do menu de mapas vem de public/mapicons/<slug>.png (a lista de demos usa o radar).
 */
export class MapCatalog {
  static GROUPS = {
    ACTIVE_DUTY: 'Active Duty (Premier)',
    COMPETITIVE: 'Competitivo / Casual',
    WINGMAN: 'Wingman e outros modos'
  };

  static MAPS = [
    { slug: 'ancient', name: 'Ancient', group: 'ACTIVE_DUTY' },
    { slug: 'ancient-night', name: 'Ancient (Night)', group: 'ACTIVE_DUTY' },
    { slug: 'anubis', name: 'Anubis', group: 'ACTIVE_DUTY' },
    { slug: 'cache', name: 'Cache', group: 'ACTIVE_DUTY' },
    { slug: 'dust2', name: 'Dust II', group: 'ACTIVE_DUTY' },
    { slug: 'inferno', name: 'Inferno', group: 'ACTIVE_DUTY' },
    { slug: 'mirage', name: 'Mirage', group: 'ACTIVE_DUTY' },
    { slug: 'nuke', name: 'Nuke', group: 'ACTIVE_DUTY', lowerLevel: true },

    { slug: 'overpass', name: 'Overpass', group: 'COMPETITIVE' },
    { slug: 'train', name: 'Train', group: 'COMPETITIVE' },
    { slug: 'dust', name: 'Dust', group: 'COMPETITIVE' },
    { slug: 'vertigo', name: 'Vertigo', group: 'COMPETITIVE', lowerLevel: true },
    { slug: 'office', name: 'Office', group: 'COMPETITIVE' },
    { slug: 'italy', name: 'Italy', group: 'COMPETITIVE' },
    { slug: 'agency', name: 'Agency', group: 'COMPETITIVE' },
    { slug: 'jura', name: 'Jura', group: 'COMPETITIVE' },
    { slug: 'grail', name: 'Grail', group: 'COMPETITIVE' },
    { slug: 'basalt', name: 'Basalt', group: 'COMPETITIVE' },
    { slug: 'boulder', name: 'Boulder', group: 'COMPETITIVE' },
    { slug: 'fachwerk', name: 'Fachwerk', group: 'COMPETITIVE' },
    { slug: 'shelter', name: 'Shelter', group: 'COMPETITIVE' },
    { slug: 'alpine', name: 'Alpine', group: 'COMPETITIVE' },
    { slug: 'stronghold', name: 'Stronghold', group: 'COMPETITIVE' },
    { slug: 'warden', name: 'Warden', group: 'COMPETITIVE' },

    { slug: 'sanctum', name: 'Sanctum', group: 'WINGMAN' },
    { slug: 'poseidon', name: 'Poseidon', group: 'WINGMAN' },
    { slug: 'palais', name: 'Palais', group: 'WINGMAN' },
    { slug: 'edin', name: 'Edin', group: 'WINGMAN' },
    { slug: 'brewery', name: 'Brewery', group: 'WINGMAN' },
    { slug: 'dogtown', name: 'Dogtown', group: 'WINGMAN' },
    { slug: 'rooftop', name: 'Rooftop', group: 'WINGMAN' },
    { slug: 'thera', name: 'Thera', group: 'WINGMAN' },
    { slug: 'lake', name: 'Lake', group: 'WINGMAN' },
    { slug: 'safehouse', name: 'Safehouse', group: 'WINGMAN' },
    { slug: 'shoots', name: 'Shoots', group: 'WINGMAN' },
    { slug: 'baggage', name: 'Baggage', group: 'WINGMAN', lowerLevel: true },
    { slug: 'shoots-night', name: 'Shoots (Night)', group: 'WINGMAN' },
    { slug: 'golden', name: 'Golden', group: 'WINGMAN' },
    { slug: 'memento', name: 'Memento', group: 'WINGMAN' },
    { slug: 'mills', name: 'Mills', group: 'WINGMAN' },
    { slug: 'whistle', name: 'Whistle', group: 'WINGMAN' },
    { slug: 'transit', name: 'Transit', group: 'WINGMAN' },
    { slug: 'eldorado', name: 'Eldorado', group: 'WINGMAN' },
    { slug: 'sugarcane', name: 'Sugarcane', group: 'WINGMAN' },
    { slug: 'palacio', name: 'Palacio', group: 'WINGMAN' },
    { slug: 'pool-day', name: 'Pool Day', group: 'WINGMAN' },
    { slug: 'canals', name: 'Canals', group: 'WINGMAN' }
  ];

  /** Miniatura do mapa (public/mapicons) e, se ela nao existir, o radar. */
  static iconUrl(slug) {
    return `./mapicons/${slug}.png`;
  }

  static radarUrl(slug) {
    return `./maps/${slug}.png`;
  }

  static tryFind(slug) {
    return MapCatalog.MAPS.find((map) => map.slug === slug) ?? null;
  }

  static findBySlug(slug) {
    return MapCatalog.MAPS.find((map) => map.slug === slug) ?? MapCatalog.MAPS[0];
  }

  static get defaultMap() {
    return MapCatalog.findBySlug('mirage');
  }
}
