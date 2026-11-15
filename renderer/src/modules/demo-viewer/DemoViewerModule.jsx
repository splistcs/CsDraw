import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api } from '../../shared/api/api.js';
import { LibraryEvents } from '../../shared/events/LibraryEvents.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { DemoExplorer } from './DemoExplorer.jsx';
import { DemoStage } from './DemoStage.jsx';

export default function DemoViewerModule({ isActive }) {
  const { t, errorMessage } = useI18n();
  const { notify, askText, confirm } = useFeedback();
  const [entries, setEntries] = useState([]);
  const [current, setCurrent] = useState(null);
  const [progress, setProgress] = useState(null);

  const refresh = useCallback(() => api.demos.list().then(setEntries).catch((e) => notify(errorMessage(e))), [notify, errorMessage]);
  useEffect(() => {
    refresh();
    return LibraryEvents.subscribe(refresh);
  }, [refresh]);

  useEffect(() => api.demos.onProgress((update) => setProgress((previous) => (previous ? { ...previous, ...update } : previous))), []);

  const importPaths = async (paths) => {
    for (let index = 0; index < paths.length; index += 1) {
      const filePath = paths[index];
      setProgress({ file: filePath.split(/[\\/]/).pop(), index: index + 1, total: paths.length, percent: 0, stage: '' });
      try {
        const { entry, duplicate, upgraded } = await api.demos.import(filePath);
        if (duplicate) notify(t('demo.duplicate', { name: entry.name }));
        else if (upgraded) notify(t('demo.upgraded', { name: entry.name }));
      } catch (error) {
        if (error.code !== 'CANCELED') notify(errorMessage(error));
        if (error.code === 'CANCELED') break;
      }
    }
    setProgress(null);
    LibraryEvents.emit();
  };

  const importFiles = (files) => {
    const demos = files.filter((file) => file.name.toLowerCase().endsWith('.dem'));
    if (files.length && demos.length < files.length) notify(t('demo.onlyDem'));
    const paths = demos.map((file) => api.files.pathFor(file)).filter(Boolean);
    if (paths.length) importPaths(paths);
  };

  const open = async (id) => {
    try {
      const demo = await api.demos.open(id);
      setCurrent({ entry: entries.find((e) => e.id === id), demo });
    } catch (error) {
      notify(errorMessage(error));
    }
  };

  const guard = (action) => async (...args) => {
    try { await action(...args); LibraryEvents.emit(); } catch (error) { notify(errorMessage(error)); }
  };

  const rename = guard(async (entry) => {
    const name = await askText({ title: t('common.rename'), label: t('common.newName'), initial: entry.name, confirmLabel: t('common.rename') });
    if (name) await api.demos.rename({ id: entry.id, name });
  });
  const addTag = guard(async (entry) => {
    const tag = await askText({ title: t('demo.addTag'), label: t('demo.tagName'), confirmLabel: t('common.add') });
    if (tag) await api.demos.setTags({ id: entry.id, tags: [...entry.tags, tag] });
  });
  const removeTag = guard((entry, tag) => api.demos.setTags({ id: entry.id, tags: entry.tags.filter((item) => item !== tag) }));
  const remove = guard(async (entry) => {
    if (await confirm({ title: t('demo.deleteTitle'), message: t('demo.deleteText', { name: entry.name }), confirmLabel: t('common.delete') })) {
      await api.demos.remove(entry.id);
    }
  });

  if (current) {
    return <DemoStage key={current.entry.id} demo={current.demo} entry={current.entry} isActive={isActive} onBack={() => setCurrent(null)} />;
  }
  return (
    <DemoExplorer
      entries={entries} progress={progress}
      onFiles={importFiles} onImportPaths={importPaths} onOpen={open}
      onRename={rename} onAddTag={addTag} onRemoveTag={removeTag} onDelete={remove}
      onCancel={() => api.demos.cancel()}
    />
  );
}
