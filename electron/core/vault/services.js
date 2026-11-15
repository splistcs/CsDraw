import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../errors/AppError.js';
import { MediaTypes } from '../validation/MediaTypes.js';
import { DrawingValidator, PlaybookValidator, Validate } from '../validation/Validators.js';
import { LibraryStore } from './LibraryStore.js';

export class DrawingService {
  #drawings;
  #media;

  constructor({ drawingRepository, mediaRepository }) {
    this.#drawings = drawingRepository;
    this.#media = mediaRepository;
  }

  list() { return this.#drawings.list(); }

  get(id) { return this.#drawings.get(Validate.id(id)); }

  save(body) {
    const drawing = DrawingValidator.validate(body);
    drawing.stickers.forEach((sticker) => {
      sticker.images = sticker.images.filter((image) => this.#media.findItem(image.mediaId));
    });
    return this.#drawings.upsert(drawing);
  }

  remove(id) { return this.#drawings.remove(Validate.id(id)); }
}

export class PlaybookService {
  #playbooks;
  constructor({ playbookRepository }) { this.#playbooks = playbookRepository; }
  list() { return this.#playbooks.list(); }
  get(id) { return this.#playbooks.get(Validate.id(id)); }
  save(body) { return this.#playbooks.upsert(PlaybookValidator.validate(body)); }
  remove(id) { return this.#playbooks.remove(Validate.id(id)); }
}

export class MediaService {
  #blobStore;
  #media;
  #drawings;

  #extraKnownBlobIds;

  constructor({ blobStore, mediaRepository, drawingRepository, extraKnownBlobIds = () => [] }) {
    this.#blobStore = blobStore;
    this.#media = mediaRepository;
    this.#drawings = drawingRepository;
    this.#extraKnownBlobIds = extraKnownBlobIds;
  }

  tree() { return this.#media.tree(); }

  createFolder({ name, parentId = null }) {
    return this.#media.createFolder(Validate.text(name, { min: 1, max: 80, label: 'Folder name' }), Validate.optionalId(parentId));
  }

  renameFolder({ id, name }) {
    return this.#media.renameFolder(Validate.id(id), Validate.text(name, { min: 1, max: 80, label: 'Folder name' }));
  }

  async removeFolder(id) {
    const mediaIds = await this.#media.removeFolder(Validate.id(id));
    await Promise.all(mediaIds.map((mediaId) => this.#blobStore.remove(mediaId)));
  }

  async importPaths(paths, folderId = null) {
    if (!Array.isArray(paths) || paths.length > 200) throw new AppError('Invalid file list.', 'INVALID');
    const target = Validate.optionalId(folderId);
    const added = [];
    const errors = [];
    for (const filePath of paths) {
      try {
        added.push(await this.#importFile(filePath, target));
      } catch (error) {
        errors.push({ name: typeof filePath === 'string' ? path.basename(filePath) : '?', message: error.message });
      }
    }
    return { added, errors };
  }

  async #importFile(filePath, folderId) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new AppError('Invalid path.', 'INVALID');
    const name = path.basename(filePath);
    const type = MediaTypes.detect(name);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new AppError('Not a file.', 'INVALID');
    MediaTypes.assertSize(type.kind, stat.size);
    return this.#store({ name, type, folderId, origin: 'library', source: fsSync.createReadStream(filePath) });
  }

  async addBuffer({ name, data, folderId = null, origin = 'library' }) {
    const type = MediaTypes.detect(name);
    if (origin !== 'library' && origin !== 'sticker') throw new AppError('Invalid origin.', 'INVALID');
    if (origin === 'sticker' && type.kind !== 'image') throw new AppError('Stickers only accept images.', 'INVALID');
    const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : null;
    if (!buffer) throw new AppError('Invalid data.', 'INVALID');
    MediaTypes.assertSize(type.kind, buffer.length);
    const { Readable } = await import('node:stream');
    return this.#store({ name: path.basename(String(name)), type, folderId: Validate.optionalId(folderId), origin, source: Readable.from([buffer]) });
  }

  async #store({ name, type, folderId, origin, source }) {
    const id = Validate.newId();
    const size = await this.#blobStore.putStream(id, source);
    try {
      return await this.#media.addItem({ id, name: name.slice(0, 160), kind: type.kind, mime: type.mime, size, folderId, origin, createdAt: new Date().toISOString() });
    } catch (error) {
      await this.#blobStore.remove(id);
      throw error;
    }
  }

  rename({ id, name }) {
    return this.#media.renameItem(Validate.id(id), Validate.text(name, { min: 1, max: 160, label: 'Name' }));
  }

  move({ id, folderId = null }) {
    return this.#media.moveItem(Validate.id(id), Validate.optionalId(folderId));
  }

  async remove(id) {
    const safeId = Validate.id(id);
    await this.#media.removeItems([safeId]);
    await this.#blobStore.remove(safeId);
  }

  async collectOrphans() {
    const referenced = new Set(this.#drawings.all().flatMap((d) => d.stickers.flatMap((s) => s.images.map((i) => i.mediaId))));
    const stale = this.#media.allItems().filter((m) => m.origin === 'sticker' && !referenced.has(m.id)).map((m) => m.id);
    if (stale.length) await this.#media.removeItems(stale);
    const known = new Set(this.#media.allItems().map((m) => m.id));
    known.add(LibraryStore.BLOB_ID);
    this.#extraKnownBlobIds().forEach((id) => known.add(id));
    for (const id of await this.#blobStore.listIds()) if (!known.has(id)) await this.#blobStore.remove(id);
  }
}
