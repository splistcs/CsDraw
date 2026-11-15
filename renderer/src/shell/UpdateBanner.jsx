import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { api } from '../shared/api/api.js';

export function UpdateBanner({ updates }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState('');
  if (!updates) return null;

  const { status, version, percent, releasesUrl } = updates;
  const key = `${status}:${version}`;
  if (dismissed === key) return null;
  const dismiss = () => setDismissed(key);

  if (status === 'downloading' && version) {
    return (
      <div className="update-banner" role="status">
        <span>{t('update.downloading', { version, percent })}</span>
        <progress max="100" value={percent} aria-hidden="true" />
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="update-banner" role="status">
        <span>{t('update.ready', { version })}</span>
        <div className="update-actions">
          <button className="btn btn-ghost" onClick={dismiss}>{t('update.later')}</button>
          <button className="btn btn-primary" onClick={() => api.updates.install().catch(() => {})}>{t('update.restart')}</button>
        </div>
      </div>
    );
  }

  if (status === 'error' && version) {
    return (
      <div className="update-banner" role="alert">
        <span>{t('update.installFailed', { version })}</span>
        <div className="update-actions">
          <button className="btn btn-ghost" onClick={dismiss}>{t('common.close')}</button>
          {releasesUrl && <button className="btn btn-primary" onClick={() => api.updates.openReleases().catch(() => {})}>{t('update.manual')}</button>}
        </div>
      </div>
    );
  }

  return null;
}
