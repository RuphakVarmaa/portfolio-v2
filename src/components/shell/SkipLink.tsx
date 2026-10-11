import { copy } from '../../data/copy.ts'
import styles from './shell.module.css'

/** First focusable element on every route. Jumps to `<main id="content">`. */
export function SkipLink() {
  return (
    <a className={styles.skipLink} href="#content" data-no-print="">
      {copy.header.skipLink}
    </a>
  )
}
