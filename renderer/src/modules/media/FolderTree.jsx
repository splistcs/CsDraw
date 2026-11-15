import { useI18n } from '../../i18n/I18nProvider.jsx';

const hasFiles = (event) => event.dataTransfer.types.includes('Files');
const MEDIA_TYPE = 'application/x-csdraw-media';

export function FolderTree({ folders, currentId, onSelect, onDropMedia, onDropFiles }) {
  const { t } = useI18n();
  const childrenOf = (parentId) => folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

  const dropHandlers = (folderId) => ({
    onDragOver: (e) => { if (hasFiles(e) || e.dataTransfer.types.includes(MEDIA_TYPE)) e.preventDefault(); },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (hasFiles(e)) onDropFiles(folderId, [...e.dataTransfer.files]);
      else onDropMedia(folderId, e.dataTransfer.getData(MEDIA_TYPE));
    }
  });

  const render = (parentId, depth) =>
    childrenOf(parentId).map((folder) => (
      <li key={folder.id}>
        <button className={`tree-node${folder.id === currentId ? ' active' : ''}`} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => onSelect(folder.id)} {...dropHandlers(folder.id)}>
          📁 {folder.name}
        </button>
        <ul>{render(folder.id, depth + 1)}</ul>
      </li>
    ));

  return (
    <ul className="folder-tree" aria-label={t('media.folders')}>
      <li>
        <button className={`tree-node${currentId === null ? ' active' : ''}`} onClick={() => onSelect(null)} {...dropHandlers(null)}>🗂 {t('media.library')}</button>
        <ul>{render(null, 1)}</ul>
      </li>
    </ul>
  );
}

export { MEDIA_TYPE };
