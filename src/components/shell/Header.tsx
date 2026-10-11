import { useEffect, useRef, useState } from 'react'
import { useQuorum } from '../../cluster/store.ts'
import { copy } from '../../data/copy.ts'
import type { RouteMatch } from '../../routes.ts'
import { Icon } from '../ui/Icon.tsx'
import { Readout } from '../ui/Readout.tsx'
import { PreferenceControls } from './PreferenceControls.tsx'
import styles from './shell.module.css'

/** `NODES 1 · TERM —`: prerendered with the server snapshot, live after hydration. Fixed widths, so nothing shifts. */
function ClusterReadout() {
  const quorum = useQuorum()
  const started = quorum.term > 0
  const t = copy.header.readout
  return (
    <div className={styles.readout} role="group" aria-label={t.label}>
      <Readout label={t.nodes} value={started ? quorum.nodes : 1} width={2} />
      <span className={styles.readoutDot} aria-hidden="true">
        ·
      </span>
      <Readout label={t.term} value={started ? quorum.term : '—'} width={2} />
    </div>
  )
}

/**
 * The Quick-view rail, on every route: wordmark, `Projects · Résumé · Contact` (keys p / r / c), the live
 * NODES / TERM readout, and the display toggles. Above 900 px the toggles sit in a utility bar that
 * scrolls away while the rail stays; below 900 px they move into a modal menu and the rail wraps under
 * the wordmark, so Projects, Résumé, Contact and the readout are always visible.
 */
export function Header({ route }: { route: RouteMatch }) {
  const menu = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const showReadout = route.kind !== 'resume'
  const t = copy.header

  // Opening and closing the menu is the dialog's job; React state only mirrors it for aria-expanded.
  useEffect(() => {
    const dialog = menu.current
    if (!dialog) return
    if (menuOpen && !dialog.open) dialog.showModal()
    if (!menuOpen && dialog.open) dialog.close()
  }, [menuOpen])

  // The menu is a small-screen pattern: leaving that width closes it.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 900px)')
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false)
    }
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])

  return (
    <header className={styles.header} data-no-print="">
      <div className={styles.utility} data-js-only="">
        <div className={`wrap ${styles.utilityInner}`}>
          <p className={styles.keyHint}>
            <span className="muted">Keys</span> {['p', 'r', 'c', '2', '?'].map((key) => (
              <kbd key={key} className="keycap">
                {key}
              </kbd>
            ))}
          </p>
          <PreferenceControls variant="header" />
        </div>
      </div>

      <div className={styles.primary}>
        <div className={`wrap ${styles.primaryInner}`}>
          <a className={styles.brand} href="/" aria-label={t.homeLabel}>
            {t.wordmark}
          </a>

          <nav className={styles.rail} aria-label={t.railLabel}>
            <ul>
              {t.rail.map((link) => (
                <li key={link.key}>
                  <a href={link.href}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <span className={styles.railKeys} aria-hidden="true">
              {t.keyHint}
            </span>
          </nav>

          {showReadout ? <ClusterReadout /> : <span />}

          <button
            ref={trigger}
            type="button"
            className={styles.menuButton}
            data-js-only=""
            aria-expanded={menuOpen}
            aria-controls="display-menu"
            aria-haspopup="dialog"
            aria-label={t.menu.open}
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>

      <dialog
        ref={menu}
        id="display-menu"
        className={styles.menu}
        aria-labelledby="display-menu-title"
        onClose={() => {
          setMenuOpen(false)
          trigger.current?.focus()
        }}
        onClick={(event) => {
          if (event.target === menu.current) setMenuOpen(false)
        }}
      >
        {menuOpen ? (
          <div className={styles.menuBody}>
            <div className={styles.menuHead}>
              <h2 id="display-menu-title" className={styles.menuTitle}>
                {t.menu.title}
              </h2>
              <button type="button" className={styles.iconButton} aria-label={t.menu.close} onClick={() => setMenuOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <PreferenceControls variant="menu" />
          </div>
        ) : null}
      </dialog>
    </header>
  )
}
