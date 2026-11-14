// Frame: [idx, x, y, yaw, hp, side, z, armor, money, weapon, pitch, granadas+C4, arma principal, capacete (0/1), municao no carregador (-1 = desconhecida)]. Formatos antigos (menos campos) seguem validos.
const toPlayer = ([idx, x, y, yaw, hp, side, z = 0, armor = 0, money = 0, weapon = -1, pitch = 0, nades = 0, mainWeapon = -1, helmet = 0, ammo = -1]) => ({ idx, x, y, z, yaw, pitch, hp, side, armor, money, weapon, nades, mainWeapon, helmet, ammo });

/** Amostra (com interpolacao) as posicoes dos jogadores em um instante t de um round. */
export class FrameInterpolator {
  static sample(frames, t) {
    if (!frames.length) return [];
    const last = frames.length - 1;
    if (t <= frames[0].t) return frames[0].p.map(toPlayer);
    if (t >= frames[last].t) return frames[last].p.map(toPlayer);

    let low = 0;
    let high = last;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (frames[mid].t <= t) low = mid; else high = mid;
    }
    const from = frames[low];
    const to = frames[high];
    const alpha = (t - from.t) / (to.t - from.t);
    const next = new Map(to.p.map((entry) => [entry[0], entry]));

    return from.p.map((entry) => {
      const player = toPlayer(entry);
      const target = next.get(player.idx);
      if (!target) return player;
      return {
        ...player,
        x: player.x + (target[1] - player.x) * alpha,
        y: player.y + (target[2] - player.y) * alpha,
        // O andar so muda "de uma vez" (queda/escada): usa o andar mais proximo no tempo.
        z: alpha < 0.5 ? player.z : (target[6] ?? player.z),
        yaw: FrameInterpolator.#lerpAngle(player.yaw, target[3], alpha),
        pitch: player.pitch + ((target[10] ?? player.pitch) - player.pitch) * alpha,
        // O inventario so muda de uma vez (compra, arremesso): usa o do quadro mais proximo no tempo.
        nades: alpha < 0.5 ? player.nades : (target[11] ?? player.nades),
        mainWeapon: alpha < 0.5 ? player.mainWeapon : (target[12] ?? player.mainWeapon),
        helmet: alpha < 0.5 ? player.helmet : (target[13] ?? player.helmet),
        ammo: alpha < 0.5 ? player.ammo : (target[14] ?? player.ammo)
      };
    });
  }

  static #lerpAngle(a, b, alpha) {
    const diff = ((b - a + 540) % 360) - 180;
    return a + diff * alpha;
  }
}
