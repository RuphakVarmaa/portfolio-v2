import styles from './External.module.css'

/** Spoken after the name of a link that opens another tab (a short UI hint, not site copy). */
const NEW_TAB = '(opens in a new tab)'

/**
 * A link to another site: opens a new tab without handing it `window.opener`, with an arrow icon and a spoken
 * hint. The hint is in the accessible name (`aria-label` starts with the visible text, so voice control still
 * matches it), not in the DOM text: the text of the page, and anything copied from it, stays exactly what is shown.
 *
 * `inline` is for a link inside a sentence: an ordinary inline link with no arrow, so the punctuation that
 * follows it sits flush against the link's words instead of floating after an icon. The spoken hint stays.
 */
export function External({ href, children, inline = false }: { href: string; children: string; inline?: boolean }) {
  return (
    <a
      className={inline ? `${styles.ext} ${styles.inline}` : styles.ext}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${children} ${NEW_TAB}`}
    >
      {children}
    </a>
  )
}
