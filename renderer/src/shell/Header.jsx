import { useI18n } from '../i18n/I18nProvider.jsx';
import { LanguageSelect } from '../i18n/LanguageSelect.jsx';
import { ThemeToggle } from '../shared/ui/ThemeToggle.jsx';
import { HeaderSlot } from './ShellContext.jsx';

export function Header({ onOpenVault, onCheckUpdates, checkingUpdates, version }) {
  const { t } = useI18n();
  const link = (label, mode, title) => (
    <a href="#" className="text-link" title={title} onClick={(e) => { e.preventDefault(); onOpenVault(mode); }}>{label}</a>
  );

  return (
    <header className="header">
      <div className="brand">
        <img className="brand-icon" src="./brand-grenade.png" width="38" height="38" alt="" aria-hidden="true" draggable="false" />
        <span className="brand-name">CsDraw</span>
        <span className="brand-by">by splistcs</span>
      </div>

      <HeaderSlot />

      <div className="header-actions">
        <ThemeToggle />
        <LanguageSelect />
        <span className="auth-links">
          {link(t('header.export'), 'export', t('header.exportTitle'))}
          <span className="separator">·</span>
          {link(t('header.import'), 'import', t('header.importTitle'))}
          <span className="separator">·</span>
          <a href="#" className="text-link" title={t('header.updatesTitle', { version: version ?? '' })} aria-disabled={checkingUpdates} onClick={(e) => { e.preventDefault(); if (!checkingUpdates) onCheckUpdates(); }}>
            {checkingUpdates ? t('update.checking') : t('header.updates')}
          </a>
        </span>
      </div>
    </header>
  );
}
