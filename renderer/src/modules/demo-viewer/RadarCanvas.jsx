import { useCallback, useEffect, useRef } from 'react';
import { CanvasHost } from '../../shared/drawing/CanvasHost.js';
import { IconLibrary } from './core/IconLibrary.js';
import { RadarRenderer } from './core/RadarRenderer.js';

export function RadarCanvas({ viewport, layout, images, projection, demo, round, playback, showNames, labels, options }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    RadarRenderer.draw(canvas.getContext('2d'), { viewport, layout, images, projection, round, time: playback.time, players: demo.players, weapons: demo.weapons, showNames, labels, options });
  }, [viewport, layout, images, projection, round, playback, demo.players, demo.weapons, showNames, labels, options]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const host = new CanvasHost(canvasRef.current, viewport, () => drawRef.current(), { driveViewport: false });
    return () => host.dispose();
  }, [viewport]);

  useEffect(() => {
    draw();
    const stopPlayback = playback.subscribe(draw);
    const stopViewport = viewport.subscribe(draw);
    const stopIcons = IconLibrary.subscribe(draw);
    return () => { stopPlayback(); stopViewport(); stopIcons(); };
  }, [draw, playback, viewport]);

  return <canvas ref={canvasRef} className="radar-canvas" />;
}
