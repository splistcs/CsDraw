import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Modal } from './Modal.jsx';

export function HotkeysDialog({ groups, onClose }) {
  const { t } = useI18n();
  return (
    <Modal title={t('hotkeys.title')} onClose={onClose} wide>
      <div className="hotkeys-grid">
        {groups.map((group) => (
          <div className="hotkey" key={group.title}>
            <div className="hotkey-head"><strong>{group.title}</strong>{group.keys.map((key) => <kbd key={key}>{key}</kbd>)}</div>
            <p>{group.text}</p>
          </div>
        ))}
      </div>
      <div className="dialog-actions"><button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button></div>
    </Modal>
  );
}
