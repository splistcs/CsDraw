/**
 * Calibracao do radar (pos_x, pos_y, escala) de cada mapa, no formato dos arquivos "overview" do jogo.
 * Valores dos mapas do pool principal; se algum radar desalinhar (o Valve ajusta mapas), use
 * "Auto-ajustar" no viewer ou corrija a linha. O radar do andar de baixo usa a mesma calibracao.
 * Mapas que nao estao aqui (ou cuja calibracao erra o chao) sao alinhados pela imagem do radar (CalibrationFit).
 * Cache nao esta aqui: o radar instalado e o da versao do CS2, diferente do CS:GO que a tabela antiga descrevia.
 */
export class MapCalibration {
  static KNOWN = {
    ancient: { x: -2953, y: 2164, scale: 5.0 },
    anubis: { x: -2796, y: 3328, scale: 5.22 },
    dust2: { x: -2476, y: 3239, scale: 4.4 },
    inferno: { x: -2087, y: 3870, scale: 4.9 },
    mirage: { x: -3230, y: 1713, scale: 5.0 },
    nuke: { x: -3453, y: 2887, scale: 7.0 },
    overpass: { x: -4831, y: 1781, scale: 5.2 },
    train: { x: -2308, y: 2078, scale: 4.082 },
    vertigo: { x: -3168, y: 1762, scale: 4.0 },
    office: { x: -1838, y: 1858, scale: 4.1 },
    italy: { x: -2647, y: 2592, scale: 4.6 },
    baggage: { x: -1316, y: 1288, scale: 2.539062 },
    shoots: { x: -1368, y: 1952, scale: 2.6875 }
  };

  /** Altura (z) abaixo da qual o jogador esta no andar de baixo (mapas de dois andares). */
  static LOWER_LEVEL_MAX_Z = { nuke: -495, vertigo: 11700 };

  static find(slug) {
    return MapCalibration.KNOWN[slug] ?? null;
  }

  static lowerLevelZ(slug) {
    return MapCalibration.LOWER_LEVEL_MAX_Z[slug] ?? null;
  }
}
