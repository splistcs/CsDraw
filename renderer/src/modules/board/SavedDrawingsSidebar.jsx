import { useI18n } from '../../i18n/I18nProvider.jsx';
import { MapCatalog } from '../../shared/constants/MapCatalog.js';
import { SideDrawer } from '../../shared/ui/SideDrawer.jsx';

export function SavedDrawingsSidebar({ drawings, activeId, name, onNameChange, onSave, onNew, onOpen, onDelete, isSaving, isDirty, isOpen, onToggle }) {
  const { t } = useI18n();
  return (
    <SideDrawer side="left" open={isOpen} onToggle={onToggle} title={t('board.saved')} handleLabel={isOpen ? t('board.collapse') : t('board.expand')}>
      <h2>{t('board.saved')}</h2>
      <div className="save-box">
        <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={t('board.drawingName')} maxLength={60} aria-label={t('board.drawingName')} />
        <div className="save-actions">
          <button className="btn btn-primary" onClick={onSave} disabled={isSaving}>{activeId ? t('board.update') : t('board.save')}{isDirty ? ' •' : ''}</button>
          <button className="btn btn-ghost" onClick={onNew}>{t('board.new')}</button>
        </div>
        {activeId && <small className="sidebar-hint">{t('board.editingHint')}</small>}
      </div>

      {drawings.length === 0 ? (
        <p className="sidebar-hint">{t('board.noDrawings')}</p>
      ) : (
        <ul className="drawing-list">
          {drawings.map((drawing) => (
            <li key={drawing.id} className={drawing.id === activeId ? 'active' : ''}>
              <button className="drawing-open" onClick={() => onOpen(drawing.id)} title={t('board.openToEdit')}>
                {drawing.thumbnail ? <img src={drawing.thumbnail} alt={drawing.name} /> : <span className="thumb-placeholder" />}
                <span className="drawing-meta">
                  <strong>{drawing.name}</strong>
                  <small>{MapCatalog.findBySlug(drawing.mapSlug).name}</small>
                </span>
              </button>
              <button className="drawing-delete" onClick={() => onDelete(drawing)} aria-label={t('common.deleteItem', { name: drawing.name })}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </SideDrawer>
  );
}
