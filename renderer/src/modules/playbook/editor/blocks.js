import { EmbedTokens } from '../../../shared/markdown/EmbedTokens.js';
import { InlineMarkdown } from './inline.js';

/**
 * Modelo de blocos do editor do playbook. O arquivo salvo continua sendo Markdown puro:
 * `Blocks.parse` le o Markdown em blocos e `Blocks.serialize` escreve de volta.
 */

const LIST_TYPES = new Set(['bullet', 'number', 'todo']);
const TEXT_TYPES = new Set(['text', 'h1', 'h2', 'h3', 'h4', 'bullet', 'number', 'todo', 'quote']);
const VOID_TYPES = new Set(['divider', 'drawing', 'media', 'link', 'raw']);
const MAX_INDENT = 3;

let counter = 0;
const newId = () => { counter += 1; return `b${Date.now().toString(36)}${counter}`; };

const URL_LINE = /^https?:\/\/\S+$/;
const EMBED_LINE = /^!\[([^\]]*)\]\(csdraw-(drawing|media):([A-Za-z0-9_-]{1,64})\)\s*$/;
const FENCE = /^\s{0,3}(`{3,})\s*([^`\s]*)\s*$/;

function toMarkdown(block) {
  const pad = '  '.repeat(block.indent ?? 0);
  const text = block.text ?? '';
  switch (block.type) {
    case 'text': return text.trim() ? InlineMarkdown.protectLine(text) : null;
    case 'h1': case 'h2': case 'h3': case 'h4': return `${'#'.repeat(Number(block.type[1]))} ${text}`.trimEnd();
    case 'bullet': return `${pad}- ${text}`.trimEnd();
    case 'number': return `${pad}1. ${text}`.trimEnd();
    case 'todo': return `${pad}- [${block.checked ? 'x' : ' '}] ${text}`.trimEnd();
    case 'quote': return `> ${text}`.trimEnd();
    case 'code': {
      const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = '`'.repeat(longest + 1);
      return `${fence}${block.lang ?? ''}\n${text}\n${fence}`;
    }
    case 'divider': return '---';
    case 'drawing': return EmbedTokens.drawing(block.refId, block.name);
    case 'media': return EmbedTokens.media(block.refId, block.name);
    case 'link': return block.url;
    case 'raw': return text;
    default: return null;
  }
}

