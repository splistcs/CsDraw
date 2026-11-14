/** Quem esta cego em cada instante e por quanto tempo ainda (eventos player_blind do round). */
export class BlindState {
  /** `Map<indiceDoJogador, segundosRestantes>`; uma flash nova so vale se acabar depois da anterior. */
  static remaining(blinds, time) {
    const result = new Map();
    for (const blind of blinds ?? []) {
      if (blind.t > time) break; // vem ordenado por tempo
      const left = blind.t + blind.duration - time;
      if (left > 0 && left > (result.get(blind.victim) ?? 0)) result.set(blind.victim, left);
    }
    return result;
  }
}
