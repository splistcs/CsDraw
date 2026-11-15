import { AppError } from '../errors/AppError.js';
import { Validate } from '../validation/Validators.js';

const clone = (value) => structuredClone(value);
const newestFirst = (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1);

export class DrawingRepository {
  #store;
  constructor(store) { this.#store = store; }

  list() {
    return this.#store.data.drawings
      .map(({ id, name, mapSlug, thumbnail, updatedAt }) => ({ id, name, mapSlug, thumbnail, updatedAt }))
      .sort(newestFirst);
  }

  get(id) {
    const found = this.#store.data.drawings.find((d) => d.id === id);
    if (!found) throw new AppError('Drawing not found.', 'NOT_FOUND');
    return clone(found);
  }

  all() { return this.#store.data.drawings; }

  upsert(drawing) {
    return this.#store.mutate((data) => {
      const now = new Date().toISOString();
      const index = drawing.id ? data.drawings.findIndex((d) => d.id === drawing.id) : -1;
      if (drawing.id && index < 0) throw new AppError('Drawing to update not found.', 'NOT_FOUND');
      const record = index >= 0
        ? { ...drawing, createdAt: data.drawings[index].createdAt, updatedAt: now }
        : { ...drawing, id: Validate.newId(), createdAt: now, updatedAt: now };
      if (index >= 0) data.drawings[index] = record; else data.drawings.push(record);
      return clone(record);
    });
  }

  remove(id) {
    return this.#store.mutate((data) => {
      const before = data.drawings.length;
      data.drawings = data.drawings.filter((d) => d.id !== id);
      if (data.drawings.length === before) throw new AppError('Drawing not found.', 'NOT_FOUND');
    });
  }
}

export class PlaybookRepository {
  #store;
  constructor(store) { this.#store = store; }

  list() {
    return this.#store.data.playbooks.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort(newestFirst);
  }

  get(id) {
    const found = this.#store.data.playbooks.find((p) => p.id === id);
    if (!found) throw new AppError('Playbook not found.', 'NOT_FOUND');
    return clone(found);
  }

  upsert(playbook) {
    return this.#store.mutate((data) => {
      const now = new Date().toISOString();
      const index = playbook.id ? data.playbooks.findIndex((p) => p.id === playbook.id) : -1;
      if (playbook.id && index < 0) throw new AppError('Playbook to update not found.', 'NOT_FOUND');
      const record = index >= 0
        ? { ...playbook, createdAt: data.playbooks[index].createdAt, updatedAt: now }
        : { ...playbook, id: Validate.newId(), createdAt: now, updatedAt: now };
      if (index >= 0) data.playbooks[index] = record; else data.playbooks.push(record);
      return clone(record);
    });
  }

  remove(id) {
    return this.#store.mutate((data) => {
      const before = data.playbooks.length;
      data.playbooks = data.playbooks.filter((p) => p.id !== id);
      if (data.playbooks.length === before) throw new AppError('Playbook not found.', 'NOT_FOUND');
    });
  }
}

export class MediaRepository {
  #store;
  constructor(store) { this.#store = store; }

  tree() {
    const { folders, media } = this.#store.data;
    return clone({ folders, items: media.filter((m) => m.origin !== 'sticker') });
  }

  findItem(id) { return this.#store.data.media.find((m) => m.id === id) ?? null; }
  allItems() { return this.#store.data.media; }

  addItem(item) {
    return this.#store.mutate((data) => {
      if (item.folderId && !data.folders.some((f) => f.id === item.folderId)) throw new AppError('Folder not found.', 'NOT_FOUND');
      data.media.push(item);
      return clone(item);
    });
  }

  renameItem(id, name) {
    return this.#store.mutate((data) => {
      const item = data.media.find((m) => m.id === id);
      if (!item) throw new AppError('Media not found.', 'NOT_FOUND');
      item.name = name;
      return clone(item);
    });
  }

  moveItem(id, folderId) {
    return this.#store.mutate((data) => {
      const item = data.media.find((m) => m.id === id);
      if (!item) throw new AppError('Media not found.', 'NOT_FOUND');
      if (folderId && !data.folders.some((f) => f.id === folderId)) throw new AppError('Folder not found.', 'NOT_FOUND');
      item.folderId = folderId;
      return clone(item);
    });
  }

  removeItems(ids) {
    const set = new Set(ids);
    return this.#store.mutate((data) => { data.media = data.media.filter((m) => !set.has(m.id)); });
  }

  createFolder(name, parentId) {
    return this.#store.mutate((data) => {
      if (parentId && !data.folders.some((f) => f.id === parentId)) throw new AppError('Folder not found.', 'NOT_FOUND');
      MediaRepository.#assertUnique(data, name, parentId, null);
      const folder = { id: Validate.newId(), name, parentId, createdAt: new Date().toISOString() };
      data.folders.push(folder);
      return clone(folder);
    });
  }

  renameFolder(id, name) {
    return this.#store.mutate((data) => {
      const folder = data.folders.find((f) => f.id === id);
      if (!folder) throw new AppError('Folder not found.', 'NOT_FOUND');
      MediaRepository.#assertUnique(data, name, folder.parentId, id);
      folder.name = name;
      return clone(folder);
    });
  }

  removeFolder(id) {
    return this.#store.mutate((data) => {
      if (!data.folders.some((f) => f.id === id)) throw new AppError('Folder not found.', 'NOT_FOUND');
      const doomed = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const folder of data.folders) {
          if (folder.parentId && doomed.has(folder.parentId) && !doomed.has(folder.id)) { doomed.add(folder.id); grew = true; }
        }
      }
      const mediaIds = data.media.filter((m) => m.folderId && doomed.has(m.folderId)).map((m) => m.id);
      data.folders = data.folders.filter((f) => !doomed.has(f.id));
      data.media = data.media.filter((m) => !mediaIds.includes(m.id));
      return mediaIds;
    });
  }

  static #assertUnique(data, name, parentId, ignoreId) {
    const clash = data.folders.some((f) => f.id !== ignoreId && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new AppError('A folder with that name already exists here.', 'DUPLICATE');
  }
}

export class DemoRepository {
  #store;
  constructor(store) { this.#store = store; }

  list() { return structuredClone(this.#store.data.demos ?? []); }
  all() { return this.#store.data.demos ?? []; }
  find(id) { return this.all().find((d) => d.id === id) ?? null; }
  findByFingerprint(fingerprint) { return this.all().find((d) => d.fingerprint === fingerprint) ?? null; }

  add(entry) {
    return this.#store.mutate((data) => {
      data.demos ??= [];
      data.demos.push(entry);
      return structuredClone(entry);
    });
  }

  update(id, patch) {
    return this.#store.mutate((data) => {
      const entry = (data.demos ?? []).find((d) => d.id === id);
      if (!entry) throw new AppError('Demo not found.', 'NOT_FOUND');
      Object.assign(entry, patch);
      return structuredClone(entry);
    });
  }

  remove(id) {
    return this.#store.mutate((data) => {
      const before = (data.demos ?? []).length;
      data.demos = (data.demos ?? []).filter((d) => d.id !== id);
      if (data.demos.length === before) throw new AppError('Demo not found.', 'NOT_FOUND');
    });
  }
}
