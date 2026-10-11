import { copy } from '../../data/copy.ts'
import styles from './Colophon.module.css'

/**
 * The changelog (spec 3.8, 4.8): one hash-linkable entry per version, newest first. Each line is exactly
 * `copy.colophon.changelogLine(entry)`; only the tag at the front is set in bold, so the words never differ
 * from the copy file. `#v3-0` scrolls to its entry and the entry is marked while it is the target.
 */
export function Changelog() {
  const t = copy.colophon
  return (
    <ol className={styles.log}>
      {t.changelog.map((entry) => {
        const line = t.changelogLine(entry)
        return (
          <li key={entry.id} id={entry.id}>
            <a href={`#${entry.id}`}>
              <b>{entry.tag}</b>
              {line.slice(entry.tag.length)}
            </a>
          </li>
        )
      })}
    </ol>
  )
}
