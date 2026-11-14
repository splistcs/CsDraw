const PATHS = {
  pan: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  pen: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
  highlighter: 'M9 11l6 6M4 20l5-1 9-9-4-4-9 9-1 5zM14 6l4 4',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M9 5h10v10',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  eraser: 'M7 21h13M5 15l9-9 5 5-6 6H8z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  gear: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  back: 'M15 18l-6-6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  clock: 'M12 7v5l3 2',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bomb: 'M10 8a6 6 0 1 0 6 6M14 4l3 3M17 7l2-2'
};

/** Icones de traco simples (24x24). Rect/circle extras para formas que nao cabem em um path. */
export function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'rect' && <rect x="4" y="5" width="16" height="14" rx="1" />}
      {name === 'ellipse' && <ellipse cx="12" cy="12" rx="9" ry="6" />}
      {name === 'keyboard' && (<><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>)}
      {name === 'gear' && <circle cx="12" cy="12" r="3" />}
      {name === 'clock' && <circle cx="12" cy="12" r="9" />}
      {name === 'bomb' && <circle cx="10" cy="14" r="6" />}
      {PATHS[name] && <path d={PATHS[name]} />}
    </svg>
  );
}
