import crypto from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import { MediaTypes } from './MediaTypes.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;
const THUMBNAIL_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]*$/;
const SHAPE_KINDS = ['line', 'arrow', 'rect', 'ellipse'];
const GRENADE_TYPES = ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'];

/** Utilitarios de validacao compartilhados. */
export class Validate {
  static id(value, label = 'identificador') {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new AppError(`Valor inválido para ${label}.`, 'INVALID');
    return value;
  }

  static optionalId(value, label) {
    return value === null || value === undefined ? null : Validate.id(value, label);
  }

  static text(value, { min = 0, max, label }) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length < min || text.length > max) {
      throw new AppError(`${label}: use entre ${min} e ${max} caracteres.`, 'INVALID');
    }
    return text;
  }

  static isoDate(value) {
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
  }

  static newId() {
    return crypto.randomUUID();
  }
}

/** Valida desenhos (tracos, adesivos com imagens e legendas). */
export class DrawingValidator {
  static validate(body) {
    if (!body || typeof body !== 'object') throw new AppError('Desenho inválido.', 'INVALID');
    const name = Validate.text(body.name, { min: 1, max: 60, label: 'Nome do desenho' });
    if (typeof body.mapSlug !== 'string' || !SLUG_PATTERN.test(body.mapSlug)) throw new AppError('Mapa inválido.', 'INVALID');
    const notes = typeof body.notes === 'string' ? body.notes : '';
    if (notes.length > 50000) throw new AppError('As anotações excedem 50.000 caracteres.', 'INVALID');
    const thumbnail = typeof body.thumbnail === 'string' ? body.thumbnail : '';
    if (thumbnail && (thumbnail.length > 300000 || !THUMBNAIL_PATTERN.test(thumbnail))) {
      throw new AppError('Miniatura inválida.', 'INVALID');
    }
    return {
      id: body.id === undefined || body.id === null ? null : Validate.id(body.id),
      name,
      mapSlug: body.mapSlug,
      notes,
      thumbnail,
      strokes: DrawingValidator.#strokes(body.strokes),
      stickers: DrawingValidator.#stickers(body.stickers)
    };
  }

  static #strokes(strokes) {
    if (!Array.isArray(strokes) || strokes.length > 3000) throw new AppError('Traços inválidos.', 'INVALID');
    return strokes.map((stroke) => {
      const kind = stroke?.kind ?? 'pen';
      const isShape = SHAPE_KINDS.includes(kind);
      const isText = kind === 'text';
      const okKind = isShape || isText || kind === 'pen' || kind === 'highlighter';
      const okColor = COLOR_PATTERN.test(stroke?.color ?? '');
      const okWidth = Number.isFinite(stroke?.width) && stroke.width >= 1 && stroke.width <= 120;
      const max = isShape ? 2 : isText ? 1 : 6000;
      const min = isShape ? 2 : 1;
      const okPoints =
        Array.isArray(stroke?.points) &&
        stroke.points.length >= min &&
        stroke.points.length <= max &&
        stroke.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
      const text = isText ? Validate.text(stroke?.text ?? '', { min: 1, max: 200, label: 'Texto' }) : null;
      if (!okKind || !okColor || !okWidth || !okPoints) throw new AppError('Traço inválido.', 'INVALID');
      const points = stroke.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      return text === null ? { kind, color: stroke.color, width: stroke.width, points } : { kind, color: stroke.color, width: stroke.width, points, text };
    });
  }

  static #stickers(stickers) {
    if (!Array.isArray(stickers) || stickers.length > 300) throw new AppError('Adesivos inválidos.', 'INVALID');
    return stickers.map((sticker) => {
      if (!GRENADE_TYPES.includes(sticker?.type) || !Number.isFinite(sticker?.x) || !Number.isFinite(sticker?.y)) {
        throw new AppError('Adesivo inválido.', 'INVALID');
      }
      const images = Array.isArray(sticker.images) ? sticker.images : [];
      if (images.length > 40) throw new AppError('Imagens demais em um adesivo.', 'INVALID');
      return {
        id: sticker.id ? Validate.id(sticker.id, 'adesivo') : Validate.newId(),
        type: sticker.type,
        x: sticker.x,
        y: sticker.y,
        images: images.map((image) => ({
          mediaId: Validate.id(image?.mediaId, 'imagem'),
          caption: Validate.text(image?.caption ?? '', { max: 300, label: 'Legenda' })
        }))
      };
    });
  }
}

