/** Tokens usados no Markdown para colar desenhos e midias do cofre: ![nome](csdraw-drawing:ID). */
export class EmbedTokens {
  static PATTERN = /^csdraw-(drawing|media):([A-Za-z0-9_-]{1,64})$/;
  static GLOBAL = /!\[([^\]]*)\]\(csdraw-(drawing|media):([A-Za-z0-9_-]{1,64})\)/g;

  static drawing(id, name) {
    return `![${EmbedTokens.#clean(name)}](csdraw-drawing:${id})`;
  }

  static media(id, name) {
    return `![${EmbedTokens.#clean(name)}](csdraw-media:${id})`;
  }

  static parse(src) {
    const match = EmbedTokens.PATTERN.exec(String(src ?? ''));
    return match ? { kind: match[1], id: match[2] } : null;
  }

  /** Versao portavel para exportar .md (os tokens so fazem sentido dentro do CSDraw). */
  static toPortableText(markdown, labels = { drawing: 'Drawing', media: 'Media', unnamed: '(unnamed)' }) {
    return markdown.replace(EmbedTokens.GLOBAL, (_all, name, kind) =>
      kind === 'drawing' ? `> 🗺️ ${labels.drawing}: ${name || labels.unnamed}` : `> 📎 ${labels.media}: ${name || labels.unnamed}`
    );
  }

  static #clean(name) {
    return String(name ?? '').replace(/[\[\]\n]/g, ' ').trim();
  }
}
