import { useEffect, useReducer, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { api, mediaUrl } from '../../shared/api/api.js';
import { GrenadeCatalog } from '../../shared/constants/GrenadeCatalog.js';
import { GrenadeIcon } from '../../shared/drawing/GrenadeIcon.jsx';
import { ImageLightbox } from '../../shared/ui/ImageLightbox.jsx';
import { SideDrawer } from '../../shared/ui/SideDrawer.jsx';

export function StickerDrawer({ board, stickerId, onClose }) {
  const { t, errorMessage } = useI18n();
  const [, refresh] = useReducer((n) => n + 1, 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoomed, setZoomed] = useState(null);
  const fileInput = useRef(null);
  const sticker = board.getSticker(stickerId);

  const addFiles = async (files) => {
    setError('');
    setBusy(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) { setError(t('sticker.onlyImages')); continue; }
        const item = await api.media.addBuffer({ name: file.name || 'image.png', data: await file.arrayBuffer(), origin: 'sticker' });
        const current = board.getSticker(stickerId);
        if (!current) return;
        board.setStickerImages(stickerId, [...current.images, { mediaId: item.id, caption: '' }]);
        refresh();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (!sticker) onClose(); }, [sticker, onClose]);

  useEffect(() => {
    const onPaste = (event) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length) { event.preventDefault(); addFiles(files); }
    };
    const onKey = (event) => { if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose(); };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); };
  });

  if (!sticker) return null;
  const grenade = GrenadeCatalog.findByType(sticker.type);
  const updateImages = (images) => { board.setStickerImages(stickerId, images); refresh(); };
  const setCaption = (index, caption) => updateImages(sticker.images.map((image, i) => (i === index ? { ...image, caption } : image)));
  const removeImage = (index) => updateImages(sticker.images.filter((_, i) => i !== index));

  return (
    <SideDrawer side="right" open title={t('sticker.title')} className="sticker-drawer">
      <div className="drawer-head">
        <span className="drawer-title">
          <span className="tb-chip" style={{ background: grenade?.color }}>{grenade && <GrenadeIcon grenade={grenade} />}</span>
          <strong>{t(`grenade.${sticker.type}`)}</strong>
        </span>
        <button className="icon-button" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </div>

      <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }}>
        <button className="btn btn-primary" onClick={() => fileInput.current.click()} disabled={busy}>{busy ? t('common.saving') : t('sticker.add')}</button>
        <small>{t('sticker.addHint')}</small>
      </div>
      {error && <p className="form-error">{error}</p>}
      {sticker.images.length === 0 && <p className="sticker-empty">{t('sticker.empty')}</p>}

      <ul className="sticker-images">
        {sticker.images.map((image, index) => (
          <li key={image.mediaId}>
            <button className="sticker-image" onClick={() => setZoomed(image)} title={t('sticker.enlarge')}>
              <img src={mediaUrl(image.mediaId)} alt={image.caption || t('sticker.attached')} />
            </button>
            <div className="sticker-caption">
              <input value={image.caption} onChange={(e) => setCaption(index, e.target.value)} placeholder={t('sticker.caption')} maxLength={300} aria-label={t('sticker.caption')} />
              <button className="icon-button" onClick={() => removeImage(index)} aria-label={t('sticker.remove')} title={t('sticker.remove')}>🗑</button>
            </div>
          </li>
        ))}
      </ul>
      <small className="sidebar-hint">{t('sticker.saveHint')}</small>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
      {zoomed && <ImageLightbox src={mediaUrl(zoomed.mediaId)} caption={zoomed.caption} onClose={() => setZoomed(null)} />}
    </SideDrawer>
  );
}
