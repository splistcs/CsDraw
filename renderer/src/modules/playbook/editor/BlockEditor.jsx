import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { EmbeddedContent } from '../../../shared/markdown/EmbeddedContent.jsx';
import { MarkdownView } from '../../../shared/markdown/MarkdownView.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { EmbedPicker } from '../EmbedPicker.jsx';
import { BlockMenu } from './BlockMenu.jsx';
import { BLOCK_MENU, Blocks, TURN_INTO } from './blocks.js';
import { Caret } from './caret.js';
import { InlineMarkdown } from './inline.js';

const DRAG_MIME = 'application/x-csdraw-block';
const BULLETS = ['•', '◦', '▪', '•'];
const isEmptyText = (block) => block.type === 'text' && !block.text;

function EditableText({ value, className, placeholder, onInput, onKeyDown, onPaste, onFocus }) {
  const ref = useRef(null);
  const last = useRef(null);
  useLayoutEffect(() => {
    if (last.current !== value) {
      ref.current.innerHTML = InlineMarkdown.toHtml(value);
      last.current = value;
    }
  }, [value]);
  const handleInput = (event) => {
    const el = ref.current;
    if (!event.nativeEvent.isComposing && event.nativeEvent.inputType !== 'insertCompositionText') Caret.applyInlineShortcut(el);
    const md = InlineMarkdown.fromDom(el);
    last.current = md;
    onInput(md, el);
  };
  return (
    <div
      ref={ref}
      data-editable="true"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="false"
      className={`${className}${value === '' ? ' is-empty' : ''}`}
      data-ph={placeholder}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
    />
  );
}

