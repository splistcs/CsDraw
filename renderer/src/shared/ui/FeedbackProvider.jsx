import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Modal } from './Modal.jsx';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const askText = useCallback(
    ({ title, initial = '', label = '', confirmLabel = null }) =>
      new Promise((resolve) => setDialog({ kind: 'text', title, initial, label, confirmLabel, resolve })),
    []
  );

  const confirm = useCallback(
    ({ title = null, message, confirmLabel = null }) =>
      new Promise((resolve) => setDialog({ kind: 'confirm', title, message, confirmLabel, resolve })),
    []
  );

  const close = (value) => {
    dialog.resolve(value);
    setDialog(null);
  };

  const value = useMemo(() => ({ askText, confirm, notify }), [askText, confirm, notify]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {dialog?.kind === 'text' && <TextDialog dialog={dialog} onClose={close} />}
      {dialog?.kind === 'confirm' && (
        <Modal title={dialog.title ?? t('common.confirm')} onClose={() => close(false)}>
          <p className="dialog-message">{dialog.message}</p>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => close(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={() => close(true)} autoFocus>{dialog.confirmLabel ?? t('common.confirm')}</button>
          </div>
        </Modal>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </FeedbackContext.Provider>
  );
}

function TextDialog({ dialog, onClose }) {
  const { t } = useI18n();
  const [text, setText] = useState(dialog.initial);
  const submit = (event) => {
    event.preventDefault();
    if (text.trim()) onClose(text.trim());
  };
  return (
    <Modal title={dialog.title} onClose={() => onClose(null)}>
      <form onSubmit={submit} className="dialog-form">
        <label className="field">
          {dialog.label}
          <input value={text} onChange={(e) => setText(e.target.value)} autoFocus maxLength={200} />
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(null)}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>{dialog.confirmLabel ?? t('common.ok')}</button>
        </div>
      </form>
    </Modal>
  );
}

export const useFeedback = () => useContext(FeedbackContext);
