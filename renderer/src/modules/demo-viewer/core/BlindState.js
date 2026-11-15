export class BlindState {
  static remaining(blinds, time) {
    const result = new Map();
    for (const blind of blinds ?? []) {
      if (blind.t > time) break;
      const left = blind.t + blind.duration - time;
      if (left > 0 && left > (result.get(blind.victim) ?? 0)) result.set(blind.victim, left);
    }
    return result;
  }
}
