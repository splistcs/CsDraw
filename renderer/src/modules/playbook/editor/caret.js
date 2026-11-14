import { InlineMarkdown } from './inline.js';

/** Utilidades de cursor/selecao para os blocos (contentEditable). */
export const Caret = {
  /** Coloca o cursor em 'start', 'end' ou depois de `pos` caracteres de texto. */
  place(el, pos = 'end') {
    const selection = window.getSelection();
    const range = document.createRange();
    if (typeof pos === 'number') {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let remaining = pos;
      let node = walker.nextNode();
      while (node) {
        if (remaining <= node.data.length) { range.setStart(node, remaining); range.collapse(true); break; }
        remaining -= node.data.length;
        node = walker.nextNode();
      }
      if (!node) { range.selectNodeContents(el); range.collapse(false); }
    } else {
      range.selectNodeContents(el);
      range.collapse(pos === 'start');
    }
    selection.removeAllRanges();
    selection.addRange(range);
  },

  /** Selecao recolhida dentro de `el`? */
  inside(el) {
    const selection = window.getSelection();
    return Boolean(selection?.rangeCount) && el.contains(selection.anchorNode);
  },

  isCollapsed: () => window.getSelection()?.isCollapsed ?? true,

  /** Cursor no comeco do texto do bloco (sem selecao)? */
  atStart(el) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed || !el.contains(selection.anchorNode)) return false;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().replace(/​/g, '') === '';
  },

  atEnd(el) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed || !el.contains(selection.anchorNode)) return false;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setStart(selection.anchorNode, selection.anchorOffset);
    return range.toString().replace(/​/g, '') === '';
  },

  /** O cursor esta na primeira/ultima linha visual do bloco? (para ↑ e ↓ passarem ao bloco vizinho) */
  onEdgeLine(el, edge) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0).cloneRange();
    let rect = range.getClientRects()[0];
    if (!rect) {
      if (range.startContainer.nodeType === 1 && range.startContainer.childNodes[range.startOffset]) {
        rect = range.startContainer.childNodes[range.startOffset].getBoundingClientRect?.();
      }
      if (!rect || (!rect.height && !rect.width)) return true; // bloco vazio
    }
    const box = el.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || rect.height || 20;
    return edge === 'top' ? rect.top - box.top < lineHeight * 0.9 : box.bottom - rect.bottom < lineHeight * 0.9;
  },

  /** Posicao (x,y) do cursor na tela, para ancorar o menu de blocos. */
  rect(fallbackEl) {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (rect && (rect.width || rect.height || rect.top)) return rect;
    }
    return fallbackEl.getBoundingClientRect();
  },

  /** Markdown inline antes e depois do cursor (apaga a selecao, se houver). */
  split(el) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.selectNodeContents(el);
    after.setStart(range.endContainer, range.endOffset);
    return { before: InlineMarkdown.fromDom(before.cloneContents()), after: InlineMarkdown.fromDom(after.cloneContents()) };
  },

  /** Numero de caracteres visiveis de um texto em Markdown inline. */
  plainLength(markdown) {
    const box = document.createElement('div');
    box.innerHTML = InlineMarkdown.toHtml(markdown);
    return box.textContent.length;
  },

  /** Texto puro do bloco antes do cursor. */
  textBefore(el) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !el.contains(selection.anchorNode)) return '';
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().replace(/​/g, '');
  },

  /**
   * Converte `**x**`, `*x*`, `~~x~~` e `x` entre crases recem-digitados em formatacao.
   * Devolve true se mexeu no DOM.
   */
  applyInlineShortcut(el) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const node = selection.anchorNode;
    if (!node || node.nodeType !== 3 || !el.contains(node)) return false;
    if (node.parentElement?.closest('code')) return false;
    const offset = selection.anchorOffset;
    const before = node.data.slice(0, offset);
    const rules = [
      { re: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, tag: 'b', open: 2 },
      { re: /~~([^~\s](?:[^~]*[^~\s])?)~~$/, tag: 's', open: 2 },
      { re: /(?:^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, tag: 'i', open: 1 },
      { re: /`([^`]+)`$/, tag: 'code', open: 1 }
    ];
    for (const rule of rules) {
      const match = rule.re.exec(before);
      if (!match) continue;
      const full = match[0].startsWith('*') || match[0].startsWith('~') || match[0].startsWith('`') ? match[0] : match[0].slice(1);
      const start = before.length - full.length;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, offset);
      range.deleteContents();
      const wrapper = document.createElement(rule.tag);
      wrapper.textContent = match[1];
      range.insertNode(wrapper);
      const tail = document.createTextNode(InlineMarkdown.ZWSP);
      wrapper.after(tail);
      const caret = document.createRange();
      caret.setStart(tail, 1);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      return true;
    }
    return false;
  }
};
