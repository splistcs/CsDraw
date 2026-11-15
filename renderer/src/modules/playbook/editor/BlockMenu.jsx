import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';

export function BlockMenu({ anchor, sections, query = '', onPick, onClose, onEmpty, footer = true }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 6 });

  const filtered = useMemo(() => {
    const fold = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const needle = fold(query.trim());
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !needle || [item.label, item.id, item.hint].some((text) => fold(text).includes(needle)))
      }))
      .filter((section) => section.items.length);
  }, [sections, query]);
  const flat = useMemo(() => filtered.flatMap((section) => section.items), [filtered]);

  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => { onEmpty?.(flat.length === 0); }, [flat.length, onEmpty]);

  const stateRef = useRef({});
  stateRef.current = { flat, index, onPick, onClose };
  useEffect(() => {
    const onKey = (event) => {
      const { flat: items, index: current, onPick: pick, onClose: close } = stateRef.current;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key) || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Tab') { if (items[current]) pick(items[current]); return; }
      if (!items.length) return;
      setIndex((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    };
    const onPointer = (event) => { if (!ref.current?.contains(event.target)) stateRef.current.onClose(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onPointer, true); };
  }, []);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    let { left } = anchor;
    let top = anchor.bottom + 6;
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, anchor.top - box.height - 6);
    if (left + box.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - box.width - 8);
    setPos({ left, top });
  }, [anchor, flat.length]);

  useEffect(() => {
    ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, filtered]);

  let counter = -1;
  return (
    <div className="be-menu" ref={ref} style={{ left: pos.left, top: pos.top }} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      <div className="be-menu-scroll">
        {flat.length === 0 && <div className="be-menu-empty">{t('editor.noResults')}</div>}
        {filtered.map((section) => (
          <div key={section.key} className="be-menu-section">
            {section.title && <div className="be-menu-title">{section.title}</div>}
            {section.items.map((item) => {
              counter += 1;
              const mine = counter;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={mine === index}
                  data-active={mine === index}
                  className={`be-menu-item${item.danger ? ' danger' : ''}`}
                  onMouseMove={() => mine !== index && setIndex(mine)}
                  onClick={() => onPick(item)}
                >
                  <span className="be-menu-icon">{item.icon}</span>
                  <span className="be-menu-label">{item.label}</span>
                  {item.hint && <span className="be-menu-hint">{item.hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {footer && (
        <button type="button" className="be-menu-footer" onClick={onClose}>
          <span>{t('editor.closeMenu')}</span><kbd>esc</kbd>
        </button>
      )}
    </div>
  );
}
