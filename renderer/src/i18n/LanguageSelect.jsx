import { LOCALES } from './locales/index.js';
import { useI18n } from './I18nProvider.jsx';

/** Menu suspenso de idioma (fica ao lado do interruptor de tema). */
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <select className="lang-select" value={locale} onChange={(e) => setLocale(e.target.value)} aria-label={t('header.language')} title={t('header.language')}>
      {Object.entries(LOCALES).map(([code, { label }]) => <option key={code} value={code}>{label}</option>)}
    </select>
  );
}
