import { useEffect, useState } from 'react';
import { IconLibrary } from './core/IconLibrary.js';

/** Mostra um PNG da pasta de icones; se o arquivo nao existir, mostra `fallback` (icone vetorial ou texto). */
export function IconImage({ url, fallback = null, className = '', title }) {
  const [failed, setFailed] = useState(() => IconLibrary.failed(url));
  useEffect(() => { setFailed(IconLibrary.failed(url)); }, [url]);
  if (!url || failed) return fallback;
  return <img className={`icon-img ${className}`.trim()} src={url} alt="" title={title} draggable={false} onError={() => setFailed(true)} />;
}
