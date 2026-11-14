import { useI18n } from '../../i18n/I18nProvider.jsx';
import { GrenadeCatalog } from '../../shared/constants/GrenadeCatalog.js';
import { GrenadeIcon } from '../../shared/drawing/GrenadeIcon.jsx';

export function GrenadeTray({ armedType, onArm }) {
  const { t } = useI18n();
  return (
    <section className="tray" aria-label={t('board.grenades')}>
      <h2 className="tray-title">{t('board.grenades')}</h2>
      <div className="magnets">
        {GrenadeCatalog.GRENADES.map((grenade) => (
          <button
            key={grenade.type}
            className={`magnet${armedType === grenade.type ? ' armed' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', `grenade:${grenade.type}`)}
            onClick={() => onArm(armedType === grenade.type ? null : grenade.type)}
            aria-pressed={armedType === grenade.type}
            title={t('board.trayTip')}
          >
            <span className="magnet-face" style={{ background: grenade.color }}><GrenadeIcon grenade={grenade} /></span>
            <span className="magnet-label">{t(`grenade.${grenade.type}`)}</span>
          </button>
        ))}
      </div>
      <p className="tray-hint">{t('board.trayHint')}</p>
    </section>
  );
}
