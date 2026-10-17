// Planary Wishlist v2 · icon set (24×24 viewBox, stroke icons, no fill).
// Render: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
//              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON.x} /></svg>
// UI icons are 18px (16px in small buttons). Tile icons use strokeWidth 1.15 at ~42% of the tile.
// `more` needs strokeWidth 2.8 so the three points read as dots.

export const UI_ICONS = {
  search: 'M16.5 10.5a6 6 0 1 1-12 0a6 6 0 1 1 12 0ZM15 15l5 5',
  sun: 'M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  plus: 'M12 5v14M5 12h14',
  share: 'M12 15V4M8 8l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16ZM13.5 6.5l4 4',
  x: 'M6 6l12 12M18 6 6 18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  rows: 'M4 6h16M4 12h16M4 18h16',
  grid: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z',
  gift: 'M4 11h16v9H4ZM3 7h18v4H3ZM12 7v13M12 7c-1.5-3-5-4-5.5-2S9 7 12 7Zm0 0c1.5-3 5-4 5.5-2S15 7 12 7Z',
  users: 'M12.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6',
  person: 'M15.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0ZM5 20a7 7 0 0 1 14 0',
  lock: 'M6 11h12v9H6ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  globe: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z',
  copy: 'M9 9h11v11H9ZM5 15H4V4h11v1',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.4.7-1.4 2-2.8 3.3M6.6 6.6C4.6 7.9 3.1 9.9 2.5 12c1 1.5 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  calendar: 'M4 6h16v14H4ZM4 10h16M8 3v4M16 3v4',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4Z',
  menu: 'M4 7h16M4 12h16M4 17h10',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  alert: 'M12 8v5M12 16.5h.01M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
} as const;

// Fallback glyph for an item tile when the link preview found no image.
// The prototype used category glyphs only as stand-ins for product photos;
// production shows item.imageUrl and falls back to `box`.
export const TILE_FALLBACK = 'M12 3 20 7.5v9L12 21l-8-4.5v-9ZM4 7.5 12 12l8-4.5M12 12v9';

export type UiIconName = keyof typeof UI_ICONS;

// The Planary mark (planet + ring). Same symbol as on planary.ch and auth.planary.ch.
// viewBox 0 0 100 100, drawn in currentColor; needs the two masks below.
export const PLANARY_MARK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
<defs>
<mask id="pmP" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><path d="M6 50A44 12.5 0 0 0 94 50" transform="rotate(-28 50 50)" fill="none" stroke="#000" stroke-width="11"/></mask>
<mask id="pmB" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="50" r="28" fill="#000"/></mask>
</defs>
<circle cx="50" cy="50" r="25" fill="currentColor" mask="url(#pmP)"/>
<path d="M94 50A44 12.5 0 0 0 6 50" transform="rotate(-28 50 50)" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" mask="url(#pmB)"/>
<path d="M6 50A44 12.5 0 0 0 94 50" transform="rotate(-28 50 50)" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
</svg>`;
