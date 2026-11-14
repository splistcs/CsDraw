import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api } from '../../shared/api/api.js';
import { LibraryEvents } from '../../shared/events/LibraryEvents.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { FolderTree } from './FolderTree.jsx';
import { MediaGrid } from './MediaGrid.jsx';
import { MediaViewer } from './MediaViewer.jsx';

export default function MediaModule() {
  const { askText, confirm, notify } = useFeedback();
  const { t, errorMessage } = useI18n();
  const [tree, setTree] = useState({ folders: [], items: [] });
  const [currentId, setCurrentId] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const reload = useCallback(() => api.media.tree().then(setTree).catch((e) => notify(errorMessage(e))), [notify, errorMessage]);
  useEffect(() => {
    reload();
    return LibraryEvents.subscribe(reload);
  }, [reload]);

  const current = tree.folders.find((f) => f.id === currentId) ?? null;
  const subfolders = useMemo(() => tree.folders.filter((f) => f.parentId === currentId).sort((a, b) => a.name.localeCompare(b.name)), [tree, currentId]);
  const items = useMemo(() => tree.items.filter((i) => i.folderId === currentId).sort((a, b) => a.name.localeCompare(b.name)), [tree, currentId]);

  const breadcrumb = useMemo(() => {
    const trail = [];
    for (let folder = current; folder; folder = tree.folders.find((f) => f.id === folder.parentId)) trail.unshift(folder);
    return trail;
  }, [current, tree.folders]);

  const guard = async (action) => {
    try { await action(); } catch (error) { notify(errorMessage(error)); }
  };

  const reportImport = (result) => {
    if (result.canceled) return;
    const parts = [];
    if (result.added.length) parts.push(t('media.imported', { count: result.added.length }));
    if (result.errors.length) parts.push(t('media.failed', { count: result.errors.length, name: result.errors[0].name, reason: result.errors[0].message }));
    notify(parts.join(' · ') || t('media.nothing'));
    LibraryEvents.emit();
  };

  const importFiles = (folderId, files) => guard(async () => {
    const paths = files.map((file) => api.files.pathFor(file)).filter(Boolean);
    if (!paths.length) return;
    setBusy(true);
    try { reportImport(await api.media.importPaths(paths, folderId)); } finally { setBusy(false); }
  });

  const pickAndImport = () => guard(async () => {
    setBusy(true);
    try { reportImport(await api.media.pickAndImport(currentId, t('media.pickTitle'))); } finally { setBusy(false); }
  });

  const createFolder = () => guard(async () => {
    const name = await askText({ title: t('media.newFolder'), label: t('media.folderName'), confirmLabel: t('common.create') });
    if (!name) return;
    const folder = await api.media.createFolder({ name, parentId: currentId });
    setCurrentId(folder.id);
    LibraryEvents.emit();
  });

  const renameFolder = () => guard(async () => {
    const name = await askText({ title: t('media.renameFolder'), label: t('common.newName'), initial: current.name, confirmLabel: t('common.rename') });
    if (!name) return;
    await api.media.renameFolder({ id: current.id, name });
    LibraryEvents.emit();
  });

  const removeFolder = () => guard(async () => {
    const ok = await confirm({ title: t('media.deleteFolder'), message: t('media.deleteFolderText', { name: current.name }), confirmLabel: t('common.delete') });
    if (!ok) return;
    await api.media.removeFolder(current.id);
    setCurrentId(current.parentId);
    LibraryEvents.emit();
  });

  const renameItem = (item) => guard(async () => {
    const name = await askText({ title: t('common.rename'), label: t('common.newName'), initial: item.name, confirmLabel: t('common.rename') });
    if (!name) return;
    await api.media.rename({ id: item.id, name });
    LibraryEvents.emit();
  });

  const deleteItem = (item) => guard(async () => {
    if (!(await confirm({ title: t('media.deleteFile'), message: t('media.deleteFileText', { name: item.name }), confirmLabel: t('common.delete') }))) return;
    await api.media.remove(item.id);
    LibraryEvents.emit();
  });

  const moveItem = (folderId, id) => guard(async () => {
    if (!id) return;
    await api.media.move({ id, folderId });
    LibraryEvents.emit();
  });

  const onGridDragOver = (event) => {
    if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropActive(true); }
  };

  return (
    <div className="media-module">
      <aside className="media-tree">
        <FolderTree folders={tree.folders} currentId={currentId} onSelect={setCurrentId} onDropMedia={moveItem} onDropFiles={importFiles} />
      </aside>

      <section
        className={`media-main${dropActive ? ' drop-active' : ''}`}
        onDragOver={onGridDragOver}
        onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setDropActive(false)}
        onDrop={(e) => { e.preventDefault(); setDropActive(false); if (e.dataTransfer.files.length) importFiles(currentId, [...e.dataTransfer.files]); }}
      >
        <div className="media-toolbar">
          <nav className="breadcrumb" aria-label={t('media.path')}>
            <button onClick={() => setCurrentId(null)}>{t('media.library')}</button>
            {breadcrumb.map((folder) => (
              <span key={folder.id}>/ <button onClick={() => setCurrentId(folder.id)}>{folder.name}</button></span>
            ))}
          </nav>
          <div className="media-toolbar-actions">
            <button className="btn btn-primary" onClick={pickAndImport} disabled={busy}>{busy ? t('media.importing') : t('media.import')}</button>
            <button className="btn btn-ghost" onClick={createFolder}>{t('media.newFolder')}</button>
            <button className="btn btn-ghost" onClick={renameFolder} disabled={!current}>{t('media.renameFolder')}</button>
            <button className="btn btn-ghost danger" onClick={removeFolder} disabled={!current}>{t('media.deleteFolder')}</button>
          </div>
        </div>

        <MediaGrid folders={subfolders} items={items} onOpenFolder={setCurrentId} onOpenItem={(item) => setViewerIndex(items.findIndex((i) => i.id === item.id))} onRename={renameItem} onDelete={deleteItem} />
        {dropActive && <div className="drop-overlay">{t('media.dropHere')}</div>}
      </section>

      {viewerIndex !== null && <MediaViewer items={items} index={viewerIndex} onChange={setViewerIndex} onClose={() => setViewerIndex(null)} />}
    </div>
  );
}
