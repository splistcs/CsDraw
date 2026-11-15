export class SetposCommand {
  static format({ x, y, z, pitch = 0, yaw = 0 }) {
    const n = SetposCommand.#number;
    return `setpos ${n(x)} ${n(y)} ${n(z)};setang ${n(pitch)} ${n(SetposCommand.#normalizeYaw(yaw))} 0`;
  }

  static #number(value) {
    const rounded = Math.round(Number(value) * 100) / 100;
    return String(Number.isFinite(rounded) && rounded !== 0 ? rounded : 0);
  }

  static #normalizeYaw(yaw) {
    return ((((Number(yaw) || 0) + 180) % 360) + 360) % 360 - 180;
  }
}
