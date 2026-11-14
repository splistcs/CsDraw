import { Fragment, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Icon } from '../../shared/ui/Icons.jsx';

/** Seletor de rounds (numeros coloridos pelo lado vencedor; linha pontilhada quando os times trocam de lado). */
export function RoundBar({ rounds, selectedIndex, onSelect }) {
  const { t } = useI18n();
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="round-bar">
      <button className="round-nav" onClick={() => onSelect(selectedIndex - 1)} aria-label={t('demo.prevRound')} title={`${t('demo.prevRound')} (J)`}><Icon name="chevronLeft" /></button>
      <div className="round-scroll" ref={listRef}>
        {rounds.map((round, index) => (
          <Fragment key={round.number}>
            {index > 0 && round.sideOfTeamA !== rounds[index - 1].sideOfTeamA && <span className="halftime" aria-hidden="true" />}
            <button
              className={`round-chip win-${round.winner ?? 'none'}${index === selectedIndex ? ' active' : ''}`}
              onClick={() => onSelect(index)}
              title={`${t('demo.round')} ${round.number} · ${round.winner ?? '?'} · ${t(`reason.${round.reason}`)}`}
            >
              {round.number}
            </button>
          </Fragment>
        ))}
      </div>
      <button className="round-nav" onClick={() => onSelect(selectedIndex + 1)} aria-label={t('demo.nextRound')} title={`${t('demo.nextRound')} (K)`}><Icon name="chevronRight" /></button>
    </div>
  );
}
