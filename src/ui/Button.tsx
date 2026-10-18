import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'ink' | 'line' | 'ghost' | 'danger';

interface Look {
  variant?: ButtonVariant;
  small?: boolean;
  wide?: boolean;
  icon?: IconName;
}

function cls({ variant = 'ink', small, wide }: Look, extra?: string) {
  return [styles.btn, styles[variant], small && styles.small, wide && styles.wide, extra].filter(Boolean).join(' ');
}

function Content({ icon, small, children }: { icon?: IconName; small?: boolean; children: ReactNode }) {
  return (
    <>
      {icon && <Icon name={icon} small={small} />}
      {children}
    </>
  );
}

/** Pill button: ink (primary), line (outline), ghost or danger. */
export function Button({ variant, small, wide, icon, className, children, type = 'button', ...rest }: Look & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cls({ variant, small, wide }, className)} {...rest}>
      <Content icon={icon} small={small}>
        {children}
      </Content>
    </button>
  );
}

/** A link inside the app that looks like a button. */
export function ButtonLink({ variant, small, wide, icon, className, children, ...rest }: Look & LinkProps) {
  return (
    <Link className={cls({ variant, small, wide }, className)} {...rest}>
      <Content icon={icon} small={small}>
        {children}
      </Content>
    </Link>
  );
}

/** A link to another site that looks like a button. */
export function ButtonAnchor({ variant, small, wide, icon, className, children, ...rest }: Look & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cls({ variant, small, wide }, className)} {...rest}>
      <Content icon={icon} small={small}>
        {children}
      </Content>
    </a>
  );
}

/** Round 40px icon button. The label is required: it's all a screen reader gets. */
export function IconButton({
  icon,
  label,
  className,
  type = 'button',
  ...rest
}: { icon: IconName; label: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  return (
    <button type={type} className={[styles.ib, className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** Round 40px icon link to another page or site. */
export function IconAnchor({
  icon,
  label,
  className,
  ...rest
}: { icon: IconName; label: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label'>) {
  return (
    <a className={[styles.ib, className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
      <Icon name={icon} />
    </a>
  );
}
