/**
 * Onde um item largado para. O demo NAO traz a posicao do item no chao: so se sabe, com exatidao, o instante e o
 * lugar em que ele saiu do jogador (item_remove / player_death). O ponto de repouso e estimado aqui e, quando alguem
 * pega o item, e corrigido pelo lugar de quem pegou (DropTracker). Funcoes puras, sem dependencias.
 *
 * Unidades do jogo; angulos em graus no padrao Source (pitch positivo = olhando para baixo).
 */
export class DropPhysics {
  static GRAVITY = 800; // sv_gravity
  static EYE_HEIGHT = 64; // de onde o item sai quando o jogador o larga em pe
  static THROW_SPEED = 200; // velocidade com que largar de proposito arremessa o item para a frente
  static ROLL_SECONDS = 0.3; // depois de tocar o chao o item ainda rola por um instante
  static MAX_THROW = 330; // nenhum drop de proposito anda mais que isso
  static SLIDE_SECONDS = 0.5; // quem morre em movimento leva o item junto por um tempo
  static SLIDE_MAX = 120;
  static DEATH_FALL_SECONDS = 0.6;
  static MIN_SHIFT = 6; // deslocamento menor que isso e ruido: o item fica onde saiu
  static MAX_SPEED = 450; // velocidade maior que isso e teleporte (troca de round, respawn), nao movimento

  /**
   * Item largado de proposito: sai da altura dos olhos, na direcao do olhar, com a velocidade do jogador somada;
   * cai ate o chao (olhar para baixo encurta, para cima alonga) e rola um pouco.
   * `{ x, y, vx, vy, yaw, pitch }` -> `{ x, y, fall }` (onde para e em quantos segundos) ou null se nao anda.
   */
  static thrown({ x, y, vx = 0, vy = 0, yaw, pitch = 0 }) {
    if (!Number.isFinite(yaw) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const p = (Math.max(-89, Math.min(89, Number(pitch) || 0)) * Math.PI) / 180;
    const a = (yaw * Math.PI) / 180;
    const horizontal = Math.cos(p) * DropPhysics.THROW_SPEED;
    const vertical = -Math.sin(p) * DropPhysics.THROW_SPEED;
    const flight = (vertical + Math.sqrt(vertical * vertical + 2 * DropPhysics.GRAVITY * DropPhysics.EYE_HEIGHT)) / DropPhysics.GRAVITY;
    const speedX = Math.cos(a) * horizontal;
    const speedY = Math.sin(a) * horizontal;
    const move = DropPhysics.#clamp(
      (speedX + vx) * flight + speedX * DropPhysics.ROLL_SECONDS,
      (speedY + vy) * flight + speedY * DropPhysics.ROLL_SECONDS
    );
    return DropPhysics.#result(x, y, move, flight + DropPhysics.ROLL_SECONDS);
  }

  /** Item solto na morte: cai com a velocidade que o jogador tinha e desliza um pouco nessa direcao. */
  static died({ x, y, vx = 0, vy = 0 }) {
    const speed = Math.hypot(vx, vy);
    if (!(speed > 1) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = Math.min(DropPhysics.SLIDE_MAX, speed * DropPhysics.SLIDE_SECONDS);
    return DropPhysics.#result(x, y, { dx: (vx / speed) * distance, dy: (vy / speed) * distance }, DropPhysics.DEATH_FALL_SECONDS);
  }

  /** Velocidade horizontal (unidades/s) entre duas posicoes; teleporte vira zero. */
  static velocity(from, to, seconds) {
    if (!(seconds > 0)) return { vx: 0, vy: 0 };
    const vx = (to.x - from.x) / seconds;
    const vy = (to.y - from.y) / seconds;
    return Math.hypot(vx, vy) > DropPhysics.MAX_SPEED ? { vx: 0, vy: 0 } : { vx, vy };
  }

  static #clamp(dx, dy) {
    const length = Math.hypot(dx, dy);
    const scale = length > DropPhysics.MAX_THROW ? DropPhysics.MAX_THROW / length : 1;
    return { dx: dx * scale, dy: dy * scale };
  }

  static #result(x, y, { dx, dy }, fall) {
    if (Math.hypot(dx, dy) < DropPhysics.MIN_SHIFT) return null;
    return { x: x + dx, y: y + dy, fall: Math.round(fall * 100) / 100 };
  }
}
