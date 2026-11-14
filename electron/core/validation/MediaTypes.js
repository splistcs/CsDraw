import path from 'node:path';
import { AppError } from '../errors/AppError.js';

/** Tipos de midia aceitos (SVG fica de fora de proposito: pode conter scripts). */
export class MediaTypes {
  static BY_EXTENSION = {
    '.png': { kind: 'image', mime: 'image/png' },
    '.jpg': { kind: 'image', mime: 'image/jpeg' },
    '.jpeg': { kind: 'image', mime: 'image/jpeg' },
    '.webp': { kind: 'image', mime: 'image/webp' },
    '.gif': { kind: 'image', mime: 'image/gif' },
    '.mp4': { kind: 'video', mime: 'video/mp4' },
    '.m4v': { kind: 'video', mime: 'video/mp4' },
    '.webm': { kind: 'video', mime: 'video/webm' },
    '.ogv': { kind: 'video', mime: 'video/ogg' },
    '.mov': { kind: 'video', mime: 'video/quicktime' }
  };
  static MAX_IMAGE_BYTES = 30 * 1024 * 1024;
  static MAX_VIDEO_BYTES = 8 * 1024 * 1024 * 1024;

  static detect(fileName) {
    const type = MediaTypes.BY_EXTENSION[path.extname(String(fileName)).toLowerCase()];
    if (!type) throw new AppError('Formato não suportado. Use PNG, JPG, WEBP, GIF, MP4, WEBM, OGV ou MOV.', 'UNSUPPORTED_MEDIA');
    return type;
  }

  static assertSize(kind, size) {
    const limit = kind === 'image' ? MediaTypes.MAX_IMAGE_BYTES : MediaTypes.MAX_VIDEO_BYTES;
    if (size > limit) throw new AppError('Arquivo grande demais.', 'TOO_LARGE');
  }
}
