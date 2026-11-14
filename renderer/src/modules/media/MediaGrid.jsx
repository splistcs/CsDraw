import { useI18n } from '../../i18n/I18nProvider.jsx';
import { mediaUrl } from '../../shared/api/api.js';
import { Format } from '../../shared/utils/format.js';
import { MEDIA_TYPE } from './FolderTree.jsx';

export function MediaGrid({ folders, items, onOpenFolder, onOpenItem, onRename, onDelete }) {
  const { t } = useI18n();
  if (!folders.length && !items.length) {
    return <div className="empty-state"><p>{t('media.empty')}</p></div>;
  }
  return (
    <div className="media-grid">
      {folders.map((folder) => (
        <button key={folder.id} className="media-card folder-card" onDoubleClick={() => onOpenFolder(folder.id)} onClick={() => onOpenFolder(folder.id)}>
          <span className="media-thumb folder-thumb">📁</span>
          <span className="media-info"><strong>{folder.name}</strong><small>{t('media.folder')}</small></span>
        </button>
      ))}
      {items.map((item) => (
        <div key={item.id} className="media-card" draggable onDragStart={(e) => e.dataTransfer.setData(MEDIA_TYPE, item.id)}>
          <button className="media-thumb" onClick={() => onOpenItem(item)} aria-label={t('media.open', { name: item.name })}>
            {item.kind === 'image' ? (
              <img src={mediaUrl(item.id)} alt="" loading="lazy" draggable={false} />
            ) : (
              <>
                <video src={mediaUrl(item.id)} preload="metadata" muted />
                <span className="play-badge">▶</span>
              </>
            )}
          </button>
          <span className="media-info"><strong title={item.name}>{item.name}</strong><small>{Format.bytes(item.size)}</small></span>
          <span className="media-actions">
            <button className="icon-button" onClick={() => onRename(item)} aria-label={t('common.rename')} title={t('common.rename')}>✎</button>
            <button className="icon-button" onClick={() => onDelete(item)} aria-label={t('common.delete')} title={t('common.delete')}>🗑</button>
          </span>
        </div>
      ))}
    </div>
  );
}
