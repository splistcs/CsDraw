import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button className="theme-switch" role="switch" aria-checked={theme === 'dark'} aria-label={t('header.darkTheme')} onClick={toggleTheme}>
      <span aria-hidden="true">☀️</span>
      <span className="track"><span className="knob" /></span>
      <span aria-hidden="true">🌙</span>
    </button>
  );
}
