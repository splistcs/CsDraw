/** Monta o comando de console do CS2 que leva o jogador de teste ate a posicao e a mira de um jogador. */
export class SetposCommand {
  static format({ x, y, z, pitch = 0, yaw = 0 }) {
    const n = SetposCommand.#number;
    return `setpos ${n(x)} ${n(y)} ${n(z)};setang ${n(pitch)} ${n(SetposCommand.#normalizeYaw(yaw))} 0`;
  }

  static #number(value) {
    const rounded = Math.round(Number(value) * 100) / 100;
    return String(Number.isFinite(rounded) && rounded !== 0 ? rounded : 0);
  }

  /** Mantem o yaw entre -180 e 180, como o jogo mostra. */
  static #normalizeYaw(yaw) {
    return ((((Number(yaw) || 0) + 180) % 360) + 360) % 360 - 180;
  }
}
