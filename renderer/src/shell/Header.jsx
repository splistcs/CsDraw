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
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M16 2v8M16 22v8M2 16h8M22 16h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="16" cy="16" r="2.5" fill="var(--accent)" />
        </svg>
        <span className="brand-name">CSDraw</span>
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
