import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from './cx.ts'
import styles from './ui.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface Common {
  /** `primary` ink fill, `secondary` outline keycap (default), `ghost` text only, `danger` vermilion edge (for things that break something on purpose). */
  variant?: ButtonVariant
  size?: ButtonSize
  /** An <Icon/> (or any node) before the label. */
  icon?: ReactNode
  /** A node after the label. */
  iconAfter?: ReactNode
}

export interface ButtonProps extends Common, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Makes it a toggle: sets `aria-pressed` and the inverted "pressed" look. */
  pressed?: boolean
  /** Sets `aria-busy` and the progress look. The button stays focusable; guard the handler yourself. */
  busy?: boolean
  ref?: Ref<HTMLButtonElement>
}

const classes = (variant: ButtonVariant, size: ButtonSize, extra?: string) =>
  cx(styles.button, styles[`variant-${variant}`], styles[`size-${size}`], extra)

/**
 * A keycap button: square corners, ink border, a hard offset shadow that the button sinks into when
 * pressed. 44 px minimum height. `type="button"` unless you say otherwise.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconAfter,
  pressed,
  busy,
  className,
  type = 'button',
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, className)}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      data-busy={busy || undefined}
      {...rest}
    >
      {icon ? <span className={styles.buttonIcon}>{icon}</span> : null}
      {children ? <span className={styles.buttonLabel}>{children}</span> : null}
      {iconAfter ? <span className={styles.buttonIcon}>{iconAfter}</span> : null}
    </button>
  )
}

export interface ButtonLinkProps extends Common, AnchorHTMLAttributes<HTMLAnchorElement> {
  ref?: Ref<HTMLAnchorElement>
}

/** An <a> that looks like a Button. Same-page and same-origin links stay in the tab; pass `target="_blank"` for a new one (rel is set for you). */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  iconAfter,
  className,
  children,
  target,
  rel,
  ref,
  ...rest
}: ButtonLinkProps) {
  return (
    <a
      ref={ref}
      className={classes(variant, size, cx(styles.buttonLink, className))}
      target={target}
      rel={target === '_blank' ? (rel ?? 'noreferrer noopener') : rel}
      {...rest}
    >
      {icon ? <span className={styles.buttonIcon}>{icon}</span> : null}
      {children ? <span className={styles.buttonLabel}>{children}</span> : null}
      {iconAfter ? <span className={styles.buttonIcon}>{iconAfter}</span> : null}
    </a>
  )
}
