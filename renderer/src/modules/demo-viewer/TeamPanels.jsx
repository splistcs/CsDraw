import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { BlindState } from './core/BlindState.js';
import { FrameInterpolator } from './core/FrameInterpolator.js';
import { GrenadeLoadout } from './core/GrenadeLoadout.js';
import { HeldItem } from './core/HeldItem.js';
import { SetposCommand } from './core/SetposCommand.js';
import { UtilityStyle } from './core/UtilityStyle.js';
import { WeaponIcons } from './core/WeaponIcons.js';
import { usePlaybackSnapshot } from './core/usePlaybackSnapshot.js';
import { ArmorBadge } from './ArmorBadge.jsx';
import { IconImage } from './IconImage.jsx';
import { UtilityGlyph } from './UtilityGlyph.jsx';

/**
 * Paineis dos dois times (canto superior direito): vida, arma, dinheiro, colete e granadas.
 * Passar o mouse no nome mostra o comando setpos/setang do jogador naquele instante; clicar copia.
 */
export function TeamPanels({ demo, round, playback }) {
  const { t } = useI18n();
  const { notify } = useFeedback();
  const { time } = usePlaybackSnapshot(playback, 8);
  const [hover, setHover] = useState(null); // { index, right, top } em pixels da janela
  const sampled = new Map(FrameInterpolator.sample(round.frames, time).map((p) => [p.idx, p]));
  const blinded = BlindState.remaining(round.blinds, time);
  const dead = new Set(round.kills.filter((k) => k.t <= time && k.victim !== null).map((k) => k.victim));
  const hasEconomy = demo.features?.economy ?? demo.weapons.length > 0;

  const sideA = round.sideOfTeamA === 'CT' ? 3 : 2;
  const aWon = round.winner === round.sideOfTeamA;
  const startA = round.scoreA - (round.winner && aWon ? 1 : 0);
  const startB = round.scoreB - (round.winner && !aWon ? 1 : 0);

  const showCommand = (event, index) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover({ index, right: window.innerWidth - rect.left + 10, top: rect.top + rect.height / 2 });
  };

  const copyCommand = async (index) => {
    const player = sampled.get(index);
    if (!player) return;
    try {
      await navigator.clipboard.writeText(SetposCommand.format(player));
      notify(t('demo.setposCopied'));
    } catch {
      notify(t('demo.copyFailed'));
    }
  };

  // Municao no carregador da arma que ele tem na mao (so armas de fogo; faca, granada e C4 nao mostram).
  const ammoOf = (p) => (p && p.ammo >= 0 && p.weapon >= 0 && HeldItem.of(demo.weapons[p.weapon]).kind === 'gun' ? p.ammo : null);

  const nades = (packed, side) => GrenadeLoadout.items(packed).flatMap(({ type, count }) => (
    Array.from({ length: count }, (_, n) => (
      <span key={`${type}-${n}`} className="nade" style={{ '--nade-color': UtilityStyle.color(type) }} title={t(`grenade.${UtilityStyle.catalogType(type, side)}`)}>
        <IconImage url={WeaponIcons.grenadeUrl(type, side)} className="nade-img" fallback={<UtilityGlyph type={type} size={16} />} />
      </span>
    ))
  ));

  const team = (side, name, score) => (
    <section className={`team-card side-${side === 3 ? 'CT' : 'T'}`} aria-label={name}>
      <header><strong>{name}</strong><span>{score}</span></header>
      <ul>
        {Object.entries(round.sides).filter(([, s]) => s === side).map(([idx]) => {
          const index = Number(idx);
          const p = sampled.get(index);
          const isDead = dead.has(index) || (p?.hp ?? 0) <= 0;
          const hp = isDead ? 0 : p?.hp ?? 100;
          // Arma do inventario (principal ou pistola); demos antigas so tem a arma na mao.
          const weaponIndex = p ? (p.mainWeapon >= 0 ? p.mainWeapon : p.weapon) : -1;
          const weapon = weaponIndex >= 0 ? demo.weapons[weaponIndex] : '';
          const weaponIcon = weapon ? WeaponIcons.resolve(weapon, side) : null;
          return (
            <li key={index} className={isDead ? 'dead' : ''}>
              <div className="pl-top">
                <button
                  type="button" className="pl-name" aria-label={`${demo.players[index]?.name ?? '?'} — setpos`}
                  onMouseEnter={(e) => showCommand(e, index)} onMouseLeave={() => setHover(null)}
                  onFocus={(e) => showCommand(e, index)} onBlur={() => setHover(null)}
                  onClick={() => copyCommand(index)}
                >
                  {demo.players[index]?.name ?? '?'}
                </button>
                {hasEconomy && (
                  <span className="pl-weapon" title={weapon ? WeaponIcons.label(weapon) : undefined}>
                    {!isDead && weaponIcon && <IconImage url={weaponIcon.url} className="weapon-img" fallback={WeaponIcons.label(weapon)} />}
                  </span>
                )}
                <strong className="pl-hp">{hp}</strong>
              </div>
              <div className="hp-bar"><i style={{ width: `${hp}%` }} /></div>
              {hasEconomy && (
                <div className="pl-bottom">
                  <span>${p?.money ?? 0}</span>
                  {!isDead && (
                    <ArmorBadge
                      armor={p?.armor ?? 0} helmet={Boolean(p?.helmet)}
                      title={`${t((p?.armor ?? 0) > 0 ? (p?.helmet ? 'demo.armorHelmet' : 'demo.armorVest') : 'demo.helmetOnly')}${(p?.armor ?? 0) > 0 ? ` (${p.armor})` : ''}`}
                    />
                  )}
                  {!isDead && ammoOf(p) !== null && (
                    <span className={`pl-ammo${ammoOf(p) === 0 ? ' empty' : ''}`} title={`${t('demo.ammo')}: ${WeaponIcons.label(demo.weapons[p.weapon])}`}>
                      <svg viewBox="0 0 24 24" width="10" height="14" aria-hidden="true"><path d="M8 3h8v3l-1 2v13H9V8L8 6z" fill="currentColor" /></svg>{ammoOf(p)}
                    </span>
                  )}
                  {!isDead && GrenadeLoadout.hasC4(p?.nades) && (
                    <span className="pl-c4" title={t('demo.bombCarrier')} style={{ '--nade-color': UtilityStyle.color('c4') }}>
                      <IconImage url={WeaponIcons.c4Url()} className="c4-img" fallback={<UtilityGlyph type="c4" size={15} />} />
                    </span>
                  )}
                  {!isDead && blinded.has(index) && (
                    <span className="pl-blind" title={t('demo.blinded')} style={{ '--nade-color': UtilityStyle.color('flash') }}>
                      <UtilityGlyph type="flash" size={13} />{blinded.get(index).toFixed(1)}s
                    </span>
                  )}
                  {!isDead && <span className="pl-nades">{nades(p?.nades, side)}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const hovered = hover ? sampled.get(hover.index) : null;

  return (
    <div className="team-panels">
      {team(sideA, demo.teams?.a || t('demo.teamA'), startA)}
      {team(sideA === 3 ? 2 : 3, demo.teams?.b || t('demo.teamB'), startB)}
      {demo.features?.inventory !== true && <p className="team-note">{t('demo.noInventory')}</p>}
      {demo.features?.blinds === false && <p className="team-note">{t('demo.noBlinds')} <small>(player_blind: {demo.features.blindEvents ?? '?'})</small></p>}
      {hover && hovered && createPortal(
        <div className="setpos-tip" role="tooltip" style={{ right: hover.right, top: hover.top }}>
          <code>{SetposCommand.format(hovered)}</code>
          <small>{t('demo.copySetpos')}</small>
        </div>,
        document.body
      )}
    </div>
  );
}
