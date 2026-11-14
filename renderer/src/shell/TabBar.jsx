import { useI18n } from '../i18n/I18nProvider.jsx';

export function TabBar({ modules, activeTab, onSelect }) {
  const { t } = useI18n();
  return (
    <nav className="tab-bar" role="tablist" aria-label={t('tab.label')}>
      {modules.map((module) => (
        <button key={module.id} role="tab" aria-selected={module.id === activeTab} className="tab" onClick={() => onSelect(module.id)}>
          {t(`tab.${module.id}`)}
        </button>
      ))}
    </nav>
  );
}
