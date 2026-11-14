import { UtilityGlyph as Glyph } from './core/UtilityGlyph.js';

/** Icone SVG de uma utilidade; a cor vem de `currentColor`. */
export function UtilityGlyph({ type, size = 16 }) {
  return (
    <svg className="utility-glyph" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={Glyph.PATHS[type]} />
    </svg>
  );
}
