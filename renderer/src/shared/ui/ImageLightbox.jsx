import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Modal } from './Modal.jsx';

export function ImageLightbox({ src, caption, onClose }) {
  const { t } = useI18n();
  return (
    <Modal onClose={onClose} wide>
      <figure className="lightbox">
        <img src={src} alt={caption || t('common.image')} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
      <div className="dialog-actions"><button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button></div>
    </Modal>
  );
}
