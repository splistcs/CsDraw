import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GrenadeCatalog } from '../constants/GrenadeCatalog.js';
import { CanvasHost } from './CanvasHost.js';
import { DrawingBoard } from './DrawingBoard.js';

/**
 * Canvas de desenho com pan/zoom: roda do mouse = zoom no cursor; ferramenta "mover" (ou botao do meio)
 * = arrastar. Usado no quadro tatico e como camada de anotacoes sobre o radar do demo viewer.
 */
export const BoardSurface = forwardRef(function BoardSurface(
  {
    viewport, layout, images, labels, tool, pen, filters,
    allowStickers = true, transparent = false, armedType = null,
    onPlaced = () => {}, onChange = () => {}, onStickerClick = () => {}, onRequestText,
    className = '', children
  },
  ref
) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const modeRef = useRef(null);
  const panRef = useRef(null);

  useImperativeHandle(ref, () => ({ getBoard: () => boardRef.current, getViewport: () => viewport }), [viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const board = new DrawingBoard(canvas, viewport, { allowStickers, transparent });
    boardRef.current = board;
    const host = new CanvasHost(canvas, viewport, () => board.render());
    const unsubscribe = viewport.subscribe(() => board.render());
    const onWheel = (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewport.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      unsubscribe();
      host.dispose();
      canvas.removeEventListener('wheel', onWheel);
      boardRef.current = null;
    };
  }, [viewport, allowStickers, transparent]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    board.tool = tool;
    board.pen = pen;
    board.onChange = onChange;
    board.onStickerClick = onStickerClick;
  });

  useEffect(() => { boardRef.current?.setFilters(filters); }, [filters]);
  useEffect(() => { viewport.setWorld(layout.width, layout.height); }, [viewport, layout]);
  useEffect(() => { boardRef.current?.setBackdrop(layout, images, labels); }, [layout, images, labels]);

  const handlePointerDown = (event) => {
    const board = boardRef.current;
    if (event.button === 1 || (event.button === 0 && tool === 'pan')) {
      event.preventDefault();
      // No modo "mover", um clique (sem arrastar) num adesivo abre o menu dele.
      const hit = event.button === 0 ? board.findStickerAt(board.toPoint(event)) : null;
      panRef.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, stickerId: hit?.id ?? null, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('panning');
      return;
    }
    if (event.button !== 0) return;
    const point = board.toPoint(event);
    if (armedType) {
      board.addSticker(armedType, point);
      onPlaced();
      return;
    }
    const mode = board.beginAt(point);
    if (mode === 'text') {
      onRequestText?.(point).then((text) => text && board.addText(point, text));
      return;
    }
    if (!mode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    modeRef.current = mode;
  };

  const handlePointerMove = (event) => {
    const pan = panRef.current;
    if (pan) {
      if (!pan.moved) {
        if (Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) < 4) return;
        pan.moved = true;
        pan.x = event.clientX;
        pan.y = event.clientY;
        return;
      }
      viewport.panBy(event.clientX - pan.x, event.clientY - pan.y);
      pan.x = event.clientX;
      pan.y = event.clientY;
    } else if (modeRef.current) {
      boardRef.current.moveTo(boardRef.current.toPoint(event));
    }
  };

  const handlePointerEnd = (event) => {
    if (panRef.current) {
      const pan = panRef.current;
      panRef.current = null;
      event.currentTarget.classList.remove('panning');
      const sticker = pan.stickerId && !pan.moved ? boardRef.current.getSticker(pan.stickerId) : null;
      if (sticker) onStickerClick(sticker);
    } else if (modeRef.current) {
      modeRef.current = null;
      boardRef.current.end();
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const [prefix, type] = event.dataTransfer.getData('text/plain').split(':');
    if (prefix !== 'grenade' || !GrenadeCatalog.findByType(type)) return;
    boardRef.current.addSticker(type, boardRef.current.toPoint(event));
    onPlaced();
  };

  return (
    <div className={`surface ${className}`}>
      <canvas
        ref={canvasRef}
        className={`surface-canvas tool-${armedType ? 'place' : tool}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
        onDoubleClick={(e) => allowStickers && boardRef.current.removeStickerAt(boardRef.current.toPoint(e))}
        onDragOver={(e) => allowStickers && e.preventDefault()}
        onDrop={allowStickers ? handleDrop : undefined}
      />
      {children}
    </div>
  );
});