export class PlaybookValidator {
  static validate(body) {
    if (!body || typeof body !== 'object') throw new AppError('Playbook inválido.', 'INVALID');
    const content = typeof body.content === 'string' ? body.content : '';
    if (content.length > 500000) throw new AppError('O playbook excede 500.000 caracteres.', 'INVALID');
    return {
      id: body.id === undefined || body.id === null ? null : Validate.id(body.id),
      name: Validate.text(body.name, { min: 1, max: 80, label: 'Nome do playbook' }),
      content
    };
  }
}

/** Sanitiza uma biblioteca vinda de um arquivo importado (dados nao confiaveis). */
export class LibrarySanitizer {
  static sanitize(raw) {
    const list = (value) => (Array.isArray(value) ? value : []);
    const drawings = [];
    for (const item of list(raw?.drawings)) {
      try {
        const valid = DrawingValidator.validate(item);
        if (!valid.id) continue;
        drawings.push({ ...valid, createdAt: Validate.isoDate(item.createdAt), updatedAt: Validate.isoDate(item.updatedAt) });
      } catch { /* ignora item invalido */ }
    }
    const playbooks = [];
    for (const item of list(raw?.playbooks)) {
      try {
        const valid = PlaybookValidator.validate(item);
        if (!valid.id) continue;
        playbooks.push({ ...valid, createdAt: Validate.isoDate(item.createdAt), updatedAt: Validate.isoDate(item.updatedAt) });
      } catch { /* ignora */ }
    }
    const folderIds = new Set();
    const folders = [];
    for (const item of list(raw?.folders)) {
      try {
        const id = Validate.id(item?.id);
        folderIds.add(id);
        folders.push({ id, name: Validate.text(item.name, { min: 1, max: 80, label: 'Pasta' }), parentId: Validate.optionalId(item.parentId), createdAt: Validate.isoDate(item.createdAt) });
      } catch { /* ignora */ }
    }
    folders.forEach((folder) => { if (folder.parentId && !folderIds.has(folder.parentId)) folder.parentId = null; });
    const media = [];
    for (const item of list(raw?.media)) {
      try {
        const type = MediaTypes.detect(item?.name);
        const folderId = Validate.optionalId(item.folderId);
        media.push({
          id: Validate.id(item.id),
          name: Validate.text(item.name, { min: 1, max: 160, label: 'Mídia' }),
          kind: type.kind,
          mime: type.mime,
          size: Number.isFinite(item.size) ? item.size : 0,
          folderId: folderId && folderIds.has(folderId) ? folderId : null,
          origin: item.origin === 'sticker' ? 'sticker' : 'library',
          createdAt: Validate.isoDate(item.createdAt)
        });
      } catch { /* ignora */ }
    }
    const demos = [];
    for (const item of list(raw?.demos)) {
      try {
        const int = (v) => (Number.isInteger(v) && v >= 0 && v < 100000 ? v : 0);
        const slug = typeof item.mapSlug === 'string' && SLUG_PATTERN.test(item.mapSlug) ? item.mapSlug : 'unknown';
        demos.push({
          id: Validate.id(item.id),
          name: Validate.text(item.name, { min: 1, max: 120, label: 'Demo' }),
          mapName: Validate.text(item.mapName ?? '', { max: 60, label: 'Mapa' }),
          mapSlug: slug,
          uploadedAt: Validate.isoDate(item.uploadedAt),
          fileModifiedAt: Validate.isoDate(item.fileModifiedAt),
          fileSize: Number.isFinite(item.fileSize) ? item.fileSize : 0,
          fingerprint: typeof item.fingerprint === 'string' ? item.fingerprint.slice(0, 300) : '',
          roundCount: int(item.roundCount),
          scoreA: int(item.scoreA),
          scoreB: int(item.scoreB),
          teamA: typeof item.teamA === 'string' ? item.teamA.slice(0, 40) : '',
          teamB: typeof item.teamB === 'string' ? item.teamB.slice(0, 40) : '',
          analysisVersion: int(item.analysisVersion),
          parserVersion: typeof item.parserVersion === 'string' ? item.parserVersion.slice(0, 30) : '',
          tags: (Array.isArray(item.tags) ? item.tags : []).slice(0, 20).map((t) => String(t).trim().slice(0, 30)).filter(Boolean)
        });
      } catch { /* ignora */ }
    }
    return { drawings, playbooks, folders, media, demos };
  }
}
