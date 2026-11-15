import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { api } from '../shared/api/api.js';
import { LibraryEvents } from '../shared/events/LibraryEvents.js';
import { useFeedback } from '../shared/ui/FeedbackProvider.jsx';
import { Modal } from '../shared/ui/Modal.jsx';

export function VaultDialog({ mode, onClose }) {
  const { notify, confirm } = useFeedback();
  const { t, errorMessage } = useI18n();
  const isExport = mode === 'export';
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [importMode, setImportMode] = useState('merge');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => { api.vault.status().then(setStatus).catch(() => {}); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (isExport && passphrase !== repeat) return setError(t('vault.mismatch'));
    if (!isExport && importMode === 'replace') {
      const ok = await confirm({ title: t('vault.replaceTitle'), message: t('vault.replaceText'), confirmLabel: t('vault.replace') });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const dialogTitle = isExport ? t('vault.exportDialog') : t('vault.importDialog');
      const result = isExport ? await api.vault.exportVault(passphrase, dialogTitle) : await api.vault.importVault(passphrase, importMode, dialogTitle);
      if (result.canceled) return;
      if (!isExport) LibraryEvents.emit();
      const c = result.counts;
      notify(t(isExport ? 'vault.exported' : 'vault.imported', { drawings: c.drawings, playbooks: c.playbooks, folders: c.folders, media: c.media, demos: c.demos }));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isExport ? t('vault.exportTitle') : t('vault.importTitle')} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <p className="dialog-message">{isExport ? t('vault.exportText') : t('vault.importText')}</p>
        <label className="field">
          {t('vault.passphrase')}
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} minLength={isExport ? 8 : 1} required autoFocus autoComplete="off" />
          {isExport && <small>{t('vault.minLength')}</small>}
        </label>
        {isExport && (
          <label className="field">
            {t('vault.repeat')}
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="off" />
          </label>
        )}
        {!isExport && (
          <fieldset className="radio-group">
            <legend>{t('vault.onImport')}</legend>
            <label><input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} /> {t('vault.merge')}</label>
            <label><input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /> {t('vault.replaceAll')}</label>
          </fieldset>
        )}
        {status && <small className="vault-status">{t('vault.status', { path: status.dataPath, protection: status.isOsProtected ? t('vault.protected') : t('vault.unprotected') })}</small>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('common.wait') : isExport ? t('vault.exportGo') : t('vault.importGo')}</button>
        </div>
      </form>
    </Modal>
  );
}
