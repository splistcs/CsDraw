import { MapCalibration } from './MapCalibration.js';

/** Converte coordenadas do jogo (x, y, z) em coordenadas do "mundo" do layout (1024 por andar). */
export class RadarProjection {
  static SIZE = 1024;

  #project;
  #slug;
  #lowerZ;
  layout;
  unitsPerPixel;
  isCalibrated;
  isApproximate = false;

  /**
   * `calibration` (`{ x, y, scale }`) sobrepoe a tabela de MapCalibration (calibracao aproximada pela imagem);
   * `lowerZ` e a altura que separa os andares quando a tabela nao a conhece (estimada pelas posicoes da demo).
   */
  constructor({ slug, bounds, layout, autoFit = false, calibration = null, lowerZ = null }) {
    this.#slug = slug;
    this.#lowerZ = lowerZ;
    this.layout = layout;
    const known = autoFit ? null : (calibration ?? MapCalibration.find(slug));
    if (known) {
      this.isCalibrated = true;
      this.isApproximate = Boolean(calibration?.approximate);
      this.unitsPerPixel = known.scale;
      this.#project = (x, y) => [(x - known.x) / known.scale, (known.y - y) / known.scale];
    } else {
      // Ajuste automatico: enquadra todas as posicoes observadas no demo.
      const b = bounds ?? { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
      const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) * 1.12;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      this.isCalibrated = false;
      this.unitsPerPixel = span / RadarProjection.SIZE;
      this.#project = (x, y) => [RadarProjection.SIZE / 2 + (x - cx) / this.unitsPerPixel, RadarProjection.SIZE / 2 - (y - cy) / this.unitsPerPixel];
    }
  }

  /** 0 = andar de cima, 1 = andar de baixo (so em mapas calibrados com dois andares). */
  levelOf(z = 0) {
    if (!this.isCalibrated || this.layout.levels.length < 2) return 0;
    const cutoff = MapCalibration.lowerLevelZ(this.#slug) ?? this.#lowerZ;
    return cutoff !== null && z < cutoff ? 1 : 0;
  }

  project(x, y, z = 0) {
    const [px, py] = this.#project(x, y);
    return [px + (this.layout.levels[this.levelOf(z)]?.offsetX ?? 0), py];
  }

  /** Converte uma distancia em unidades do jogo para unidades do mundo. */
  radius(units) {
    return units / this.unitsPerPixel;
  }
}