const BlockRow = memo(function BlockRow({ block, number, drop, ed }) {
  const { t } = useI18n();
  const { id, type } = block;
  const place = drop ? ` drop-${drop}` : '';
  const placeholder = type === 'text' ? t('editor.placeholder') : ['bullet', 'number', 'todo'].includes(type) ? t('editor.placeholderList') : t(`editor.block.${type}`);

  let content;
  if (Blocks.isTextual(type)) {
    const marker = type === 'bullet' ? <span className="be-marker">{BULLETS[block.indent % BULLETS.length]}</span>
      : type === 'number' ? <span className="be-marker num">{number}.</span>
      : type === 'todo' ? (
        <button type="button" role="checkbox" aria-checked={block.checked} className={`be-check${block.checked ? ' on' : ''}`} onClick={() => ed.toggleTodo(id)} aria-label={t('editor.block.todo')}>{block.checked ? '✓' : ''}</button>
      ) : null;
    content = (
      <div className={`be-line be-t-${type}${block.checked ? ' done' : ''}`}>
        {marker}
        <EditableText
          value={block.text}
          className="be-text"
          placeholder={placeholder}
          onInput={(md, el) => ed.input(id, md, el)}
          onKeyDown={(e) => ed.keyDown(e, id)}
          onPaste={(e) => ed.paste(e, id)}
          onFocus={() => ed.focused(id)}
        />
      </div>
    );
  } else if (type === 'code') {
    content = (
      <div className="be-code">
        <input className="be-code-lang" value={block.lang} placeholder={t('editor.codeLang')} aria-label={t('editor.codeLang')} spellCheck={false} onChange={(e) => ed.patch(id, { lang: e.target.value.replace(/[`\s]/g, '') }, `lang:${id}`)} />
        <textarea
          data-editable="true"
          data-code="true"
          value={block.text}
          rows={Math.max(1, block.text.split('\n').length)}
          spellCheck={false}
          onChange={(e) => ed.patch(id, { text: e.target.value }, `t:${id}`)}
          onKeyDown={(e) => ed.codeKeyDown(e, id)}
          onFocus={() => ed.focused(id)}
        />
      </div>
    );
  } else {
    const voidKeys = { onKeyDown: (e) => ed.voidKeyDown(e, id), onFocus: () => ed.focused(id) };
    if (type === 'divider') content = <div data-void="true" tabIndex={0} className="be-void be-divider" {...voidKeys}><hr /></div>;
    else if (type === 'drawing' || type === 'media') {
      content = <div data-void="true" tabIndex={0} className="be-void be-embed" {...voidKeys}><EmbeddedContent src={`csdraw-${type}:${block.refId}`} alt={block.name} /></div>;
    } else if (type === 'link') {
      content = (
        <div data-void="true" tabIndex={0} className="be-void be-link" {...voidKeys}>
          <a className="be-link-card" href={block.url} target="_blank" rel="noopener noreferrer" draggable={false}>
            <span className="be-link-ico" aria-hidden="true">🔗</span>
            <span className="be-link-text"><strong>{Blocks.hostOf(block.url)}</strong><small>{block.url}</small></span>
          </a>
          <button type="button" className="be-link-act" onClick={() => ed.linkToText(id)}>{t('editor.linkToText')}</button>
        </div>
      );
    } else content = <RawBlock block={block} ed={ed} voidKeys={voidKeys} />;
  }

  return (
    <div
      className={`be-row type-${type}${place}`}
      data-block={id}
      onDragOver={(e) => ed.dragOver(e, id)}
      onDrop={(e) => ed.dropOn(e, id)}
    >
      <div className="be-gutter" contentEditable={false}>
        <button type="button" className="be-gbtn" tabIndex={-1} title={t('editor.addBelow')} aria-label={t('editor.addBelow')} onMouseDown={(e) => e.preventDefault()} onClick={(e) => ed.openPlus(id, e.currentTarget)}>+</button>
        <button
          type="button"
          className="be-gbtn be-grip"
          tabIndex={-1}
          draggable
          title={t('editor.dragHint')}
          aria-label={t('editor.dragHint')}
          onDragStart={(e) => ed.dragStart(e, id)}
          onDragEnd={ed.dragEnd}
          onClick={(e) => ed.openGrip(id, e.currentTarget)}
        >⋮⋮</button>
      </div>
      <div className="be-body" style={block.indent ? { paddingLeft: block.indent * 26 } : undefined}>{content}</div>
    </div>
  );
});

function RawBlock({ block, ed, voidKeys }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <textarea
        className="be-raw-edit"
        autoFocus
        value={block.text}
        rows={Math.max(2, block.text.split('\n').length)}
        spellCheck={false}
        onChange={(e) => ed.patch(block.id, { text: e.target.value }, `t:${block.id}`)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return (
    <div data-void="true" tabIndex={0} className="be-void be-raw" title={t('editor.rawHint')} onDoubleClick={() => setEditing(true)} onKeyDown={(e) => (e.key === 'Enter' ? setEditing(true) : voidKeys.onKeyDown(e))} onFocus={voidKeys.onFocus}>
      <MarkdownView source={block.text} />
    </div>
  );
}

export const BlockEditor = forwardRef(function BlockEditor({ initial, onChange }, forwardedRef) {
  const { t } = useI18n();
  const { askText } = useFeedback();
  const rootRef = useRef(null);
  const [blocks, setBlocks] = useState(() => withTail(Blocks.parse(initial)));
  const blocksRef = useRef(blocks);
  const lastMd = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pendingFocus = useRef(null);
  const lastFocusedId = useRef(null);
  const dragId = useRef(null);
  const [menu, setMenu] = useState(null);
  const [drop, setDrop] = useState(null);
  const [picker, setPicker] = useState(null);
  const [format, setFormat] = useState(null);
  const menuRef = useRef(null);
  const dismissed = useRef(null);
  const askTextRef = useRef(askText);
  askTextRef.current = askText;
  menuRef.current = menu;
  const tRef = useRef(t);
  tRef.current = t;

  const history = useRef({ stack: [JSON.stringify(blocks)], index: 0, key: null, time: 0 });
  const record = (next, key) => {
    const h = history.current;
    const snapshot = JSON.stringify(next);
    if (h.stack[h.index] === snapshot) return;
    if (key && key === h.key && Date.now() - h.time < 1200) {
      h.stack[h.index] = snapshot;
    } else {
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snapshot);
      h.index += 1;
      if (h.stack.length > 300) { h.stack.shift(); h.index -= 1; }
    }
    h.key = key;
    h.time = Date.now();
  };

  const apply = useCallback((next, { key = null, focus = null, track = true } = {}) => {
    const normalized = withTail(next);
    blocksRef.current = normalized;
    setBlocks(normalized);
    if (track) record(normalized, key);
    if (focus) pendingFocus.current = focus;
    const md = Blocks.serialize(normalized);
    if (md !== lastMd.current) {
      const first = lastMd.current === null;
      lastMd.current = md;
      if (!first) onChangeRef.current?.(md);
    }
  }, []);
  if (lastMd.current === null) lastMd.current = Blocks.serialize(blocks);

  const undoRedo = (direction) => {
    const h = history.current;
    const target = h.index + direction;
    if (target < 0 || target >= h.stack.length) return;
    h.index = target;
    h.key = null;
    const restored = JSON.parse(h.stack[target]);
    const focusId = restored.find((b) => b.id === lastFocusedId.current)?.id ?? restored[0]?.id;
    apply(restored, { track: false, focus: { id: focusId, pos: 'end' } });
  };

  const rowOf = (id) => rootRef.current?.querySelector(`[data-block="${id}"]`);
  const focusBlock = (id, pos = 'end') => {
    const row = rowOf(id);
    const el = row?.querySelector('[data-editable]') ?? row?.querySelector('[data-void]');
    if (!el) return false;
    el.focus();
    if (el.isContentEditable) Caret.place(el, pos);
    else if (el.tagName === 'TEXTAREA') { const at = pos === 'start' ? 0 : el.value.length; el.setSelectionRange(at, at); }
    return true;
  };
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusBlock(target.id, target.pos);
  });

  const indexOf = (id) => blocksRef.current.findIndex((b) => b.id === id);
  const patch = useCallback((id, changes, key = null, focus = null) => {
    apply(blocksRef.current.map((b) => (b.id === id ? { ...b, ...changes } : b)), { key, focus });
  }, [apply]);

  const insertAfter = (id, newBlocks, { replace = false, focus } = {}) => {
    const list = [...blocksRef.current];
    const at = list.findIndex((b) => b.id === id);
    list.splice(replace ? at : at + 1, replace ? 1 : 0, ...newBlocks);
    apply(list, { focus: focus === undefined ? { id: newBlocks.at(-1).id, pos: 'start' } : focus });
  };

  const putVoid = (afterId, voidBlock, replace = false) => {
    const list = blocksRef.current;
    const at = list.findIndex((b) => b.id === afterId);
    const following = list[at + 1];
    const reuse = following && isEmptyText(following);
    const extra = reuse ? [] : [Blocks.create('text')];
    const spare = reuse ? following : extra[0];
    insertAfter(afterId, [voidBlock, ...extra], { replace, focus: { id: spare.id, pos: 'start' } });
  };

  const removeBlock = (id, focusPos = 'end') => {
    const list = blocksRef.current;
    const at = list.findIndex((b) => b.id === id);
    const next = list.filter((b) => b.id !== id);
    const neighbor = next[Math.max(0, at - 1)];
    apply(next.length ? next : [Blocks.create('text')], { focus: neighbor ? { id: neighbor.id, pos: focusPos } : null });
  };

  const moveChunk = (fromId, toId, side) => {
    const list = blocksRef.current;
    const from = list.findIndex((b) => b.id === fromId);
    const [start, end] = Blocks.family(list, from);
    const target = list.findIndex((b) => b.id === toId);
    if (target >= start && target < end) return;
    const chunk = list.slice(start, end);
    const rest = [...list.slice(0, start), ...list.slice(end)];
    const at = rest.findIndex((b) => b.id === toId);
    const [targetStart, targetEnd] = Blocks.family(rest, at);
    rest.splice(side === 'after' ? targetEnd : targetStart, 0, ...chunk);
    apply(rest, { focus: { id: fromId, pos: 'end' } });
  };

  const moveBy = (id, direction) => {
    const list = blocksRef.current;
    const from = list.findIndex((b) => b.id === id);
    const [start, end] = Blocks.family(list, from);
    if (direction < 0) {
      if (start === 0) return;
      let target = start - 1;
      const head = list[start];
      while (target > 0 && Blocks.isList(list[target].type) && Blocks.isList(head.type) && list[target].indent > head.indent) target -= 1;
      moveChunk(id, list[target].id, 'before');
    } else {
      if (end >= list.length) return;
      moveChunk(id, list[end].id, 'after');
    }
  };

  const duplicate = (id) => {
    const list = blocksRef.current;
    const at = list.findIndex((b) => b.id === id);
    const [start, end] = Blocks.family(list, at);
    const copies = list.slice(start, end).map((b) => ({ ...b, id: Blocks.create().id }));
    insertAfter(list[end - 1].id, copies, { focus: { id: copies[0].id, pos: 'end' } });
  };

  const turnInto = (id, type) => {
    const block = blocksRef.current.find((b) => b.id === id);
    if (!block) return;
    const text = block.text ?? '';
    const changes = { type, indent: Blocks.isList(type) ? block.indent : 0, checked: type === 'todo' ? Boolean(block.checked) : false };
    if (type === 'code') changes.text = InlineMarkdown.toPlain(text);
    if (block.type === 'code' && type !== 'code') changes.text = block.text.replace(/\n/g, ' ');
    patch(id, changes, null, { id, pos: 'end' });
  };

  const sectionsFor = (kind) => {
    const label = (item) => t(`editor.block.${item.id}`);
    if (kind === 'grip') {
      return [
        { key: 'actions', title: '', items: [
          { id: '@duplicate', label: t('editor.duplicate'), icon: '⧉', hint: 'Ctrl+D' },
          { id: '@delete', label: t('common.delete'), icon: '🗑', hint: 'Del', danger: true }
        ] },
        { key: 'turn', title: t('editor.turnInto'), items: TURN_INTO.map((item) => ({ ...item, label: label(item) })) }
      ];
    }
    return [
      { key: 'basic', title: t('editor.menu.basic'), items: BLOCK_MENU.filter((i) => i.section === 'basic').map((item) => ({ ...item, label: label(item) })) },
      { key: 'media', title: t('editor.menu.media'), items: BLOCK_MENU.filter((i) => i.section === 'media').map((item) => ({ ...item, label: label(item) })) }
    ];
  };
  const menuSections = useMemo(() => (menu ? sectionsFor(menu.kind) : []), [menu?.kind, t]);

  const closeMenu = useCallback(() => {
    if (menuRef.current?.kind === 'slash') dismissed.current = menuRef.current.id;
    setMenu(null);
    const id = lastFocusedId.current;
    if (id && document.activeElement === document.body) focusBlock(id);
  }, []);

  const pickMenuItem = async (item) => {
    const current = menuRef.current;
    setMenu(null);
    if (!current) return;
    const { id, kind } = current;
    const block = blocksRef.current.find((b) => b.id === id);
    if (!block) return;

    if (kind === 'grip') {
      if (item.id === '@delete') { removeBlock(id); return; }
      if (item.id === '@duplicate') { duplicate(id); return; }
      if (Blocks.isTextual(item.type) || item.type === 'code') turnInto(id, item.type);
      return;
    }

    let text = block.text;
    const el = rowOf(id)?.querySelector('[data-editable]');
    if (el?.isContentEditable) {
      if (kind === 'slash') removeSlashQuery(el, current.query ?? '');
      else el.innerHTML = '';
      text = InlineMarkdown.fromDom(el);
    }
    const empty = !text.trim();

    if (item.type === 'divider') {
      if (!empty) patch(id, { text }, null);
      putVoid(id, Blocks.create('divider'), empty);
      return;
    }
    if (item.type === 'drawing' || item.type === 'media') {
      if (!empty) patch(id, { text }, null);
      setPicker({ tab: item.type === 'drawing' ? 'drawings' : 'media', afterId: id, replaceEmpty: empty });
      return;
    }
    if (item.type === 'link') {
      if (!empty) patch(id, { text }, null);
      const url = await askText({ title: t('editor.block.link'), label: t('editor.linkPrompt'), initial: 'https://', confirmLabel: t('common.create') });
      const clean = String(url ?? '').trim();
      if (Blocks.isUrl(clean)) putVoid(id, Blocks.create('link', { url: clean }), empty);
      else focusBlock(id);
      return;
    }
    if (empty) {
      patch(id, { type: item.type, text: '', indent: Blocks.isList(item.type) ? block.indent : 0, checked: false }, null, { id, pos: 'start' });
    } else {
      patch(id, { text }, null);
      insertAfter(id, [Blocks.create(item.type, { indent: Blocks.isList(item.type) ? block.indent : 0 })], {});
    }
  };

  const openPlus = (id, button) => {
    const rect = button.getBoundingClientRect();
    const block = blocksRef.current.find((b) => b.id === id);
    let targetId = id;
    if (!isEmptyText(block)) {
      const fresh = Blocks.create('text');
      insertAfter(id, [fresh], { focus: { id: fresh.id, pos: 'start' } });
      targetId = fresh.id;
    } else {
      focusBlock(id, 'start');
    }
    setMenu({ kind: 'plus', id: targetId, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom }, query: '' });
  };

  const openGrip = (id, button) => {
    const rect = button.getBoundingClientRect();
    setMenu({ kind: 'grip', id, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom }, query: '' });
  };

  const detectSlash = (id, el) => {
    const before = Caret.textBefore(el);
    const match = /(?:^|\s)\/([^\n]*)$/.exec(before);
    const current = menuRef.current;
    if (!match) dismissed.current = null;
    if (match && match[1].length <= 24 && dismissed.current !== id) {
      const rect = Caret.rect(el);
      setMenu({ kind: 'slash', id, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom || rect.top + 22 }, query: match[1] });
    } else if (current && current.kind === 'slash' && current.id === id) {
      setMenu(null);
    } else if (current?.kind === 'plus' && current.id === id) {
      setMenu({ ...current, query: before.replace(/^\//, '') });
    }
  };

  const input = useCallback((id, md, el) => {
    const block = blocksRef.current.find((b) => b.id === id);
    if (!block) return;
    const plain = el.textContent.replace(/​/g, '');
    if (block.type === 'text' && /^(```|---)$/.test(plain.trim()) && Caret.atEnd(el)) {
      el.innerHTML = '';
      if (plain.trim() === '---') putVoid(id, Blocks.create('divider'), true);
      else patch(id, { type: 'code', text: '' }, null, { id, pos: 'start' });
      return;
    }
    patch(id, { text: md }, `t:${id}`);
    detectSlash(id, el);
    updateFormat();
  }, []);

  const toggleTodo = useCallback((id) => {
    const block = blocksRef.current.find((b) => b.id === id);
    if (block) patch(id, { checked: !block.checked });
  }, [patch]);

  const keyDown = useCallback((event, id) => {
    if (event.nativeEvent.isComposing) return;
    const list = blocksRef.current;
    const at = list.findIndex((b) => b.id === id);
    const block = list[at];
    if (!block) return;
    const el = event.currentTarget;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    const prev = list[at - 1];
    const next = list[at + 1];

    if (mod && !event.shiftKey && key.toLowerCase() === 'z') { event.preventDefault(); undoRedo(-1); return; }
    if (mod && (key.toLowerCase() === 'y' || (event.shiftKey && key.toLowerCase() === 'z'))) { event.preventDefault(); undoRedo(1); return; }
    if (mod && event.shiftKey && (key === 'ArrowUp' || key === 'ArrowDown')) { event.preventDefault(); moveBy(id, key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && key.toLowerCase() === 'd') { event.preventDefault(); duplicate(id); return; }
    if (mod && !event.shiftKey && key.toLowerCase() === 'b') { event.preventDefault(); document.execCommand('bold'); return; }
    if (mod && !event.shiftKey && key.toLowerCase() === 'i') { event.preventDefault(); document.execCommand('italic'); return; }
    if (mod && event.shiftKey && key.toLowerCase() === 's') { event.preventDefault(); document.execCommand('strikeThrough'); return; }
    if (mod && !event.shiftKey && key.toLowerCase() === 'e') { event.preventDefault(); toggleCode(); return; }
    if (mod && !event.shiftKey && key.toLowerCase() === 'k') { event.preventDefault(); makeLink(); return; }

    if (key === 'Enter') {
      event.preventDefault();
      const { before, after } = Caret.split(el);
      const isList = Blocks.isList(block.type);
      if (isEmptyBlock(block, before, after) && (isList || block.type === 'quote')) {
        if (isList && block.indent > 0) patch(id, { indent: block.indent - 1 }, null, { id, pos: 'start' });
        else patch(id, { type: 'text', text: '', indent: 0, checked: false }, null, { id, pos: 'start' });
        return;
      }
      const continues = isList || block.type === 'quote';
      const indent = isList ? block.indent : 0;
      if (before === '' && after !== '') {
        const above = Blocks.create(continues ? block.type : 'text', { indent });
        const updated = list.map((b) => (b.id === id ? { ...b, text: after } : b));
        updated.splice(at, 0, above);
        apply(updated, { focus: { id, pos: 'start' } });
        return;
      }
      const fresh = Blocks.create(continues ? block.type : 'text', { text: after, indent });
      const updated = list.map((b) => (b.id === id ? { ...b, text: before } : b));
      updated.splice(at + 1, 0, fresh);
      apply(updated, { focus: { id: fresh.id, pos: 'start' } });
      return;
    }

    if (key === 'Backspace' && Caret.isCollapsed() && Caret.atStart(el)) {
      event.preventDefault();
      if (block.type !== 'text') {
        if (Blocks.isList(block.type) && block.indent > 0) patch(id, { indent: block.indent - 1 }, null, { id, pos: 'start' });
        else patch(id, { type: 'text', indent: 0, checked: false }, null, { id, pos: 'start' });
        return;
      }
      if (!prev) return;
      if (Blocks.isTextual(prev.type)) {
        const joinAt = Caret.plainLength(prev.text);
        const merged = list.filter((b) => b.id !== id).map((b) => (b.id === prev.id ? { ...b, text: prev.text + block.text } : b));
        apply(merged, { focus: { id: prev.id, pos: joinAt } });
      } else if (!block.text) removeBlock(id);
      else focusBlock(prev.id);
      return;
    }

    if (key === 'Delete' && Caret.isCollapsed() && Caret.atEnd(el) && next) {
      if (Blocks.isTextual(next.type)) {
        event.preventDefault();
        const joinAt = Caret.plainLength(block.text);
        const merged = list.filter((b) => b.id !== next.id).map((b) => (b.id === id ? { ...b, text: block.text + next.text } : b));
        apply(merged, { focus: { id, pos: joinAt } });
      }
      return;
    }

    if (key === 'Tab') {
      event.preventDefault();
      if (!Blocks.isList(block.type)) return;
      if (event.shiftKey) { if (block.indent > 0) patch(id, { indent: block.indent - 1 }, null, { id, pos: 'end' }); return; }
      const allowed = prev && Blocks.isList(prev.type) && block.indent <= prev.indent && block.indent < Blocks.MAX_INDENT;
      if (allowed) patch(id, { indent: block.indent + 1 }, null, { id, pos: 'end' });
      return;
    }

    if (key === ' ' && block.type === 'text' && Caret.atEnd(el)) {
      const typed = el.textContent.replace(/​/g, '');
      const type = Blocks.shortcut(typed);
      if (type) { event.preventDefault(); el.innerHTML = ''; patch(id, { type, text: '', checked: false }, null, { id, pos: 'start' }); return; }
    }

    if (key === 'ArrowUp' && !event.shiftKey && Caret.onEdgeLine(el, 'top') && prev) { event.preventDefault(); focusBlock(prev.id, 'end'); return; }
    if (key === 'ArrowDown' && !event.shiftKey && Caret.onEdgeLine(el, 'bottom') && next) { event.preventDefault(); focusBlock(next.id, 'start'); return; }
    if (key === 'ArrowLeft' && !event.shiftKey && Caret.atStart(el) && prev) { event.preventDefault(); focusBlock(prev.id, 'end'); return; }
    if (key === 'ArrowRight' && !event.shiftKey && Caret.atEnd(el) && next) { event.preventDefault(); focusBlock(next.id, 'start'); }
  }, []);

  const codeKeyDown = useCallback((event, id) => {
    const list = blocksRef.current;
    const at = list.findIndex((b) => b.id === id);
    const block = list[at];
    const area = event.currentTarget;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); moveBy(id, event.key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRedo(-1); return; }
    if (mod && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); undoRedo(1); return; }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const { selectionStart: s, selectionEnd: e } = area;
      patch(id, { text: `${block.text.slice(0, s)}  ${block.text.slice(e)}` }, `t:${id}`);
      requestAnimationFrame(() => area.setSelectionRange(s + 2, s + 2));
    } else if (event.key === 'Backspace' && block.text === '') {
      event.preventDefault();
      patch(id, { type: 'text', lang: '' }, null, { id, pos: 'start' });
    } else if (event.key === 'ArrowUp' && area.selectionStart === 0 && area.selectionEnd === 0 && list[at - 1]) {
      event.preventDefault(); focusBlock(list[at - 1].id, 'end');
    } else if (event.key === 'ArrowDown' && area.selectionStart === area.value.length && list[at + 1]) {
      event.preventDefault(); focusBlock(list[at + 1].id, 'start');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const following = list[at + 1];
      if (following) focusBlock(following.id, 'start');
      else insertAfter(id, [Blocks.create('text')], {});
    }
  }, []);

  const voidKeyDown = useCallback((event, id) => {
    if (event.target !== event.currentTarget) return;
    const list = blocksRef.current;
    const at = list.findIndex((b) => b.id === id);
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); moveBy(id, event.key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRedo(-1); return; }
    if (mod && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); undoRedo(1); return; }
    if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); removeBlock(id); }
    else if (event.key === 'Enter') { event.preventDefault(); insertAfter(id, [Blocks.create('text')], {}); }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); if (list[at - 1]) focusBlock(list[at - 1].id, 'end'); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); if (list[at + 1]) focusBlock(list[at + 1].id, 'start'); }
  }, []);

  const paste = useCallback((event, id) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const block = blocksRef.current.find((b) => b.id === id);
    const el = event.currentTarget;
    const trimmed = text.trim();
    if (Blocks.isUrl(trimmed)) {
      if (!Caret.isCollapsed()) { document.execCommand('createLink', false, trimmed); return; }
      if (isEmptyText(block)) { putVoid(id, Blocks.create('link', { url: trimmed }), true); return; }
      document.execCommand('insertText', false, trimmed);
      return;
    }
    if (/\n/.test(trimmed)) {
      const parsed = Blocks.parse(trimmed).filter((b) => !isEmptyText(b));
      if (parsed.length > 1 || (parsed[0] && parsed[0].type !== 'text')) {
        const { before, after } = Caret.split(el);
        const replace = !before && !after && isEmptyText(block);
        const list = blocksRef.current.map((b) => (b.id === id ? { ...b, text: before } : b));
        const at = list.findIndex((b) => b.id === id);
        const tail = after ? [Blocks.create(block.type === 'text' ? 'text' : block.type, { text: after, indent: block.indent })] : [];
        list.splice(replace ? at : at + 1, replace ? 1 : 0, ...parsed, ...tail);
        apply(list, { focus: { id: (tail[0] ?? parsed.at(-1)).id, pos: tail[0] ? 'start' : 'end' } });
        return;
      }
    }
    document.execCommand('insertText', false, trimmed.replace(/\s*\n\s*/g, ' '));
  }, []);

  function toggleCode() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const editable = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('[data-editable]');
    if (!editable) return;
    const existing = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('code');
    if (existing) {
      existing.replaceWith(document.createTextNode(existing.textContent));
    } else {
      const code = document.createElement('code');
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(code);
      selection.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(code);
      selection.addRange(after);
    }
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function makeLink() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const saved = selection.getRangeAt(0).cloneRange();
    const existing = (saved.commonAncestorContainer.nodeType === 1 ? saved.commonAncestorContainer : saved.commonAncestorContainer.parentElement)?.closest('a');
    const url = await askTextRef.current({ title: tRef.current('editor.link'), label: tRef.current('editor.linkPrompt'), initial: existing?.getAttribute('href') ?? 'https://', confirmLabel: tRef.current('common.save') });
    if (url === null || url === undefined) return;
    const editable = (saved.commonAncestorContainer.nodeType === 1 ? saved.commonAncestorContainer : saved.commonAncestorContainer.parentElement)?.closest('[data-editable]');
    editable?.focus();
    const restored = window.getSelection();
    restored.removeAllRanges();
    restored.addRange(saved);
    const clean = String(url).trim();
    if (!clean || clean === 'https://') document.execCommand('unlink');
    else if (InlineMarkdown.isSafeUrl(clean)) document.execCommand('createLink', false, clean);
  }

  function updateFormat() {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!root || !selection?.rangeCount || selection.isCollapsed || !root.contains(selection.anchorNode)) { setFormat(null); return; }
    const anchorEl = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
    if (!anchorEl?.closest('[data-editable]:not(textarea)') || !selection.toString().trim()) { setFormat(null); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setFormat({
      x: rect.left + rect.width / 2, y: rect.top,
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), strike: document.queryCommandState('strikeThrough'),
      code: Boolean(anchorEl.closest('code')), link: Boolean(anchorEl.closest('a'))
    });
  }
  useEffect(() => {
    const onSelection = () => updateFormat();
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const dragStart = useCallback((event, id) => {
    dragId.current = id;
    event.dataTransfer.setData(DRAG_MIME, id);
    event.dataTransfer.effectAllowed = 'move';
    const row = event.currentTarget.closest('.be-row');
    if (row) event.dataTransfer.setDragImage(row, 12, 12);
    setMenu(null);
  }, []);
  const dragEnd = useCallback(() => { dragId.current = null; setDrop(null); }, []);
  const dragOver = useCallback((event, id) => {
    if (!dragId.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = event.currentTarget.getBoundingClientRect();
    const side = event.clientY > box.top + box.height / 2 ? 'after' : 'before';
    setDrop((current) => (current?.id === id && current.side === side ? current : { id, side }));
  }, []);
  const dropOn = useCallback((event, id) => {
    const moving = dragId.current;
    if (!moving) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const side = event.clientY > box.top + box.height / 2 ? 'after' : 'before';
    dragId.current = null;
    setDrop(null);
    if (moving !== id) moveChunk(moving, id, side);
  }, []);

  const linkToText = useCallback((id) => {
    const block = blocksRef.current.find((b) => b.id === id);
    if (block) patch(id, { type: 'text', text: block.url.replace(/[\\*_~`[\]]/g, '\\$&') }, null, { id, pos: 'end' });
  }, [patch]);

  const focused = useCallback((id) => { lastFocusedId.current = id; }, []);

  const ed = useMemo(() => ({
    input, keyDown, codeKeyDown, voidKeyDown, paste, patch, toggleTodo, focused, linkToText,
    openPlus, openGrip, dragStart, dragEnd, dragOver, dropOn
  }), []);

  useImperativeHandle(forwardedRef, () => ({
    openPicker() {
      const list = blocksRef.current;
      const afterId = lastFocusedId.current && list.some((b) => b.id === lastFocusedId.current) ? lastFocusedId.current : list.at(-1).id;
      setPicker({ tab: 'drawings', afterId, replaceEmpty: isEmptyText(list.find((b) => b.id === afterId)) });
    },
    focus() { const first = blocksRef.current[0]; if (first) focusBlock(first.id, 'end'); }
  }), []);

  const onPicked = (token) => {
    const current = picker;
    setPicker(null);
    const [embed] = Blocks.parse(token);
    if (!current || !embed || !Blocks.isVoid(embed.type)) return;
    const exists = blocksRef.current.some((b) => b.id === current.afterId);
    const afterId = exists ? current.afterId : blocksRef.current.at(-1).id;
    const target = blocksRef.current.find((b) => b.id === afterId);
    const replace = current.replaceEmpty && isEmptyText(target);
    putVoid(afterId, embed, replace);
  };

  const addAtEnd = () => {
    const list = blocksRef.current;
    const last = list.at(-1);
    if (isEmptyText(last)) { focusBlock(last.id); return; }
    const fresh = Blocks.create('text');
    apply([...list, fresh], { focus: { id: fresh.id, pos: 'start' } });
  };

  const numbers = Blocks.numbering(blocks);

  return (
    <div className="block-editor" ref={rootRef} onClick={(e) => {
      const a = e.target.closest?.('.be-text a');
      if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    }}>
      {blocks.map((block, i) => (
        <BlockRow key={block.id} block={block} number={numbers[i]} drop={drop?.id === block.id ? drop.side : null} ed={ed} />
      ))}
      <div className="be-tail" onClick={addAtEnd} aria-hidden="true" />

      {menu && (
        <BlockMenu
          key={`${menu.kind}:${menu.id}`}
          anchor={menu.anchor}
          sections={menuSections}
          query={menu.query}
          footer={menu.kind !== 'grip'}
          onPick={pickMenuItem}
          onClose={closeMenu}
          onEmpty={(isEmpty) => { if (isEmpty && menuRef.current?.kind === 'slash' && /\s$/.test(menuRef.current.query ?? '')) setMenu(null); }}
        />
      )}

      {format && (
        <div className="be-format" style={{ left: format.x, top: format.y }} onMouseDown={(e) => e.preventDefault()} role="toolbar" aria-label={t('editor.format')}>
          <button type="button" className={format.bold ? 'on' : ''} title={`${t('editor.bold')} (Ctrl+B)`} onClick={() => document.execCommand('bold')}><b>B</b></button>
          <button type="button" className={format.italic ? 'on' : ''} title={`${t('editor.italic')} (Ctrl+I)`} onClick={() => document.execCommand('italic')}><i>I</i></button>
          <button type="button" className={format.strike ? 'on' : ''} title={`${t('editor.strike')} (Ctrl+Shift+S)`} onClick={() => document.execCommand('strikeThrough')}><s>S</s></button>
          <button type="button" className={format.code ? 'on' : ''} title={`${t('editor.code')} (Ctrl+E)`} onClick={toggleCode}>{'</>'}</button>
          <button type="button" className={format.link ? 'on' : ''} title={`${t('editor.link')} (Ctrl+K)`} onClick={makeLink}>🔗</button>
        </div>
      )}

      {picker && <EmbedPicker initialTab={picker.tab} onPick={onPicked} onClose={() => setPicker(null)} />}
    </div>
  );
});

function withTail(list) {
  const last = list.at(-1);
  if (!last || Blocks.isVoid(last.type) || last.type === 'code') return [...list, Blocks.create('text')];
  return list;
}

const isEmptyBlock = (block, before, after) => !before.trim() && !after.trim() && !block.text.trim();

function removeSlashQuery(el, query) {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!node || node.nodeType !== 3 || !el.contains(node)) return;
  const end = selection.anchorOffset;
  const start = end - (query.length + 1);
  if (start >= 0 && node.data.slice(start, end) === `/${query}`) {
    node.deleteData(start, query.length + 1);
    const range = document.createRange();
    range.setStart(node, start);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
