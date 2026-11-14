import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { MapCatalog } from '../../shared/constants/MapCatalog.js';

/** Miniatura do mapa (public/mapicons); se o PNG nao existir, cai para o radar e, por fim, some. */
function MapIcon({ slug }) {
  const [source, setSource] = useState(MapCatalog.iconUrl(slug));
  useEffect(() => setSource(MapCatalog.iconUrl(slug)), [slug]);
  const fallback = () => setSource((current) => (current === MapCatalog.iconUrl(slug) ? MapCatalog.radarUrl(slug) : null));
  return source
    ? <img className="map-option-icon" src={source} alt="" draggable={false} onError={fallback} />
    : <span className="map-option-icon empty" />;
}

/** Menu suspenso de mapas com miniatura (renderizado no centro do cabecalho via HeaderPortal). */
export function MapSelect({ value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  const current = MapCatalog.findBySlug(value);
  const flat = MapCatalog.MAPS;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const choose = (slug) => { setOpen(false); if (slug !== value) onChange(slug); };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    if (event.key === 'Enter' || event.key === ' ') { setOpen(false); return; }
    const index = flat.findIndex((map) => map.slug === value);
    const next = flat[Math.min(flat.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { onChange(next.slug); setTimeout(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }), 0); }
  };

  return (
    <>
      <span className="map-label" id="map-select-label">{t('board.map')}</span>
      <div className="map-select-wrap" ref={ref}>
        <button
          type="button" id="map-select" className="map-select" aria-haspopup="listbox" aria-expanded={open}
          aria-labelledby="map-select-label map-select" onClick={() => setOpen((v) => !v)} onKeyDown={onKeyDown}
        >
          <MapIcon slug={current.slug} />
          <span className="map-select-name">{current.name}</span>
          <span className="map-select-caret" aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="map-select-list" role="listbox" ref={listRef} aria-labelledby="map-select-label">
            {Object.keys(MapCatalog.GROUPS).map((groupKey) => (
              <div key={groupKey} role="group" aria-label={t(`mapGroup.${groupKey}`)}>
                <div className="map-select-group">{t(`mapGroup.${groupKey}`)}</div>
                {MapCatalog.MAPS.filter((map) => map.group === groupKey).map((map) => (
                  <button
                    type="button" key={map.slug} role="option" aria-selected={map.slug === value}
                    className={`map-option${map.slug === value ? ' selected' : ''}`} onClick={() => choose(map.slug)}
                  >
                    <MapIcon slug={map.slug} />
                    <span>{map.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
