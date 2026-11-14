import { WalkMask } from './WalkMask.js';

const NEIGHBORS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const FIND_FLOOR_CELLS = 4; // a granada pode parar em cima de uma caixa ou na borda: procura chao por perto

/**
 * Espalhamento da smoke e do fogo: celulas alcancadas a partir do ponto da explosao, andando so pelo chao do radar
 * (distancia pelo caminho, nao em linha reta), e os buracos que uma HE abre na smoke. Funcoes puras.
 */
export class SpreadField {
  /**
   * `cells`: `[{ x, y, d }]` com o centro de cada celula em pixels do radar do andar e `d` de 0 (centro) a 1 (borda),
   * ordenadas por `d`. Sem mascara (ou sem chao no ponto), preenche o circulo inteiro.
   */
  static compute(mask, px, py, radius) {
    if (!mask) return SpreadField.#disk(px, py, radius, WalkMask.CELL);
    const step = mask.cell;
    const start = SpreadField.#start(mask, px, py, step);
    if (!start) return SpreadField.#disk(px, py, radius, step);
    const reach = Math.ceil(radius / step);
    const best = new Map([[start.key, 0]]);
    const queue = [{ cx: start.cx, cy: start.cy, cost: 0 }];
    const cells = [];
    while (queue.length) {
      let low = 0;
      for (let index = 1; index < queue.length; index += 1) if (queue[index].cost < queue[low].cost) low = index;
      const node = queue.splice(low, 1)[0];
      if (node.cost > (best.get(SpreadField.#key(node.cx, node.cy)) ?? Infinity)) continue;
      cells.push({ x: node.cx * step + step / 2, y: node.cy * step + step / 2, d: Math.min(1, (node.cost * step) / radius) });
      for (const [dx, dy, weight] of NEIGHBORS) {
        const nx = node.cx + dx;
        const ny = node.cy + dy;
        const cost = node.cost + weight;
        if (cost * step > radius || Math.abs(nx - start.cx) > reach || Math.abs(ny - start.cy) > reach) continue;
        if (!SpreadField.#floorCell(mask, nx, ny)) continue;
        const key = SpreadField.#key(nx, ny);
        if (cost < (best.get(key) ?? Infinity)) { best.set(key, cost); queue.push({ cx: nx, cy: ny, cost }); }
      }
    }
    return cells.sort((a, b) => a.d - b.d);
  }

  /**
   * Buracos que HEs abrem numa smoke: uma HE que explode enquanto a smoke esta ativa e perto dela. O buraco abre
   * rapido e fecha aos poucos. Devolve `[{ t, x, y }]` (tempo e posicao em unidades do jogo).
   */
  static holes(smoke, grenades, { life, smokeUnits, holeUnits }) {
    return (grenades ?? [])
      .filter((g) => g.type === 'he' && g.t >= smoke.t && g.t <= smoke.t + life && Math.hypot(g.x - smoke.x, g.y - smoke.y) <= smokeUnits + holeUnits * 0.6)
      .map((g) => ({ t: g.t, x: g.x, y: g.y }));
  }

  /** Raio do buraco (0 a 1 do maximo) `age` segundos depois da HE: abre em `open` s e fecha em `close` s. */
  static holeSize(age, { open = 0.2, close = 4.5 } = {}) {
    if (age < 0 || age > open + close) return 0;
    if (age < open) return age / open;
    return 1 - (age - open) / close;
  }

  static #start(mask, px, py, step) {
    const cx = Math.floor(px / step);
    const cy = Math.floor(py / step);
    if (SpreadField.#floorCell(mask, cx, cy)) return { cx, cy, key: SpreadField.#key(cx, cy) };
    for (let ring = 1; ring <= FIND_FLOOR_CELLS; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (SpreadField.#floorCell(mask, cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy, key: SpreadField.#key(cx + dx, cy + dy) };
        }
      }
    }
    return null;
  }

  static #disk(px, py, radius, step) {
    const reach = Math.ceil(radius / step);
    const cells = [];
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const distance = Math.hypot(dx, dy) * step;
        if (distance <= radius) cells.push({ x: px + dx * step, y: py + dy * step, d: distance / radius });
      }
    }
    return cells.sort((a, b) => a.d - b.d);
  }

  static #floorCell(mask, cx, cy) {
    return cx >= 0 && cy >= 0 && cx < mask.size && cy < mask.size && mask.cells[cy * mask.size + cx] === 1;
  }

  static #key(cx, cy) {
    return cy * 4096 + cx;
  }
}
