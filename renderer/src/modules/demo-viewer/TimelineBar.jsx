import { useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Icon } from '../../shared/ui/Icons.jsx';
import { Format } from '../../shared/utils/format.js';
import { BombFuse } from './core/BombFuse.js';
import { UtilityStyle } from './core/UtilityStyle.js';
import { usePlaybackSnapshot } from './core/usePlaybackSnapshot.js';

const ROUND_SECONDS = 115; // mp_roundtime padrao do competitivo (1:55)

/**
 * Tempo que falta, como no relogio do jogo: no freezetime, o que resta dele; no round, 1:55 menos o decorrido;
 * depois do plantio, o pavio da C4 (o relogio do jogo troca para ele).
 */
function remainingSeconds(round, time) {
  if (time < round.freezeSeconds) return round.freezeSeconds - time;
  const bomb = BombFuse.at(round.bomb, time);
  if (bomb) return bomb.remaining;
  return Math.max(0, ROUND_SECONDS - (time - round.freezeSeconds));
}

/** Barra inferior: play/pause, velocidade, relogio e linha do tempo com fase da bomba, abates e utilidades arremessadas. */
export function TimelineBar({ playback, round, players, includeFreeze }) {
  const { t } = useI18n();
  const { time, min, duration, playing, speed } = usePlaybackSnapshot(playback, 30);
  const trackRef = useRef(null);
  const dragging = useRef(false);
  const span = Math.max(duration - min, 0.001);
  const percent = (value) => Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const planted = round.bomb.find((event) => event.type === 'planted');
  const bombEnd = round.bomb.find((event) => event.type !== 'planted');

  const seekFrom = (event) => {
    const rect = trackRef.current.getBoundingClientRect();
    playback.seek(min + Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * span);
  };

  return (
    <div className="timeline-bar">
      <div className="tl-controls">
        <button className="tl-play" onClick={() => playback.toggle()} aria-label={playing ? t('demo.pause') : t('demo.play')} title={`${playing ? t('demo.pause') : t('demo.play')} (Space)`}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
          <span className="tl-speed">{speed}x</span>
        </button>
        <span className="tl-clock"><Icon name="clock" size={18} />{Format.clock(Math.ceil(remainingSeconds(round, time)))}</span>
      </div>

      <div
        className="tl-track"
        ref={trackRef}
        role="slider"
        aria-label={t('demo.timeline')}
        aria-valuemin={Math.round(min)}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e); }}
        onPointerMove={(e) => dragging.current && seekFrom(e)}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        {includeFreeze && round.freezeSeconds > 0 && <div className="tl-seg freeze" style={{ left: 0, width: `${percent(round.freezeSeconds)}%` }} title={t('demo.freezetime')} />}
        {planted && planted.t >= min && (
          <div className="tl-seg bomb" style={{ left: `${percent(planted.t)}%`, width: `${100 - percent(planted.t)}%` }}>
            <span>{t('demo.bomb')}</span>
          </div>
        )}
        {round.kills.filter((kill) => kill.t >= min).map((kill, i) => (
          <span key={i} className={`tl-mark kill side-${kill.killer !== null && round.sides[kill.killer] === 3 ? 'CT' : 'T'}`} style={{ left: `${percent(kill.t)}%` }} />
        ))}
        {round.grenades.map((grenade, i) => ({ grenade, i, at: grenade.thrownT ?? grenade.t })).filter(({ at }) => at >= min).map(({ grenade, i, at }) => {
          const label = t(`grenade.${UtilityStyle.catalogType(grenade.type, round.sides[grenade.thrower])}`);
          const thrower = grenade.thrower !== null ? players[grenade.thrower]?.name : null;
          return (
            <span
              key={`nade-${i}`} className={`tl-nade nade-${grenade.type}`} style={{ left: `${percent(at)}%`, '--nade-color': UtilityStyle.color(grenade.type) }}
              title={[label, thrower, Format.clock(Math.ceil(remainingSeconds(round, at)))].filter(Boolean).join(' · ')}
            />
          );
        })}
        {planted && planted.t >= min && <span className="tl-icon planted" style={{ left: `${percent(planted.t)}%` }}><Icon name="bomb" size={14} /></span>}
        {bombEnd && <span className={`tl-icon ${bombEnd.type}`} style={{ left: `${percent(bombEnd.t)}%` }}><Icon name={bombEnd.type === 'defused' ? 'shield' : 'bomb'} size={14} /></span>}
        <div className="tl-cursor" style={{ left: `${percent(time)}%` }} />
      </div>
    </div>
  );
}
