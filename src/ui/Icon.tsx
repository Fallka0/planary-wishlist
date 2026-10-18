import { TILE_FALLBACK, UI_ICONS, type UiIconName } from './icons';
import styles from './Icon.module.css';

export type IconName = UiIconName;

/** A 24×24 stroke icon from the design set. Decorative: label the button around it instead. */
export function Icon({ name, small, className }: { name: IconName; small?: boolean; className?: string }) {
  return (
    <svg
      className={[styles.ic, small && styles.small, className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={UI_ICONS[name]} strokeWidth={name === 'more' ? 2.8 : undefined} />
    </svg>
  );
}

/** The box glyph shown on a tile when an item has no picture. */
export function FallbackGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={TILE_FALLBACK} />
    </svg>
  );
}

/** The Planary mark's masks and symbol. Render once per page; marks use it through <use href="#pmark">. */
export function MarkDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <mask id="pmP" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#ffffff" />
          <path d="M6 50A44 12.5 0 0 0 94 50" transform="rotate(-28 50 50)" fill="none" stroke="#000000" strokeWidth="11" />
        </mask>
        <mask id="pmB" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#ffffff" />
          <circle cx="50" cy="50" r="28" fill="#000000" />
        </mask>
        <symbol id="pmark" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="25" fill="currentColor" stroke="none" mask="url(#pmP)" />
          <path d="M94 50A44 12.5 0 0 0 6 50" transform="rotate(-28 50 50)" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" mask="url(#pmB)" />
          <path d="M6 50A44 12.5 0 0 0 94 50" transform="rotate(-28 50 50)" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </symbol>
      </defs>
    </svg>
  );
}

export function PlanaryMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <use href="#pmark" />
    </svg>
  );
}
