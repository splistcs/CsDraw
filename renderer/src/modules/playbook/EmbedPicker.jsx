import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api, mediaUrl } from '../../shared/api/api.js';
import { MapCatalog } from '../../shared/constants/MapCatalog.js';
import { EmbedTokens } from '../../shared/markdown/EmbedTokens.js';
import { Modal } from '../../shared/ui/Modal.jsx';

export function EmbedPicker({ onPick, onClose, initialTab = 'drawings' }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [drawings, setDrawings] = useState([]);
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState(null);

  useEffect(() => {
    api.drawings.list().then(setDrawings).catch(() => {});
    api.media.tree().then((tree) => { setItems(tree.items); setFolders(tree.folders ?? []); }).catch(() => {});
  }, []);

  const matches = (name) => name.toLowerCase().includes(query.trim().toLowerCase());
  const searching = query.trim() !== '';
  const byName = (a, b) => a.name.localeCompare(b.name);
  const folderById = (id) => folders.find((f) => f.id === id);

  const trail = useMemo(() => {
    const path = [];
    for (let f = folderById(folderId); f; f = folderById(f.parentId)) path.unshift(f);
    return path;
  }, [folders, folderId]);
  const subfolders = folders.filter((f) => f.parentId === folderId).sort(byName);
  const mediaItems = items.filter((i) => (searching ? matches(i.name) : i.folderId === folderId)).sort(byName);
  const folderPath = (id) => [...(function* () { for (let f = folderById(id); f; f = folderById(f.parentId)) yield f.name; })()].reverse().join(' / ');

  return (
    <Modal title={t('picker.title')} onClose={onClose} wide>
      <div className="picker-head">
        <div className="segmented">
          <button className={tab === 'drawings' ? 'active' : ''} onClick={() => setTab('drawings')}>{t('picker.drawings')}</button>
          <button className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>{t('picker.media')}</button>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} />
      </div>

      {tab === 'media' && !searching && (
        <nav className="picker-crumbs" aria-label={t('media.path')}>
          <button className={folderId === null ? 'active' : ''} onClick={() => setFolderId(null)}>🗂 {t('media.library')}</button>
          {trail.map((f) => (
            <span key={f.id}>
              <span aria-hidden="true">›</span>
              <button className={f.id === folderId ? 'active' : ''} onClick={() => setFolderId(f.id)}>{f.name}</button>
            </span>
          ))}
        </nav>
      )}

      <div className="picker-grid">
        {tab === 'drawings' && drawings.filter((d) => matches(d.name)).map((drawing) => (
          <button key={drawing.id} className="picker-item" onClick={() => onPick(EmbedTokens.drawing(drawing.id, drawing.name))}>
            {drawing.thumbnail ? <img src={drawing.thumbnail} alt="" /> : <span className="thumb-placeholder" />}
            <strong>{drawing.name}</strong>
            <small>{MapCatalog.findBySlug(drawing.mapSlug).name}</small>
          </button>
        ))}
        {tab === 'media' && !searching && subfolders.map((folder) => (
          <button key={folder.id} className="picker-item picker-folder" onClick={() => setFolderId(folder.id)}>
            <span className="thumb-placeholder folder">📁</span>
            <strong>{folder.name}</strong>
            <small>{t('media.folder')}</small>
          </button>
        ))}
        {tab === 'media' && mediaItems.map((item) => (
          <button key={item.id} className="picker-item" onClick={() => onPick(EmbedTokens.media(item.id, item.name))}>
            {item.kind === 'image' ? <img src={mediaUrl(item.id)} alt="" /> : <span className="thumb-placeholder video">🎬</span>}
            <strong>{item.name}</strong>
            <small>{searching && item.folderId ? folderPath(item.folderId) : item.kind === 'image' ? t('common.image') : t('common.video')}</small>
          </button>
        ))}
      </div>
      {tab === 'drawings' && drawings.length === 0 && <p className="md-empty">{t('picker.noDrawings')}</p>}
      {tab === 'media' && items.length === 0 && folders.length === 0 && <p className="md-empty">{t('picker.noMedia')}</p>}
      {tab === 'media' && (items.length > 0 || folders.length > 0) && subfolders.length === 0 && mediaItems.length === 0 && !searching && <p className="md-empty">{t('picker.emptyFolder')}</p>}
      <div className="dialog-actions"><button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button></div>
    </Modal>
  );
}
