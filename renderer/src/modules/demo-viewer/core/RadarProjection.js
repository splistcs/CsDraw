import { MapCalibration } from './MapCalibration.js';

export class RadarProjection {
  static SIZE = 1024;

  #project;
  #slug;
  #lowerZ;
  layout;
  unitsPerPixel;
  isCalibrated;
  isApproximate = false;

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
      const b = bounds ?? { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
      const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) * 1.12;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      this.isCalibrated = false;
      this.unitsPerPixel = span / RadarProjection.SIZE;
      this.#project = (x, y) => [RadarProjection.SIZE / 2 + (x - cx) / this.unitsPerPixel, RadarProjection.SIZE / 2 - (y - cy) / this.unitsPerPixel];
    }
  }

  levelOf(z = 0) {
    if (!this.isCalibrated || this.layout.levels.length < 2) return 0;
    const cutoff = MapCalibration.lowerLevelZ(this.#slug) ?? this.#lowerZ;
    return cutoff !== null && z < cutoff ? 1 : 0;
  }

  project(x, y, z = 0) {
    const [px, py] = this.#project(x, y);
    return [px + (this.layout.levels[this.levelOf(z)]?.offsetX ?? 0), py];
  }

  radius(units) {
    return units / this.unitsPerPixel;
  }
}
