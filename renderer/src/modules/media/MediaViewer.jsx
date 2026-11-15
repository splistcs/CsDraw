import { useEffect } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { mediaUrl } from '../../shared/api/api.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Format } from '../../shared/utils/format.js';

export function MediaViewer({ items, index, onChange, onClose }) {
  const { t } = useI18n();
  const item = items[index];
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowLeft' && index > 0) onChange(index - 1);
      if (event.key === 'ArrowRight' && index < items.length - 1) onChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onChange]);

  if (!item) return null;
  return (
    <Modal title={item.name} onClose={onClose} wide>
      <div className="viewer-stage">
        {item.kind === 'video' ? (
          <video key={item.id} src={mediaUrl(item.id)} controls autoPlay />
        ) : (
          <img key={item.id} src={mediaUrl(item.id)} alt={item.name} />
        )}
      </div>
      <div className="dialog-actions viewer-actions">
        <small>{Format.bytes(item.size)} · {t('media.position', { index: index + 1, total: items.length })}</small>
        <button className="btn btn-ghost" disabled={index === 0} onClick={() => onChange(index - 1)}>‹ {t('common.previous')}</button>
        <button className="btn btn-ghost" disabled={index >= items.length - 1} onClick={() => onChange(index + 1)}>{t('common.next')} ›</button>
        <button className="btn btn-primary" onClick={onClose}>{t('common.close')}</button>
      </div>
    </Modal>
  );
}
