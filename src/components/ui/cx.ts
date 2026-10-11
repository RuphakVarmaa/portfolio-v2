/** Join class names, skipping falsy parts: `cx(styles.a, active && styles.on, className)`. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