export const Blocks = {
  LIST_TYPES, TEXT_TYPES, VOID_TYPES, MAX_INDENT,

  isList: (type) => LIST_TYPES.has(type),
  isTextual: (type) => TEXT_TYPES.has(type),
  isVoid: (type) => VOID_TYPES.has(type),

  create(type = 'text', props = {}) {
    return { id: newId(), type, text: '', indent: 0, checked: false, lang: '', ...props };
  },

  /** Markdown -> lista de blocos (sempre devolve ao menos um bloco de texto vazio). */
  parse(markdown) {
    const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let widths = []; // larguras de recuo das listas, para achar o nivel de cada item
    const add = (type, props) => { blocks.push(Blocks.create(type, props)); };
    const levelFor = (rawIndent) => {
      const width = rawIndent.replace(/\t/g, '    ').length;
      while (widths.length && widths[widths.length - 1] > width) widths.pop();
      if (!widths.length || widths[widths.length - 1] < width) widths.push(width);
      return Math.min(MAX_INDENT, widths.length - 1);
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.trim()) { widths = []; continue; }

      const fence = FENCE.exec(line);
      if (fence) {
        const body = [];
        for (i += 1; i < lines.length; i += 1) {
          const closing = /^\s{0,3}(`{3,})\s*$/.exec(lines[i]);
          if (closing && closing[1].length >= fence[1].length) break;
          body.push(lines[i]);
        }
        widths = [];
        add('code', { text: body.join('\n'), lang: fence[2] });
        continue;
      }

      if (line.trim().startsWith('|')) {
        const rows = [line];
        while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) { i += 1; rows.push(lines[i]); }
        widths = [];
        add('raw', { text: rows.join('\n') });
        continue;
      }

      const heading = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
      if (heading) { widths = []; add(`h${Math.min(4, heading[1].length)}`, { text: heading[2] }); continue; }

      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { widths = []; add('divider'); continue; }

      const todo = /^(\s*)[-*+]\s+\[([ xX])\](?:\s+(.*))?$/.exec(line);
      if (todo) { add('todo', { text: todo[3] ?? '', checked: todo[2] !== ' ', indent: levelFor(todo[1]) }); continue; }
      const bullet = /^(\s*)[-*+](?:\s+(.*))?$/.exec(line);
      if (bullet) { add('bullet', { text: bullet[2] ?? '', indent: levelFor(bullet[1]) }); continue; }
      const number = /^(\s*)\d{1,9}[.)](?:\s+(.*))?$/.exec(line);
      if (number) { add('number', { text: number[2] ?? '', indent: levelFor(number[1]) }); continue; }

      widths = [];
      const quote = /^\s{0,3}>\s?(.*)$/.exec(line);
      if (quote) {
        if (!quote[1].trim() && blocks.at(-1)?.type === 'quote') continue; // `>` solto entre duas citacoes
        add('quote', { text: quote[1] });
        continue;
      }

      const embed = EMBED_LINE.exec(line.trim());
      if (embed) { add(embed[2], { name: embed[1], refId: embed[3] }); continue; }

      const trimmed = line.trim();
      if (URL_LINE.test(trimmed)) { add('link', { url: trimmed }); continue; }
      const autolink = /^<(https?:\/\/[^\s>]+)>$/.exec(trimmed);
      if (autolink) { add('text', { text: autolink[1] }); continue; }

      if (/^\s*</.test(line) && !/^\s*<(https?|mailto):/.test(line)) { add('raw', { text: line }); continue; }

      add('text', { text: trimmed });
    }
    if (!blocks.length) add('text');
    return blocks;
  },

  /** Blocos -> Markdown. Blocos de texto vazios nao sao gravados. */
  serialize(blocks) {
    const parts = [];
    let previous = null;
    for (const block of blocks) {
      const md = toMarkdown(block);
      if (md === null) continue;
      if (previous) {
        const family = (type) => (type === 'number' ? 'n' : 'b'); // marcadores e tarefas formam a mesma lista
        const bothList = Blocks.isList(previous.type) && Blocks.isList(block.type);
        const bothQuote = previous.type === 'quote' && block.type === 'quote';
        let separator = '\n\n';
        if (bothList && family(previous.type) === family(block.type)) separator = '\n';
        else if (bothQuote) separator = '\n>\n';
        parts.push(separator);
      }
      parts.push(md);
      previous = block;
    }
    return parts.length ? `${parts.join('')}\n` : '';
  },

  /** Numero exibido de cada item de lista numerada (reinicia quando a sequencia e interrompida). */
  numbering(blocks) {
    const counters = [];
    return blocks.map((block) => {
      if (block.type !== 'number') {
        if (!Blocks.isList(block.type)) counters.length = 0;
        else counters.length = Math.min(counters.length, (block.indent ?? 0) + 1);
        return null;
      }
      const level = block.indent ?? 0;
      counters.length = level + 1;
      counters[level] = (counters[level] ?? 0) + 1;
      return counters[level];
    });
  },

  /** Indices do bloco e dos seguintes mais recuados (filhos de uma lista), que andam junto ao arrastar. */
  family(blocks, index) {
    const head = blocks[index];
    let end = index + 1;
    if (Blocks.isList(head.type)) {
      while (end < blocks.length && Blocks.isList(blocks[end].type) && blocks[end].indent > head.indent) end += 1;
    }
    return [index, end];
  },

  /** Atalho de Markdown digitado no inicio do bloco ("# ", "- ", "1. ", "[] ", "> "). */
  shortcut(text) {
    const map = { '#': 'h1', '##': 'h2', '###': 'h3', '####': 'h4', '-': 'bullet', '*': 'bullet', '+': 'bullet', '1.': 'number', '[]': 'todo', '[ ]': 'todo', '>': 'quote', '"': 'quote' };
    if (text in map) return map[text];
    return /^\d+[.)]$/.test(text) ? 'number' : null;
  },

  isUrl: (text) => URL_LINE.test(String(text ?? '').trim()),

  hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }
};

/** Definicao do menu de blocos (ordem e secoes como no Notion). Os rotulos vem do i18n (`editor.block.<id>`). */
export const BLOCK_MENU = [
  { id: 'text', section: 'basic', type: 'text', icon: 'T', hint: '' },
  { id: 'h1', section: 'basic', type: 'h1', icon: 'H1', hint: '#' },
  { id: 'h2', section: 'basic', type: 'h2', icon: 'H2', hint: '##' },
  { id: 'h3', section: 'basic', type: 'h3', icon: 'H3', hint: '###' },
  { id: 'h4', section: 'basic', type: 'h4', icon: 'H4', hint: '####' },
  { id: 'bullet', section: 'basic', type: 'bullet', icon: '•', hint: '-' },
  { id: 'number', section: 'basic', type: 'number', icon: '1.', hint: '1.' },
  { id: 'todo', section: 'basic', type: 'todo', icon: '☑', hint: '[]' },
  { id: 'quote', section: 'basic', type: 'quote', icon: '❝', hint: '>' },
  { id: 'code', section: 'basic', type: 'code', icon: '</>', hint: '```' },
  { id: 'divider', section: 'basic', type: 'divider', icon: '—', hint: '---' },
  { id: 'drawing', section: 'media', type: 'drawing', icon: '🗺', hint: '' },
  { id: 'media', section: 'media', type: 'media', icon: '🖼', hint: '' },
  { id: 'link', section: 'media', type: 'link', icon: '🔗', hint: '' }
];

/** Itens que podem virar o bloco atual (sem os que precisam de dados extras). */
export const TURN_INTO = BLOCK_MENU.filter((item) => item.section === 'basic' && item.type !== 'divider');
