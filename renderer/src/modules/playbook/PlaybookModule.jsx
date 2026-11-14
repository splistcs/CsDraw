import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api } from '../../shared/api/api.js';
import { LibraryEvents } from '../../shared/events/LibraryEvents.js';
import { EmbedTokens } from '../../shared/markdown/EmbedTokens.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { TextDownload } from '../../shared/utils/TextDownload.js';
import { BlockEditor } from './editor/BlockEditor.jsx';

export default function PlaybookModule({ isActive }) {
  const { askText, confirm, notify } = useFeedback();
  const { t, errorMessage } = useI18n();
  const saveLabels = { saved: t('playbook.saved'), saving: t('playbook.saving'), dirty: t('playbook.pending') };
  const [list, setList] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [reloadKey, setReloadKey] = useState(0); // remonta o editor quando o texto muda por fora (outra aba, importacao)
  const [saveState, setSaveState] = useState('saved');
  const editorRef = useRef(null);
  const contentRef = useRef('');
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const initializedRef = useRef(false);

  const refreshList = useCallback(async () => {
    try { const items = await api.playbooks.list(); setList(items); return items; } catch (e) { notify(errorMessage(e)); return []; }
  }, [notify, errorMessage]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const data = pendingRef.current;
    if (!data) return;
    pendingRef.current = null;
    setSaveState('saving');
    try {
      await api.playbooks.save(data);
      setSaveState(pendingRef.current ? 'dirty' : 'saved');
      refreshList();
    } catch (e) {
      notify(errorMessage(e));
      pendingRef.current ??= data;
      setSaveState('dirty');
    }
  }, [notify, errorMessage, refreshList]);

  contentRef.current = content;

  const edit = (patch) => {
    const next = { id: activeId, name, content, ...patch };
    setName(next.name);
    setContent(next.content);
    pendingRef.current = next;
    setSaveState('dirty');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 800);
  };

  const open = useCallback(async (id) => {
    await flush();
    try {
      const playbook = await api.playbooks.get(id);
      setActiveId(id); setName(playbook.name); setContent(playbook.content); setSaveState('saved');
    } catch (e) { notify(errorMessage(e)); }
  }, [flush, notify, errorMessage]);

  useEffect(() => {
    const load = async () => {
      const items = await refreshList();
      if (!initializedRef.current && items.length) { initializedRef.current = true; open(items[0].id); }
    };
    load();
    return LibraryEvents.subscribe(async () => {
      await refreshList();
      if (activeId && !pendingRef.current) {
        api.playbooks.get(activeId).then((pb) => {
          setName(pb.name);
          if (pb.content !== contentRef.current) { setContent(pb.content); setReloadKey((k) => k + 1); }
        }, () => setActiveId(null));
      }
    });
  }, [refreshList, open, activeId]);

  useEffect(() => { if (!isActive) flush(); }, [isActive, flush]);

  const create = async () => {
    const title = await askText({ title: t('playbook.newTitle'), label: t('common.name'), initial: t('playbook.newDefault'), confirmLabel: t('common.create') });
    if (!title) return;
    try {
      await flush();
      const created = await api.playbooks.save({ name: title, content: `# ${title}\n\n` });
      await refreshList();
      initializedRef.current = true;
      await open(created.id);
      setTimeout(() => editorRef.current?.focus(), 50);
    } catch (e) { notify(errorMessage(e)); }
  };

  const remove = async () => {
    if (!activeId || !(await confirm({ title: t('playbook.deleteTitle'), message: t('playbook.deleteText', { name }), confirmLabel: t('common.delete') }))) return;
    try {
      pendingRef.current = null;
      clearTimeout(timerRef.current);
      await api.playbooks.remove(activeId);
      setActiveId(null); setName(''); setContent('');
      const items = await refreshList();
      if (items.length) open(items[0].id);
    } catch (e) { notify(errorMessage(e)); }
  };

  const download = () => TextDownload.save(`${TextDownload.slugify(name, 'playbook')}.md`, EmbedTokens.toPortableText(content, { drawing: t('embed.drawingLabel'), media: t('embed.mediaLabel'), unnamed: t('embed.unnamed') }));

  return (
    <div className="playbook">
      <aside className="playbook-list">
        <div className="playbook-list-head">
          <h2>{t('playbook.title')}</h2>
          <button className="btn btn-primary" onClick={create}>{t('common.new')}</button>
        </div>
        {list.length === 0 && <p className="sidebar-hint">{t('playbook.none')}</p>}
        <ul>
          {list.map((item) => (
            <li key={item.id}>
              <button className={item.id === activeId ? 'active' : ''} onClick={() => open(item.id)}>{item.name}</button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="playbook-main">
        {!activeId ? (
          <div className="empty-state"><p>{t('playbook.select')}</p></div>
        ) : (
          <>
            <div className="playbook-toolbar">
              <input className="playbook-title" value={name} onChange={(e) => edit({ name: e.target.value })} maxLength={80} aria-label={t('playbook.nameLabel')} />
              <span className={`save-state ${saveState}`}>{saveLabels[saveState]}</span>
              <button className="btn btn-ghost" onClick={() => editorRef.current?.openPicker()}>{t('playbook.insert')}</button>
              <button className="btn btn-ghost" onClick={download}>{t('common.downloadMd')}</button>
              <button className="btn btn-ghost danger" onClick={remove}>{t('common.delete')}</button>
            </div>
            <div className="playbook-doc">
              <div className="playbook-page">
                <BlockEditor key={`${activeId}:${reloadKey}`} ref={editorRef} initial={content} onChange={(md) => edit({ content: md })} />
              </div>
            </div>
          </>
        )}
      </section>

    </div>
  );
}
