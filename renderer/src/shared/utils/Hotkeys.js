/**
 * Atalhos globais. O handler recebe o KeyboardEvent e devolve true quando tratou a tecla
 * (a classe entao cancela o comportamento padrao). Ignora campos de texto e dialogos abertos.
 */
export class Hotkeys {
  #handler;
  #allowRange;

  constructor(handler, { allowRange = false } = {}) {
    this.#handler = handler;
    this.#allowRange = allowRange;
  }

  attach() { window.addEventListener('keydown', this.#onKeyDown); }
  detach() { window.removeEventListener('keydown', this.#onKeyDown); }

  #onKeyDown = (event) => {
    if (event.defaultPrevented || Hotkeys.#shouldIgnore(event.target, this.#allowRange)) return;
    if (!this.#handler(event)) return;
    event.preventDefault();
    const active = document.activeElement;
    if (active instanceof HTMLElement && ['BUTTON', 'A'].includes(active.tagName)) active.blur();
  };

  static #shouldIgnore(target, allowRange) {
    if (document.querySelector('[role="dialog"]')) return true;
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
    if (target.tagName === 'INPUT') return !(allowRange && (target.type === 'range' || target.type === 'checkbox'));
    return false;
  }
}
