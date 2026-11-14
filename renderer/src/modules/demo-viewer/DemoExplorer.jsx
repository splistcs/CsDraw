import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api } from '../../shared/api/api.js';
import { MapCatalog } from '../../shared/constants/MapCatalog.js';
import { Icon } from '../../shared/ui/Icons.jsx';
import { Format } from '../../shared/utils/format.js';

const scoreClass = (mine, other) => (mine > other ? 'win' : mine < other ? 'lose' : 'draw');
const SORTERS = {
  uploadedDesc: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
  uploadedAsc: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt),
  map: (a, b) => a.mapName.localeCompare(b.mapName) || b.uploadedAt.localeCompare(a.uploadedAt),
  name: (a, b) => a.name.localeCompare(b.name)
};

function RowMenu({ onRename, onDelete }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <span className="row-menu" ref={ref}>
      <button className="icon-button" onClick={() => setOpen((v) => !v)} aria-label={t('demo.moreActions')}><Icon name="more" /></button>
      {open && (
        <div className="row-menu-list" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); onRename(); }}>{t('common.rename')}</button>
          <button role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(); }}>{t('common.delete')}</button>
        </div>
      )}
    </span>
  );
}

function DemoRow({ entry, onOpen, onRename, onAddTag, onRemoveTag, onDelete }) {
  const { t, locale } = useI18n();
  const mapName = MapCatalog.tryFind(entry.mapSlug)?.name ?? (entry.mapName || entry.mapSlug);
  return (
    <div className="demo-row">
      <button className="demo-thumb" style={{ '--map-radar': `url("${MapCatalog.radarUrl(entry.mapSlug)}")` }} onClick={() => onOpen(entry.id)}>
        <span className="demo-thumb-date">{new Date(entry.uploadedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
        <strong>{mapName}</strong>
      </button>
      <div className="demo-score">
        <span className={scoreClass(entry.scoreA, entry.scoreB)}>{entry.scoreA}</span>
        <span className={scoreClass(entry.scoreB, entry.scoreA)}>{entry.scoreB}</span>
      </div>
      <div className="demo-teams">
        <span className={`team-name ${scoreClass(entry.scoreA, entry.scoreB)}`}>{entry.teamA || t('demo.teamA')}</span>
        <span className={`team-name ${scoreClass(entry.scoreB, entry.scoreA)}`}>{entry.teamB || t('demo.teamB')}</span>
        <small title={entry.name}>{entry.name} · {t('demo.rounds', { count: entry.roundCount })} · {Format.bytes(entry.fileSize)}</small>
      </div>
      <div className="demo-tags">
        {entry.tags.map((tag) => (
          <span key={tag} className="tag-chip">{tag}<button onClick={() => onRemoveTag(entry, tag)} aria-label={t('demo.removeTag', { tag })}>✕</button></span>
        ))}
        <button className="tag-add" onClick={() => onAddTag(entry)}>+ {t('demo.addTag')}</button>
      </div>
      <div className="demo-actions">
        <button className="btn-2d" onClick={() => onOpen(entry.id)}><Icon name="play" size={14} /> 2D</button>
        <RowMenu onRename={() => onRename(entry)} onDelete={() => onDelete(entry)} />
      </div>
    </div>
  );
}

/** Biblioteca de demos (estilo explorer): filtros, ordenacao, tags, arrastar para importar. */
export function DemoExplorer({ entries, progress, onFiles, onImportPaths, onOpen, onRename, onAddTag, onRemoveTag, onDelete, onCancel }) {
  const { t, locale } = useI18n();
  const [mapFilter, setMapFilter] = useState('all');
  const [sort, setSort] = useState('uploadedDesc');
  const [query, setQuery] = useState('');
  const [isOver, setIsOver] = useState(false);

  const maps = useMemo(() => [...new Map(entries.map((e) => [e.mapSlug, MapCatalog.tryFind(e.mapSlug)?.name ?? e.mapName])).entries()], [entries]);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = entries
      .filter((e) => mapFilter === 'all' || e.mapSlug === mapFilter)
      .filter((e) => !needle || [e.name, e.mapName, ...e.tags].some((text) => text.toLowerCase().includes(needle)))
      .sort(SORTERS[sort]);
    if (!sort.startsWith('uploaded')) return [{ label: null, items: visible }];
    const byDay = new Map();
    visible.forEach((entry) => {
      const label = new Date(entry.uploadedAt).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      if (!byDay.has(label)) byDay.set(label, []);
      byDay.get(label).push(entry);
    });
    return [...byDay].map(([label, items]) => ({ label, items }));
  }, [entries, mapFilter, sort, query, locale]);

  const pick = async () => {
    const paths = await api.demos.pick(t('demo.pickTitle')).catch(() => []);
    if (paths.length) onImportPaths(paths);
  };

  const stageKey = progress ? (progress.percent <= 5 ? 'header' : progress.percent <= 15 ? 'events' : progress.percent <= 45 ? 'positions' : 'assemble') : '';

  return (
    <div
      className={`demo-explorer${isOver ? ' over' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsOver(true); } }}
      onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setIsOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsOver(false); onFiles([...e.dataTransfer.files]); }}
    >
      <div className="explorer-toolbar">
        <h2>{t('demo.library')}</h2>
        <select value={mapFilter} onChange={(e) => setMapFilter(e.target.value)} aria-label={t('demo.allMaps')}>
          <option value="all">{t('demo.allMaps')}</option>
          {maps.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
        <input className="explorer-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('demo.sort')}>
          {Object.keys(SORTERS).map((key) => <option key={key} value={key}>{t(`demo.sort.${key}`)}</option>)}
        </select>
        <button className="btn btn-ghost upload-btn" onClick={pick} disabled={Boolean(progress)}><Icon name="upload" size={16} /> {t('demo.upload')}</button>
      </div>

      {progress && (
        <div className="import-card" role="status">
          <strong>{t('demo.analyzing', { file: progress.file, index: progress.index, total: progress.total })}</strong>
          <span>{t(`demo.stage.${stageKey}`)}</span>
          <div className="progress"><div style={{ width: `${progress.percent}%` }} /></div>
          <small>{t('demo.analyzingHint')}</small>
          <button className="btn btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      )}

      {entries.length === 0 && !progress ? (
        <div className="demo-empty">
          <div className="demo-drop-icon" aria-hidden="true">⬇</div>
          <h2>{t('demo.dropTitle')}</h2>
          <p>{t('demo.dropText')}</p>
          <button className="btn btn-primary" onClick={pick}>{t('demo.choose')}</button>
        </div>
      ) : (
        <div className="explorer-list">
          {groups.map((group) => (
            <section key={group.label ?? 'all'}>
              {group.label && <h3 className="date-heading"><span>/</span> {group.label}</h3>}
              {group.items.map((entry) => (
                <DemoRow key={entry.id} entry={entry} onOpen={onOpen} onRename={onRename} onAddTag={onAddTag} onRemoveTag={onRemoveTag} onDelete={onDelete} />
              ))}
            </section>
          ))}
          {groups.every((g) => g.items.length === 0) && <p className="md-empty">{t('demo.noResults')}</p>}
        </div>
      )}
      {isOver && <div className="drop-overlay">{t('demo.dropOverlay')}</div>}
    </div>
  );
}
