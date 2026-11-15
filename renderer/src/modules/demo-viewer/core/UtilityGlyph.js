import { UtilityStyle } from './UtilityStyle.js';

export class UtilityGlyph {
  static PATHS = {
    smoke: 'M6.5 19a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.5-1.1A4.8 4.8 0 0 1 17.5 19z',
    flash: 'M13.5 2 5 13.5h5.6L9.6 22 19 9.8h-5.7z',
    he: 'M12 8.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM10 2.5h4.6l1.6 3-1.3.9-.9-1.4H12V8h-2z',
    fire: 'M12 2c.7 3.3-1.6 4.9-3.2 7C7.3 11 6 12.8 6 15.2a6 6 0 0 0 12 0c0-2-.9-3.7-2.1-4.9-.3 1.5-1.1 2.4-2.2 2.7.6-3.5-.4-7.7-1.7-11z',
    decoy: 'M12 2.5 21.5 12 12 21.5 2.5 12z',
    c4: 'M3 8h18v12H3zM6 11v6h4v-6zM14 11v6h4v-6zM11 3h2v5h-2z',
    defuser: 'M4 9h13v3h5v3h-5v3H4zM6 6h4v3H6z'
  };

  static draw(ctx, type, x, y, size, color = UtilityStyle.color(type)) {
    const d = UtilityGlyph.PATHS[type];
    if (!d || typeof Path2D === 'undefined') return;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(d));
    ctx.restore();
  }
}
