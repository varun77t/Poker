import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  /** Shows a pending state and blocks clicks. */
  busy?: boolean;
}

export function Button({ variant = 'primary', fullWidth, busy, disabled, className, children, ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], fullWidth && styles.full, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}
