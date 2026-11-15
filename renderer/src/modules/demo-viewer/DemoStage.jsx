import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { MapCatalog } from '../../shared/constants/MapCatalog.js';
import { BoardSurface } from '../../shared/drawing/BoardSurface.jsx';
import { MapImageLoader } from '../../shared/drawing/MapImageLoader.js';
import { MapLayout } from '../../shared/drawing/MapLayout.js';
import { Viewport } from '../../shared/drawing/Viewport.js';
import { DrawingToolbar, DRAWING_TOOLS, PALETTE } from '../../shared/ui/DrawingToolbar.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { HotkeysDialog } from '../../shared/ui/HotkeysDialog.jsx';
import { Icon } from '../../shared/ui/Icons.jsx';
import { Hotkeys } from '../../shared/utils/Hotkeys.js';
import { DemoPlayback } from './core/DemoPlayback.js';
import { CalibrationFit } from './core/CalibrationFit.js';
import { MapCalibration } from './core/MapCalibration.js';
import { RadarProjection } from './core/RadarProjection.js';
import { WalkMask } from './core/WalkMask.js';
import { BRIGHTNESS_RANGE, DEFAULT_BRIGHTNESS } from './core/RadarRenderer.js';
import { KillFeed } from './KillFeed.jsx';
import { RadarCanvas } from './RadarCanvas.jsx';
import { RoundBar } from './RoundBar.jsx';
import { TeamPanels } from './TeamPanels.jsx';
import { TimelineBar } from './TimelineBar.jsx';

const NO_IMAGES = [];
const BRIGHTNESS_KEY = 'csdraw.demo.brightness.v2';

function loadBrightness() {
  try {
    const value = Number(window.localStorage.getItem(BRIGHTNESS_KEY));
    return Number.isFinite(value) && value >= BRIGHTNESS_RANGE.min && value <= BRIGHTNESS_RANGE.max ? value : DEFAULT_BRIGHTNESS;
  } catch {
    return DEFAULT_BRIGHTNESS;
  }
}
const NO_FILTERS = { hiddenTypes: new Set(), hideStrokes: false };

