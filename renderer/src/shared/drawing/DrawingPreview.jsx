import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { MapCatalog } from '../constants/MapCatalog.js';
import { CanvasHost } from './CanvasHost.js';
import { DrawingBoard } from './DrawingBoard.js';
import { MapImageLoader } from './MapImageLoader.js';
import { MapLayout } from './MapLayout.js';
import { Viewport } from './Viewport.js';

export function DrawingPreview({ drawing, className = 'drawing-preview' }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const layout = useMemo(() => MapLayout.forMap(MapCatalog.findBySlug(drawing.mapSlug)), [drawing.mapSlug]);
  const labels = useMemo(() => ({ missingRadar: t('board.radarMissing'), levels: [t('level.upper'), t('level.lower')] }), [t]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const viewport = new Viewport();
    viewport.setWorld(layout.width, layout.height);
    const board = new DrawingBoard(canvas, viewport);
    const host = new CanvasHost(canvas, viewport, () => board.render());
    board.setBackdrop(layout, layout.levels.map(() => null), labels);
    board.load(drawing);
    MapImageLoader.loadLevels(layout).then((images) => {
      if (!cancelled) board.setBackdrop(layout, images, labels);
    });
    return () => { cancelled = true; host.dispose(); };
  }, [drawing, layout, labels]);

  return <canvas ref={canvasRef} className={className} style={{ aspectRatio: `${layout.width} / ${layout.height}` }} aria-label={drawing.name} />;
}
