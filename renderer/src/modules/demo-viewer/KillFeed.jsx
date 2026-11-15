import { useI18n } from '../../i18n/I18nProvider.jsx';
import { WeaponIcons } from './core/WeaponIcons.js';
import { usePlaybackSnapshot } from './core/usePlaybackSnapshot.js';
import { UtilityGlyph } from './core/UtilityGlyph.js';
import { IconImage } from './IconImage.jsx';

const VISIBLE_SECONDS = 8;
const MAX_ENTRIES = 6;

const MARKS = {
  headshot: 'M12 2a6 6 0 0 0-6 6c0 2.3 1.2 4.1 3 5.2V16h6v-2.8c1.8-1.1 3-2.9 3-5.2a6 6 0 0 0-6-6zM9.3 7.2a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm5.4 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zM9 18h6v2H9z',
  blind: 'M12 5C6.5 5 2.7 8.6 1 12c1.7 3.4 5.5 7 11 7s9.3-3.6 11-7c-1.7-3.4-5.5-7-11-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.3a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM3 3.500 4.500 2 22 19.5 20.5 21z',
  noscope: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 0 1 6 3.4L7.200 18.2A7 7 0 0 1 12 5zm0 14a7 7 0 0 1-6-3.4L16.8 5.8A7 7 0 0 1 12 19z',
  wallbang: 'M2 4h9v5H2zM13 4h9v5h-9zM2 10h4v5H2zM7 10h10v5H7zM18 10h4v5h-4zM2 16h9v5H2zM13 16h9v5h-9z'
};

function Mark({ name, title }) {
  return (
    <svg className="kf-mark" viewBox="0 0 24 24" width="16" height="16" role="img" aria-label={title}>
      <title>{title}</title>
      <path d={MARKS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function KillFeed({ players, round, playback }) {
  const { t } = useI18n();
  const { time } = usePlaybackSnapshot(playback, 8);
  const recent = round.kills.filter((kill) => kill.t <= time && time - kill.t <= VISIBLE_SECONDS).slice(-MAX_ENTRIES);
  if (!recent.length) return null;

  const who = (index, fallback) => ({
    name: (index !== null && index !== undefined ? players[index]?.name : null) ?? fallback ?? '?',
    side: index !== null && index !== undefined && round.sides[index] === 3 ? 'CT' : index !== null && index !== undefined && round.sides[index] === 2 ? 'T' : 'none'
  });

  return (
    <ul className="killfeed" aria-label={t('demo.killfeed')}>
      {recent.map((kill, i) => {
        const killer = kill.killer !== null || kill.killerName ? who(kill.killer, kill.killerName) : null;
        const victim = who(kill.victim, kill.victimName);
        const assister = kill.assister !== undefined || kill.assisterName ? who(kill.assister, kill.assisterName) : null;
        const icon = kill.weapon ? WeaponIcons.resolve(kill.weapon, round.sides[kill.killer] ?? null) : null;
        const suicide = killer && killer.name === victim.name;
        return (
          <li key={`${kill.t}-${kill.victim}-${i}`} className={killer && !suicide && killer.side === victim.side ? 'kf-team' : ''}>
            {killer && !suicide && <span className={`kf-name side-${killer.side}`}>{killer.name}</span>}
            {assister && (
              <>
                {kill.flashAssist
                  ? <IconImage url={WeaponIcons.flashAssistUrl()} className="kf-flash" title={t('demo.kfFlashAssist')} fallback={<span className="kf-plus" title={t('demo.kfFlashAssist')}>⚡+</span>} />
                  : <span className="kf-plus" title={t('demo.kfAssist')}>+</span>}
                <span className={`kf-name side-${assister.side}`}>{assister.name}</span>
              </>
            )}
            {kill.blind && <Mark name="blind" title={t('demo.kfBlind')} />}
            {icon && <IconImage url={icon.url} className="kf-weapon" title={WeaponIcons.label(kill.weapon)} fallback={<span className="kf-text">{WeaponIcons.label(kill.weapon)}</span>} />}
            {kill.noScope && <Mark name="noscope" title={t('demo.kfNoScope')} />}
            {kill.throughSmoke && (
              <svg className="kf-mark" viewBox="0 0 24 24" width="16" height="16" role="img" aria-label={t('demo.kfSmoke')}>
                <title>{t('demo.kfSmoke')}</title>
                <path d={UtilityGlyph.PATHS.smoke} fill="currentColor" />
              </svg>
            )}
            {kill.wallbang && <Mark name="wallbang" title={t('demo.kfWallbang')} />}
            {kill.headshot && <IconImage url={WeaponIcons.headshotUrl()} className="kf-headshot" title={t('demo.headshot')} fallback={<Mark name="headshot" title={t('demo.headshot')} />} />}
            <span className={`kf-name side-${victim.side}`}>{victim.name}</span>
          </li>
        );
      })}
    </ul>
  );
}
