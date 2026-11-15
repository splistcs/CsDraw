import { WalkMask } from './WalkMask.js';

const COARSE = { scales: [-0.12, 0.12, 0.02], shift: [-48, 48, 6] };
const FINE = { scaleStep: 0.005, shift: 6 };

export class CalibrationFit {
  static MAX_POINTS = 1500;

  static samples(demo) {
    const all = [];
    for (const round of demo.rounds ?? []) {
      for (const frame of round.frames ?? []) {
        for (const entry of frame.p) if (entry[4] > 0) all.push({ x: entry[1], y: entry[2], z: entry[6] ?? 0 });
      }
    }
    const step = Math.max(1, Math.ceil(all.length / CalibrationFit.MAX_POINTS));
    return all.filter((_, index) => index % step === 0);
  }

  static score(mask, points, calibration) {
    if (!mask || !points.length) return 0;
    return CalibrationFit.#hits(CalibrationFit.#dilated(mask), points, mask, (X, Y) => [(X - calibration.x) / calibration.scale, (calibration.y - Y) / calibration.scale]) / points.length;
  }

  static fit(mask, points) {
    if (!mask || points.length < 20) return null;
    const box = CalibrationFit.#floorBox(mask);
    const bounds = CalibrationFit.#bounds(points);
    if (!box || bounds.width < 1 || bounds.height < 1) return null;
    const dilated = CalibrationFit.#dilated(mask);
    const base = Math.max(bounds.width / box.width, bounds.height / box.height);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const imageX = (box.x0 + box.x1) / 2;
    const imageY = (box.y0 + box.y1) / 2;
    const evaluate = (multiplier, ox, oy) => {
      const scale = base * multiplier;
      const hits = CalibrationFit.#hits(dilated, points, mask, (X, Y) => [imageX + ox + (X - centerX) / scale, imageY + oy - (Y - centerY) / scale]);
      return hits / points.length - 1e-4 * ((Math.abs(ox) + Math.abs(oy)) / 48 + Math.abs(multiplier - 1));
    };
    let best = { multiplier: 1, ox: 0, oy: 0, score: evaluate(1, 0, 0) };
    const consider = (multiplier, ox, oy) => {
      const score = evaluate(multiplier, ox, oy);
      if (score > best.score) best = { multiplier, ox, oy, score };
    };
    const [sMin, sMax, sStep] = COARSE.scales;
    const [oMin, oMax, oStep] = COARSE.shift;
    for (let m = sMin; m <= sMax + 1e-9; m += sStep) for (let oy = oMin; oy <= oMax; oy += oStep) for (let ox = oMin; ox <= oMax; ox += oStep) consider(1 + m, ox, oy);
    const around = { ...best };
    for (let m = around.multiplier - sStep; m <= around.multiplier + sStep + 1e-9; m += FINE.scaleStep) {
      for (let oy = around.oy - FINE.shift; oy <= around.oy + FINE.shift; oy += 1) for (let ox = around.ox - FINE.shift; ox <= around.ox + FINE.shift; ox += 1) consider(m, ox, oy);
    }
    const scale = base * best.multiplier;
    const px = imageX + best.ox;
    const py = imageY + best.oy;
    return { x: centerX - px * scale, y: centerY + py * scale, scale, approximate: true, score: CalibrationFit.score(mask, points, { x: centerX - px * scale, y: centerY + py * scale, scale }) };
  }

  static lowerLevelZ(points) {
    const values = points.map((point) => point.z).filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length < 50) return null;
    const total = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    let below = 0;
    let belowSum = 0;
    let best = null;
    for (let index = 0; index < total - 1; index += 1) {
      below += 1;
      belowSum += values[index];
      if (values[index + 1] - values[index] < 1) continue;
      const meanLow = belowSum / below;
      const meanHigh = (sum - belowSum) / (total - below);
      const variance = below * (total - below) * (meanLow - meanHigh) ** 2;
      if (!best || variance > best.variance) best = { variance, cut: (values[index] + values[index + 1]) / 2, meanLow, meanHigh, share: below / total };
    }
    if (!best || best.meanHigh - best.meanLow < 150 || best.share < 0.04 || best.share > 0.96) return null;
    return Math.round(best.cut);
  }

  static #bounds(points) {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const { x, y } of points) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
    return { ...b, width: b.maxX - b.minX, height: b.maxY - b.minY };
  }

  static #floorBox(mask) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (let cy = 0; cy < mask.size; cy += 1) {
      for (let cx = 0; cx < mask.size; cx += 1) {
        if (!mask.cells[cy * mask.size + cx]) continue;
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx + 1); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy + 1);
      }
    }
    return Number.isFinite(x0) ? { x0: x0 * mask.cell, x1: x1 * mask.cell, y0: y0 * mask.cell, y1: y1 * mask.cell, width: (x1 - x0) * mask.cell, height: (y1 - y0) * mask.cell } : null;
  }

  static #dilated(mask) {
    const { size, cells } = mask;
    const out = new Uint8Array(size * size);
    for (let cy = 0; cy < size; cy += 1) {
      for (let cx = 0; cx < size; cx += 1) {
        if (!cells[cy * size + cx]) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          const y = cy + dy;
          if (y < 0 || y >= size) continue;
          for (let dx = -2; dx <= 2; dx += 1) {
            const x = cx + dx;
            if (x >= 0 && x < size) out[y * size + x] = 1;
          }
        }
      }
    }
    return out;
  }

  static #hits(dilated, points, mask, toPixel) {
    let hits = 0;
    for (const { x, y } of points) {
      const [px, py] = toPixel(x, y);
      if (WalkMask.isFloor({ size: mask.size, cells: dilated, cell: mask.cell }, px, py)) hits += 1;
    }
    return hits;
  }
}
