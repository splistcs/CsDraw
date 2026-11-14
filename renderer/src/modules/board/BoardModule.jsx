import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api } from '../../shared/api/api.js';
import { MapCatalog } from '../../shared/constants/MapCatalog.js';
import { BoardSurface } from '../../shared/drawing/BoardSurface.jsx';
import { MapImageLoader } from '../../shared/drawing/MapImageLoader.js';
import { MapLayout } from '../../shared/drawing/MapLayout.js';
import { Viewport } from '../../shared/drawing/Viewport.js';
import { LibraryEvents } from '../../shared/events/LibraryEvents.js';
import { EmbedTokens } from '../../shared/markdown/EmbedTokens.js';
import { DrawingToolbar, DRAWING_TOOLS, PALETTE } from '../../shared/ui/DrawingToolbar.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { HotkeysDialog } from '../../shared/ui/HotkeysDialog.jsx';
import { Icon } from '../../shared/ui/Icons.jsx';
import { Hotkeys } from '../../shared/utils/Hotkeys.js';
import { TextDownload } from '../../shared/utils/TextDownload.js';
import { useNavigation } from '../../shell/NavigationContext.jsx';
import { HeaderPortal } from '../../shell/ShellContext.jsx';
import { GrenadeTray } from './GrenadeTray.jsx';
import { MapSelect } from './MapSelect.jsx';
import { NotesPanel } from './NotesPanel.jsx';
import { SavedDrawingsSidebar } from './SavedDrawingsSidebar.jsx';
import { StickerDrawer } from './StickerDrawer.jsx';

const NO_FILTERS = () => ({ hiddenTypes: new Set(), hideStrokes: false });

