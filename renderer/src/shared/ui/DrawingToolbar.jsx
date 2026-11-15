import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { GrenadeCatalog } from '../constants/GrenadeCatalog.js';
import { GrenadeIcon } from '../drawing/GrenadeIcon.jsx';
import { Icon } from './Icons.jsx';

export const PALETTE = ['#ffffff', '#e2a33b', '#e5484d', '#46a758', '#3e8ef7', '#ffd60a', '#b04fe0', '#000000'];
export const DRAWING_TOOLS = ['pen', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text', 'eraser'];

function useZoomPercent(viewport) {
  const [percent, setPercent] = useState(viewport.zoomPercent);
  useEffect(() => {
    setPercent(viewport.zoomPercent);
    return viewport.subscribe(() => setPercent(viewport.zoomPercent));
  }, [viewport]);
  return percent;
}

export function DrawingToolbar({
  viewport, tool, onToolChange, pen, onPenChange, onUndo, onClear,
  filters = null, onFiltersChange, levelCount = 1, onFocusLevel, extra = null
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(null);
  const rootRef = useRef(null);
  const zoom = useZoomPercent(viewport);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const toggle = (name) => setOpen((current) => (current === name ? null : name));
  const button = (icon, title, onClick, active = false) => (
    <button className={`tb-btn${active ? ' active' : ''}`} title={title} aria-label={title} aria-pressed={active || undefined} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
  const toggleType = (type) => {
    const hiddenTypes = new Set(filters.hiddenTypes);
    if (hiddenTypes.has(type)) hiddenTypes.delete(type); else hiddenTypes.add(type);
    onFiltersChange({ ...filters, hiddenTypes });
  };
  const filtersActive = filters && (filters.hiddenTypes.size > 0 || filters.hideStrokes);

  return (
    <div className="draw-toolbar" role="toolbar" aria-label={t('toolbar.label')} ref={rootRef}>
      {button('pan', t('tool.pan'), () => onToolChange('pan'), tool === 'pan')}
      <span className="tb-sep" />
      {DRAWING_TOOLS.map((id) => button(id, t(`tool.${id}`), () => onToolChange(id), tool === id))}
      <span className="tb-sep" />

      <button className="tb-btn" title={t('toolbar.color')} aria-label={t('toolbar.color')} onClick={() => toggle('color')}>
        <span className="tb-swatch" style={{ background: pen.color }} />
      </button>
      <button className="tb-btn" title={t('toolbar.width')} aria-label={t('toolbar.width')} onClick={() => toggle('width')}>
        <span className="tb-width"><i style={{ width: Math.min(18, pen.width + 2), height: Math.min(18, pen.width + 2), background: pen.color }} /></span>
      </button>
      <span className="tb-sep" />
      {button('undo', t('toolbar.undo'), onUndo)}
      {button('trash', t('toolbar.clear'), onClear)}
      <span className="tb-sep" />
      {button('minus', t('toolbar.zoomOut'), () => viewport.zoomCentered(1 / 1.25))}
      <button className="tb-zoom" title={t('toolbar.fit')} onClick={() => viewport.fit()}>{zoom}%</button>
      {button('plus', t('toolbar.zoomIn'), () => viewport.zoomCentered(1.25))}
      {button('fit', t('toolbar.fit'), () => viewport.fit())}
      {levelCount > 1 && button('layers', t('toolbar.levels'), () => toggle('levels'), open === 'levels')}
      {filters && (
        <span className="tb-with-dot">
          {button('filter', t('toolbar.filters'), () => toggle('filters'), open === 'filters')}
          {filtersActive && <i className="tb-dot" />}
        </span>
      )}
      {extra}

      {open === 'color' && (
        <div className="tb-popover">
          <div className="tb-palette">
            {PALETTE.map((color) => (
              <button key={color} className={`swatch${pen.color === color ? ' selected' : ''}`} style={{ background: color }} aria-label={color} onClick={() => onPenChange({ ...pen, color })} />
            ))}
          </div>
          <label className="tb-row">{t('toolbar.customColor')}<input type="color" value={pen.color} onChange={(e) => onPenChange({ ...pen, color: e.target.value })} /></label>
        </div>
      )}
      {open === 'width' && (
        <div className="tb-popover">
          <label className="tb-row">{t('toolbar.width')}<input type="range" min="1" max="24" value={pen.width} onChange={(e) => onPenChange({ ...pen, width: Number(e.target.value) })} /><span>{pen.width}</span></label>
        </div>
      )}
      {open === 'levels' && (
        <div className="tb-popover">
          <button className="btn btn-ghost" onClick={() => onFocusLevel(null)}>{t('toolbar.fitAll')}</button>
          <button className="btn btn-ghost" onClick={() => onFocusLevel(0)}>{t('level.upper')}</button>
          <button className="btn btn-ghost" onClick={() => onFocusLevel(1)}>{t('level.lower')}</button>
        </div>
      )}
      {open === 'filters' && filters && (
        <div className="tb-popover tb-filters">
          <strong>{t('toolbar.grenadesShown')}</strong>
          {GrenadeCatalog.GRENADES.map((grenade) => (
            <label key={grenade.type} className="tb-check">
              <input type="checkbox" checked={!filters.hiddenTypes.has(grenade.type)} onChange={() => toggleType(grenade.type)} />
              <span className="tb-chip" style={{ background: grenade.color }}><GrenadeIcon grenade={grenade} /></span>
              {t(`grenade.${grenade.type}`)}
            </label>
          ))}
          <label className="tb-check">
            <input type="checkbox" checked={!filters.hideStrokes} onChange={() => onFiltersChange({ ...filters, hideStrokes: !filters.hideStrokes })} />
            {t('toolbar.drawingsShown')}
          </label>
          <button className="btn btn-ghost" disabled={!filtersActive} onClick={() => onFiltersChange({ hiddenTypes: new Set(), hideStrokes: false })}>{t('toolbar.resetFilters')}</button>
        </div>
      )}
    </div>
  );
}
