import { useState, type CSSProperties, type ReactNode } from 'react';
import { initials } from '../lib/format';
import type { PersonRef } from '../lib/types';
import { FallbackGlyph, Icon, type IconName } from './Icon';
import styles from './Display.module.css';

/** Small grey pill: "Shared", "Private". The ok variant is green ("You're getting this"). */
export function Tag({ icon, ok, children }: { icon?: IconName; ok?: boolean; children: ReactNode }) {
  return (
    <span className={[styles.tag, ok && styles.tagOk].filter(Boolean).join(' ')}>
      {ok ? <Icon name="check" /> : icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

type AvatarSize = 26 | 32 | 44 | 64;
const sizeClass: Record<AvatarSize, string | undefined> = { 26: styles.s26, 32: undefined, 44: styles.s44, 64: styles.s64 };

/**
 * Initials in a circle: filled for you, outlined for everyone else. Decorative by default,
 * because the name is always next to it; pass label when it stands alone.
 */
export function Avatar({ name, me = false, size = 32, label }: { name: string; me?: boolean; size?: AvatarSize; label?: string }) {
  return (
    <span
      className={[styles.av, !me && styles.avOther, sizeClass[size]].filter(Boolean).join(' ')}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars for co-planners. ring is the surface colour behind it (card by default). */
export function AvatarStack({ people, size = 26, ring }: { people: PersonRef[]; size?: AvatarSize; ring?: string }) {
  if (people.length === 0) return null;
  const names = people.map((p) => (p.isMe ? 'you' : p.name)).join(', ');
  return (
    <span className={styles.stack} role="img" aria-label={`Co-planners: ${names}`} style={ring ? ({ '--stack-ring': ring } as CSSProperties) : undefined}>
      {people.map((p) => (
        <Avatar key={p.id} name={p.name} me={p.isMe} size={size} />
      ))}
    </span>
  );
}

/**
 * Item picture on the studio backdrop. Shop images are hotlinked without a referrer; if one fails to
 * load, the fallback glyph takes its place.
 */
export function Tile({ imageUrl, className, style }: { imageUrl?: string; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={[styles.tile, className].filter(Boolean).join(' ')} style={style}>
      {imageUrl && !failed ? (
        <img src={imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <FallbackGlyph />
      )}
    </span>
  );
}

/** 6px bar. value is 0–1 (clamped); label says what it measures. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Shimmering placeholder while something loads. */
export function Skeleton({ width, height = 12, radius, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return <span className={[styles.sk, className].filter(Boolean).join(' ')} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
