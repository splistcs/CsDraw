import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { MarkdownView } from '../../shared/markdown/MarkdownView.jsx';

/** Anotacoes: preview de Markdown; o botao Editar alterna para o editor. */
export function NotesPanel({ notes, onChange, onDownload }) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  return (
    <section className="notes" aria-label={t('notes.title')}>
      <div className="notes-head">
        <h2>{t('notes.title')}</h2>
        <div className="notes-actions">
          <button className="btn btn-ghost" onClick={() => setIsEditing((editing) => !editing)}>{isEditing ? t('common.preview') : t('common.edit')}</button>
          <button className="btn btn-ghost" onClick={onDownload}>{t('common.downloadMd')}</button>
        </div>
      </div>
      {isEditing ? (
        <textarea ref={textareaRef} value={notes} onChange={(e) => onChange(e.target.value)} placeholder={t('notes.placeholder')} maxLength={50000} spellCheck={false} />
      ) : (
        <MarkdownView source={notes} emptyMessage={t('notes.empty')} />
      )}
    </section>
  );
}