export default function BoardModule({ isActive }) {
  const { params, nonce } = useNavigation();
  const { confirm, notify, askText } = useFeedback();
  const { t, errorMessage, locale } = useI18n();
  const surfaceRef = useRef(null);
  const handledNonce = useRef(0);
  const viewport = useMemo(() => new Viewport(), []);

  const [mapSlug, setMapSlug] = useState(MapCatalog.defaultMap.slug);
  const [tool, setTool] = useState('pen');
  const [pen, setPen] = useState({ color: '#e2a33b', width: 4 });
  const [filters, setFilters] = useState(NO_FILTERS);
  const [armedType, setArmedType] = useState(null);
  const [notes, setNotes] = useState('');
  const [drawingName, setDrawingName] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [stickerId, setStickerId] = useState(null);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [images, setImages] = useState([]);

  const map = MapCatalog.findBySlug(mapSlug);
  const layout = useMemo(() => MapLayout.forMap(map), [map]);
  const labels = useMemo(() => ({ missingRadar: t('board.radarMissing'), levels: [t('level.upper'), t('level.lower')] }), [t]);
  const getBoard = () => surfaceRef.current.getBoard();
  const markDirty = useCallback(() => setIsDirty(true), []);
  const closeDrawer = useCallback(() => setStickerId(null), []);

  useEffect(() => {
    let cancelled = false;
    MapImageLoader.loadLevels(layout).then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, [layout]);

  const handleUndo = useCallback(() => surfaceRef.current?.getBoard()?.undo(), []);
  const handleClear = useCallback(() => {
    if (surfaceRef.current?.getBoard()?.clear()) notify(t('board.cleared'));
  }, [notify, t]);

  const handleFocusLevel = (index) => viewport.fit(index === null ? undefined : MapLayout.levelRect(layout, index));
  const requestText = useCallback(() => askText({ title: t('board.textTitle'), label: t('board.textLabel'), confirmLabel: t('common.add') }), [askText, t]);

  const hotkeyGroups = useMemo(() => [
    { keys: ['Space'], title: t('hotkeys.clear'), text: t('hotkeys.clearBoard') },
    { keys: ['Ctrl', 'Z'], title: t('hotkeys.undo'), text: t('hotkeys.undoText') },
    { keys: ['D'], title: t('hotkeys.draw'), text: t('hotkeys.drawText') },
    { keys: ['M'], title: t('hotkeys.move'), text: t('hotkeys.moveText') },
    { keys: ['E'], title: t('tool.eraser'), text: t('hotkeys.eraserText') },
    { keys: ['T'], title: t('tool.text'), text: t('hotkeys.textText') },
    { keys: ['F'], title: t('hotkeys.fit'), text: t('hotkeys.fitText') },
    { keys: ['+', '-'], title: t('hotkeys.zoom'), text: t('hotkeys.zoomText') },
    { keys: ['H'], title: t('hotkeys.show'), text: t('hotkeys.showText') }
  ], [t]);

  const handleKey = useCallback((event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') { handleUndo(); return true; }
    if (modifier || event.altKey) return false;
    switch (event.code) {
      case 'Space': if (!event.repeat) handleClear(); return true;
      case 'KeyD':
        if (DRAWING_TOOLS.includes(tool) && tool !== 'eraser') {
          const next = (PALETTE.indexOf(pen.color) + (event.shiftKey ? -1 : 1) + PALETTE.length) % PALETTE.length;
          setPen((current) => ({ ...current, color: PALETTE[next] }));
        } else setTool('pen');
        return true;
      case 'KeyM': setTool('pan'); return true;
      case 'KeyE': setTool('eraser'); return true;
      case 'KeyT': setTool('text'); return true;
      case 'KeyH': setHotkeysOpen(true); return true;
      case 'KeyF': viewport.fit(); return true;
      case 'Equal': case 'NumpadAdd': viewport.zoomCentered(1.25); return true;
      case 'Minus': case 'NumpadSubtract': viewport.zoomCentered(1 / 1.25); return true;
      default: return false;
    }
  }, [tool, pen.color, handleUndo, handleClear, viewport]);

  useEffect(() => {
    if (!isActive) return undefined;
    const hotkeys = new Hotkeys(handleKey);
    hotkeys.attach();
    return () => hotkeys.detach();
  }, [isActive, handleKey]);

  const refreshDrawings = useCallback(() => api.drawings.list().then(setDrawings).catch((e) => notify(errorMessage(e))), [notify, errorMessage]);
  useEffect(() => {
    refreshDrawings();
    return LibraryEvents.subscribe(refreshDrawings);
  }, [refreshDrawings]);

  const confirmDiscard = useCallback(
    async () => !isDirty || confirm({ title: t('board.discardTitle'), message: t('board.discardText'), confirmLabel: t('board.discard') }),
    [isDirty, confirm, t]
  );

  const startNewDrawing = () => {
    getBoard().reset();
    setActiveId(null); setDrawingName(''); setNotes(''); setStickerId(null); setIsDirty(false);
  };
  const handleNew = async () => { if (await confirmDiscard()) startNewDrawing(); };

  const handleSelectMap = async (slug) => {
    if (slug === mapSlug || !(await confirmDiscard())) return;
    startNewDrawing();
    setMapSlug(slug);
  };

  const handleSave = async () => {
    const board = getBoard();
    setIsSaving(true);
    try {
      const saved = await api.drawings.save({
        id: activeId,
        name: drawingName.trim() || `${map.name} — ${new Date().toLocaleDateString(locale)}`,
        mapSlug,
        notes,
        thumbnail: board.createThumbnail(),
        ...board.serialize()
      });
      setActiveId(saved.id); setDrawingName(saved.name); setIsDirty(false);
      LibraryEvents.emit();
      notify(t('board.saved.ok'));
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = useCallback(async (id) => {
    if (!(await confirmDiscard())) return;
    try {
      const drawing = await api.drawings.get(id);
      setMapSlug(drawing.mapSlug);
      getBoard().load(drawing);
      viewport.fit();
      setActiveId(drawing.id); setDrawingName(drawing.name); setNotes(drawing.notes); setStickerId(null); setIsDirty(false);
      setIsSidebarOpen(false);
    } catch (error) {
      notify(errorMessage(error));
    }
  }, [confirmDiscard, notify, errorMessage, viewport]);

  useEffect(() => {
    if (params?.drawingId && nonce !== handledNonce.current) {
      handledNonce.current = nonce;
      handleOpen(params.drawingId);
    }
  }, [params, nonce, handleOpen]);

  const handleDelete = async (drawing) => {
    if (!(await confirm({ title: t('board.deleteTitle'), message: t('board.deleteText', { name: drawing.name }), confirmLabel: t('common.delete') }))) return;
    try {
      await api.drawings.remove(drawing.id);
      if (drawing.id === activeId) { setActiveId(null); setIsDirty(true); }
      LibraryEvents.emit();
    } catch (error) {
      notify(errorMessage(error));
    }
  };

  const handleDownloadNotes = () =>
    TextDownload.save(
      `${TextDownload.slugify(drawingName || map.name, 'notes')}.md`,
      `# ${drawingName.trim() || `${t('notes.title')} — ${map.name}`}\n\n**${t('board.map')}:** ${map.name}\n\n---\n\n${EmbedTokens.toPortableText(notes, { drawing: t('embed.drawingLabel'), media: t('embed.mediaLabel'), unnamed: t('embed.unnamed') })}\n`
    );

  return (
    <div className="board-module">
      <SavedDrawingsSidebar
        drawings={drawings} activeId={activeId} name={drawingName}
        onNameChange={(value) => { setDrawingName(value); markDirty(); }}
        onSave={handleSave} onNew={handleNew} onOpen={handleOpen} onDelete={handleDelete}
        isSaving={isSaving} isDirty={isDirty} isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((open) => !open)}
      />

      <main className="stage">
        <div className="board-main">
          <h1 className="map-title">{map.name}{activeId && <span className="editing-badge">{t('board.editingBadge')}</span>}</h1>
          <div className="canvas-frame">
            <BoardSurface
              ref={surfaceRef} viewport={viewport} layout={layout} images={images} labels={labels}
              tool={tool} pen={pen} filters={filters} armedType={armedType}
              onPlaced={() => setArmedType(null)} onChange={markDirty}
              onStickerClick={(sticker) => setStickerId(sticker.id)} onRequestText={requestText}
            />
            <DrawingToolbar
              viewport={viewport} tool={tool} onToolChange={setTool} pen={pen} onPenChange={setPen}
              onUndo={handleUndo} onClear={handleClear} filters={filters} onFiltersChange={setFilters}
              levelCount={layout.levels.length} onFocusLevel={handleFocusLevel}
              extra={<button className="tb-btn" title={t('toolbar.hotkeys')} aria-label={t('toolbar.hotkeys')} onClick={() => setHotkeysOpen(true)}><Icon name="keyboard" /></button>}
            />
          </div>
          <NotesPanel notes={notes} onChange={(value) => { setNotes(value); markDirty(); }} onDownload={handleDownloadNotes} />
        </div>
        <GrenadeTray armedType={armedType} onArm={setArmedType} />
      </main>

      {stickerId && surfaceRef.current && <StickerDrawer board={getBoard()} stickerId={stickerId} onClose={closeDrawer} />}
      <HeaderPortal active={isActive}><MapSelect value={mapSlug} onChange={handleSelectMap} /></HeaderPortal>
      {hotkeysOpen && <HotkeysDialog groups={hotkeyGroups} onClose={() => setHotkeysOpen(false)} />}
    </div>
  );
}