export function DemoStage({ demo, entry, onBack, isActive }) {
  const { t } = useI18n();
  const { askText } = useFeedback();
  const viewport = useMemo(() => new Viewport(), []);
  const playback = useMemo(() => new DemoPlayback(), []);
  const surfaceRef = useRef(null);
  const resumeRef = useRef(false);
  const includeFreezeRef = useRef(false);

  const [roundIndex, setRoundIndex] = useState(0);
  const [showNames, setShowNames] = useState(true);
  const [autoFit, setAutoFit] = useState(false);
  const [includeFreeze, setIncludeFreeze] = useState(false);
  const [splitLevels, setSplitLevels] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showDropped, setShowDropped] = useState(true);
  const [showKillfeed, setShowKillfeed] = useState(true);
  const [brightness, setBrightness] = useState(loadBrightness);
  const [focusedLevel, setFocusedLevel] = useState(0);
  const [tool, setTool] = useState('pan');
  const [pen, setPen] = useState({ color: '#e2a33b', width: 4 });
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [images, setImages] = useState(NO_IMAGES);

  const round = demo.rounds[roundIndex];
  const mapEntry = useMemo(() => MapCatalog.tryFind(demo.map.slug) ?? { slug: demo.map.slug, name: demo.map.name || demo.map.slug, lowerLevel: false }, [demo.map]);
  const known = MapCalibration.find(demo.map.slug);
  const [baseImage, setBaseImage] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setBaseImage(null);
    MapImageLoader.load(demo.map.slug).then((image) => { if (!cancelled) setBaseImage(image); });
    return () => { cancelled = true; };
  }, [demo.map.slug]);
  const alignment = useMemo(() => {
    const points = CalibrationFit.samples(demo);
    const mask = WalkMask.from(baseImage);
    const fitted = mask ? CalibrationFit.fit(mask, points) : null;
    if (!fitted) return { calibration: null, lowerZ: null, points };
    const trusted = known && CalibrationFit.score(mask, points, known) >= 0.6;
    return { calibration: trusted ? null : fitted, lowerZ: null, points };
  }, [demo, baseImage, known]);
  const lowerZ = useMemo(() => (mapEntry.lowerLevel && MapCalibration.lowerLevelZ(demo.map.slug) === null ? CalibrationFit.lowerLevelZ(alignment.points) : null), [mapEntry, demo.map.slug, alignment.points]);
  const calibrated = !autoFit && (known !== null || alignment.calibration !== null);
  const hasLevels = calibrated && Boolean(mapEntry.lowerLevel) && (MapCalibration.lowerLevelZ(demo.map.slug) !== null || lowerZ !== null);
  const layout = useMemo(() => MapLayout.forMap({ ...mapEntry, lowerLevel: hasLevels }), [mapEntry, hasLevels]);
  const projection = useMemo(() => new RadarProjection({ slug: demo.map.slug, bounds: demo.bounds, layout, autoFit, calibration: alignment.calibration, lowerZ }), [demo, layout, autoFit, alignment.calibration, lowerZ]);
  const radarOptions = useMemo(() => ({ trajectories: showTrajectories, dropped: showDropped, brightness }), [showTrajectories, showDropped, brightness]);
  const labels = useMemo(() => ({ missingRadar: '', levels: [t('level.upper'), t('level.lower')] }), [t]);

  includeFreezeRef.current = includeFreeze;
  const changeBrightness = (value) => {
    setBrightness(value);
    try { window.localStorage.setItem(BRIGHTNESS_KEY, String(value)); } catch { }
  };
  useEffect(() => { viewport.setInsets({ right: window.innerWidth < 900 ? 230 : 310, bottom: 112 }); }, [viewport]);
  useEffect(() => () => playback.dispose(), [playback]);
  useEffect(() => { if (!isActive) playback.pause(); }, [isActive, playback]);

  useEffect(() => {
    let cancelled = false;
    MapImageLoader.loadLevels(layout).then((loaded) => { if (!cancelled) setImages(loaded); });
    return () => { cancelled = true; };
  }, [layout]);

  useEffect(() => {
    playback.load(round.durationSeconds, { min: includeFreezeRef.current ? 0 : round.freezeSeconds });
    if (resumeRef.current) { resumeRef.current = false; playback.play(); }
  }, [round, playback]);

  useEffect(() => { playback.setMin(includeFreeze ? 0 : round.freezeSeconds); }, [includeFreeze, round, playback]);

  useEffect(() => {
    playback.onEnded = () => {
      if (roundIndex >= demo.rounds.length - 1) return;
      resumeRef.current = true;
      setRoundIndex(roundIndex + 1);
    };
  }, [demo, roundIndex, playback]);

  useEffect(() => {
    if (layout.levels.length > 1 && !splitLevels) viewport.fit(MapLayout.levelRect(layout, focusedLevel));
    else viewport.fit();
  }, [layout, splitLevels, focusedLevel, viewport]);

  const selectRound = useCallback((index) => setRoundIndex(Math.min(demo.rounds.length - 1, Math.max(0, index))), [demo.rounds.length]);
  const requestText = useCallback(() => askText({ title: t('board.textTitle'), label: t('board.textLabel'), confirmLabel: t('common.add') }), [askText, t]);
  const handleFocusLevel = (index) => {
    if (index === null) { setSplitLevels(true); return; }
    setSplitLevels(false);
    setFocusedLevel(index);
  };

  const hotkeyGroups = useMemo(() => [
    { keys: ['H'], title: t('hotkeys.show'), text: t('hotkeys.showText') },
    { keys: ['Space'], title: t('hotkeys.playPause'), text: t('hotkeys.playPauseText') },
    { keys: ['←', '→'], title: t('hotkeys.timeline'), text: t('hotkeys.timelineText') },
    { keys: ['Shift', '↑', '↓'], title: t('hotkeys.speed'), text: t('hotkeys.speedText') },
    { keys: ['J', 'K'], title: t('hotkeys.rounds'), text: t('hotkeys.roundsText') },
    { keys: ['D'], title: t('hotkeys.draw'), text: t('hotkeys.drawModeText') },
    { keys: ['M'], title: t('hotkeys.move'), text: t('hotkeys.moveText') },
    { keys: ['C'], title: t('hotkeys.clearDrawing'), text: t('hotkeys.clearDrawingText') },
    { keys: ['L'], title: t('hotkeys.layer'), text: t('hotkeys.layerText') },
    { keys: ['F'], title: t('hotkeys.freeze'), text: t('hotkeys.freezeText') },
    { keys: ['Ctrl', 'Z'], title: t('hotkeys.undo'), text: t('hotkeys.undoText') },
    { keys: ['+', '-'], title: t('hotkeys.zoom'), text: t('hotkeys.zoomText') }
  ], [t]);

  const handleKey = useCallback((event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (event.altKey) return false;
    if (modifier && !event.shiftKey && event.code === 'KeyZ') { surfaceRef.current?.getBoard()?.undo(); return true; }
    switch (event.code) {
      case 'Space': if (modifier) return false; playback.toggle(); return true;
      case 'ArrowLeft': case 'ArrowRight': {
        const step = modifier ? 0.1 : event.shiftKey ? 1 : 5;
        playback.seek(playback.time + (event.code === 'ArrowLeft' ? -step : step));
        return true;
      }
      case 'ArrowUp': case 'ArrowDown':
        if (!event.shiftKey) return false;
        playback.stepSpeed(event.code === 'ArrowUp' ? 1 : -1);
        return true;
      case 'KeyJ': selectRound(roundIndex - 1); return true;
      case 'KeyK': selectRound(roundIndex + 1); return true;
      case 'KeyD':
        if (modifier) return false;
        if (DRAWING_TOOLS.includes(tool) && tool !== 'eraser') {
          const next = (PALETTE.indexOf(pen.color) + (event.shiftKey ? -1 : 1) + PALETTE.length) % PALETTE.length;
          setPen((current) => ({ ...current, color: PALETTE[next] }));
        } else setTool('pen');
        return true;
      case 'KeyM': setTool('pan'); return true;
      case 'KeyC': surfaceRef.current?.getBoard()?.clear(); return true;
      case 'KeyL': if (layout.levels.length > 1 && !splitLevels) setFocusedLevel((level) => 1 - level); return true;
      case 'KeyF': setIncludeFreeze((value) => !value); return true;
      case 'KeyH': setHotkeysOpen(true); return true;
      case 'Equal': case 'NumpadAdd': viewport.zoomCentered(1.25); return true;
      case 'Minus': case 'NumpadSubtract': viewport.zoomCentered(1 / 1.25); return true;
      default: return false;
    }
  }, [playback, roundIndex, selectRound, tool, pen.color, layout, splitLevels, viewport]);

  useEffect(() => {
    if (!isActive) return undefined;
    const hotkeys = new Hotkeys(handleKey);
    hotkeys.attach();
    return () => hotkeys.detach();
  }, [isActive, handleKey]);

  const check = (label, checked, onChange, title) => (
    <label className="tb-check" title={title}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
  );

  return (
    <div className="demo-stage">
      <RadarCanvas viewport={viewport} layout={layout} images={images} projection={projection} demo={demo} round={round} playback={playback} showNames={showNames} labels={labels} options={radarOptions} />
      <BoardSurface
        ref={surfaceRef} className="annotation-layer" viewport={viewport} layout={layout} images={NO_IMAGES} labels={labels}
        tool={tool} pen={pen} filters={NO_FILTERS} allowStickers={false} transparent onRequestText={requestText}
      />

      <div className="hud hud-top-left">
        <button className="hud-btn" onClick={onBack}><Icon name="back" size={16} />{t('demo.back')}</button>
        <span className="hud-chip">{mapEntry.name} · {entry.name}</span>
      </div>
      {showKillfeed && <div className="hud hud-killfeed"><KillFeed players={demo.players} round={round} playback={playback} /></div>}
      <div className="hud hud-top-right"><TeamPanels demo={demo} round={round} playback={playback} /></div>

      <div className="hud hud-tools">
        {settingsOpen && (
          <div className="tb-popover stage-settings">
            {check(t('demo.showNames'), showNames, setShowNames)}
            {check(t('demo.freezetimeOption'), includeFreeze, setIncludeFreeze, 'F')}
            {check(t('demo.showTrajectories'), showTrajectories, setShowTrajectories)}
            {check(t('demo.showDropped'), showDropped, setShowDropped)}
            {check(t('demo.showKillfeed'), showKillfeed, setShowKillfeed)}
            <label className="tb-range">
              <span>{t('demo.brightness')} <b>{Math.round(brightness * 100)}%</b></span>
              <input type="range" min={BRIGHTNESS_RANGE.min} max={BRIGHTNESS_RANGE.max} step="0.05" value={brightness} onChange={(e) => changeBrightness(Number(e.target.value))} />
            </label>
            {check(t('demo.autoFit'), autoFit, setAutoFit, t('demo.autoFitTip'))}
            {hasLevels && check(t('demo.splitLevels'), splitLevels, setSplitLevels, 'L')}
            {!calibrated && !autoFit && <small>{t('demo.noCalibration')}</small>}
            {projection.isApproximate && !autoFit && <small>{t('demo.approxCalibration')}</small>}
          </div>
        )}
        <DrawingToolbar
          viewport={viewport} tool={tool} onToolChange={setTool} pen={pen} onPenChange={setPen}
          onUndo={() => surfaceRef.current?.getBoard()?.undo()} onClear={() => surfaceRef.current?.getBoard()?.clear()}
          levelCount={layout.levels.length} onFocusLevel={handleFocusLevel}
          extra={(
            <>
              <span className="tb-sep" />
              <button className={`tb-btn${settingsOpen ? ' active' : ''}`} title={t('demo.settings')} aria-label={t('demo.settings')} onClick={() => setSettingsOpen((open) => !open)}><Icon name="gear" /></button>
              <button className="tb-btn" title={`${t('toolbar.hotkeys')} (H)`} aria-label={t('toolbar.hotkeys')} onClick={() => setHotkeysOpen(true)}><Icon name="keyboard" /></button>
            </>
          )}
        />
      </div>

      <div className="hud hud-bottom">
        <RoundBar rounds={demo.rounds} selectedIndex={roundIndex} onSelect={selectRound} />
        <TimelineBar playback={playback} round={round} players={demo.players} includeFreeze={includeFreeze} />
      </div>
      {hotkeysOpen && <HotkeysDialog groups={hotkeyGroups} onClose={() => setHotkeysOpen(false)} />}
    </div>
  );
}
