import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api, mediaUrl } from '../api/api.js';
import { DrawingPreview } from '../drawing/DrawingPreview.jsx';
import { LibraryEvents } from '../events/LibraryEvents.js';
import { useNavigation } from '../../shell/NavigationContext.jsx';
import { EmbedTokens } from './EmbedTokens.js';
import { MediaIndex } from './MediaIndex.js';

export function EmbeddedContent({ src, alt }) {
  const { t } = useI18n();
  const token = EmbedTokens.parse(src);
  if (!token) return <span className="md-blocked-image">[{alt || t('common.image')}]</span>;
  return token.kind === 'drawing' ? <DrawingEmbed id={token.id} alt={alt} /> : <MediaEmbed id={token.id} alt={alt} />;
}

function DrawingEmbed({ id, alt }) {
  const { t } = useI18n();
  const { navigate } = useNavigation();
  const [state, setState] = useState({ drawing: null, missing: false });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.drawings.get(id).then(
        (drawing) => !cancelled && setState({ drawing, missing: false }),
        () => !cancelled && setState({ drawing: null, missing: true })
      );
    load();
    const unsubscribe = LibraryEvents.subscribe(load);
    return () => { cancelled = true; unsubscribe(); };
  }, [id]);

  if (state.missing) return <span className="embed-missing">🗺️ {t('embed.drawingRemoved')} ({alt || id})</span>;
  if (!state.drawing) return <span className="embed-missing">{t('embed.loadingDrawing')}</span>;
  return (
    <span className="embed embed-drawing">
      <DrawingPreview drawing={state.drawing} />
      <span className="embed-bar">
        <span className="embed-caption">{alt || state.drawing.name}</span>
        <button className="btn btn-ghost" onClick={() => navigate('board', { drawingId: id })}>{t('embed.editOnBoard')}</button>
      </span>
    </span>
  );
}

function MediaEmbed({ id, alt }) {
  const { t } = useI18n();
  const [item, setItem] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    MediaIndex.find(id).then((found) => !cancelled && setItem(found));
    return () => { cancelled = true; };
  }, [id]);

  if (item === undefined) return <span className="embed-missing">{t('embed.loadingMedia')}</span>;
  if (!item) return <span className="embed-missing">📎 {t('embed.mediaRemoved')} ({alt || id})</span>;
  return (
    <span className="embed embed-media">
      {item.kind === 'video' ? <video src={mediaUrl(id)} controls preload="metadata" /> : <img src={mediaUrl(id)} alt={alt || item.name} />}
      <span className="embed-bar"><span className="embed-caption">{alt || item.name}</span></span>
    </span>
  );
}
