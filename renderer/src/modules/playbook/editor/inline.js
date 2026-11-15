const ZWSP = '​';
const ESCAPABLE = '\\*_~`[]()#>-+.!|<';
const SAFE_URL = /^(https?:|mailto:)/i;

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isWord = (char) => Boolean(char) && /[\p{L}\p{N}]/u.test(char);

export const InlineMarkdown = {
  ZWSP,

  isSafeUrl: (url) => SAFE_URL.test(String(url ?? '').trim()),

  toHtml(markdown) {
    return renderInline(String(markdown ?? ''));
  },

  toPlain(markdown) {
    return renderInline(String(markdown ?? ''))
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  },

  fromDom(node) {
    return serializeChildren(node).replace(/​/g, '');
  },

  protectLine(markdown) {
    let line = String(markdown ?? '');
    if (/^https?:\/\/\S+$/.test(line)) return `<${line}>`;
    if (/^(#{1,6}\s|[-+]\s|[-+]$|>|---|___|```|\||!\[|\[[ xX]\]\s|<)/.test(line)) return `\\${line}`;
    const ordered = /^(\d+)([.)])(\s|$)/.exec(line);
    if (ordered) line = `${ordered[1]}\\${line.slice(ordered[1].length)}`;
    return line;
  }
};

function renderInline(source) {
  let html = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const char = source[i];
    if (char === '\\' && i + 1 < n && ESCAPABLE.includes(source[i + 1])) {
      html += escapeHtml(source[i + 1]);
      i += 2;
      continue;
    }
    if (char === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i + 1) { html += `<code>${escapeHtml(source.slice(i + 1, end))}</code>`; i = end + 1; continue; }
    }
    if (source.startsWith('**', i)) {
      const end = findClose(source, '**', i + 2);
      if (end > i + 2) { html += `<b>${renderInline(source.slice(i + 2, end))}</b>`; i = end + 2; continue; }
    }
    if (source.startsWith('~~', i)) {
      const end = findClose(source, '~~', i + 2);
      if (end > i + 2) { html += `<s>${renderInline(source.slice(i + 2, end))}</s>`; i = end + 2; continue; }
    }
    if (char === '*' && source[i + 1] !== '*') {
      const end = findClose(source, '*', i + 1);
      if (end > i + 1) { html += `<i>${renderInline(source.slice(i + 1, end))}</i>`; i = end + 1; continue; }
    }
    if (char === '_' && !isWord(source[i - 1]) && source[i + 1] !== '_') {
      let end = findClose(source, '_', i + 1);
      while (end > 0 && isWord(source[end + 1])) end = findClose(source, '_', end + 1);
      if (end > i + 1) { html += `<i>${renderInline(source.slice(i + 1, end))}</i>`; i = end + 1; continue; }
    }
    if (char === '[') {
      const link = readLink(source, i);
      if (link) {
        html += InlineMarkdown.isSafeUrl(link.url)
          ? `<a href="${escapeHtml(link.url)}">${renderInline(link.text)}</a>`
          : renderInline(link.text);
        i = link.end;
        continue;
      }
    }
    html += escapeHtml(char);
    i += 1;
  }
  return html;
}

function findClose(source, mark, from) {
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue; }
    if (source[i] === '`') { const end = source.indexOf('`', i + 1); if (end > 0) i = end; continue; }
    if (source.startsWith(mark, i)) {
      if (mark === '*' && source[i + 1] === '*') { i += 1; continue; }
      if (mark === '**' && source[i + 2] === '*') return i + 1;
      return i;
    }
  }
  return -1;
}

function readLink(source, start) {
  let depth = 0;
  let close = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue; }
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  if (close < 0 || source[close + 1] !== '(') return null;
  let urlEnd = -1;
  for (let i = close + 2, open = 1; i < source.length; i += 1) {
    if (source[i] === '(') open += 1;
    else if (source[i] === ')') { open -= 1; if (open === 0) { urlEnd = i; break; } }
  }
  if (urlEnd < 0) return null;
  return { text: source.slice(start + 1, close), url: source.slice(close + 2, urlEnd).trim(), end: urlEnd + 1 };
}

function escapeText(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if ('\\*`~[]'.includes(char)) out += `\\${char}`;
    else if (char === '_' && (!isWord(text[i - 1]) || !isWord(text[i + 1]))) out += '\\_';
    else out += char;
  }
  return out;
}

function wrap(inner, mark) {
  if (!inner.trim()) return inner;
  const lead = inner.match(/^\s*/)[0];
  const trail = inner.match(/\s*$/)[0];
  return `${lead}${mark}${inner.trim()}${mark}${trail}`;
}

function serializeChildren(node) {
  let out = '';
  node.childNodes.forEach((child) => { out += serializeNode(child); });
  return out;
}

function serializeNode(node) {
  if (node.nodeType === 3) return escapeText(node.textContent.replace(/ /g, ' ').replace(/\n/g, ' '));
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '';
  const style = node.style ?? {};
  const bold = tag === 'B' || tag === 'STRONG' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600;
  const italic = tag === 'I' || tag === 'EM' || style.fontStyle === 'italic';
  const strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(style.textDecoration ?? '');
  if (tag === 'CODE') {
    const text = node.textContent.replace(/​/g, '').replace(/`/g, "'").replace(/\n/g, ' ');
    return text.trim() ? `\`${text}\`` : text;
  }
  if (tag === 'A') {
    const href = node.getAttribute('href') ?? '';
    const inner = serializeChildren(node);
    return InlineMarkdown.isSafeUrl(href) && inner.trim() ? `[${inner}](${href})` : inner;
  }
  let inner = serializeChildren(node);
  if (strike) inner = wrap(inner, '~~');
  if (italic) inner = wrap(inner, '*');
  if (bold) inner = wrap(inner, '**');
  return inner;
}
