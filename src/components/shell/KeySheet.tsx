import { useEffect, useRef, useState } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { quorum } from '../../cluster/quorum.ts'
import { copy } from '../../data/copy.ts'
import { goToId } from '../../lib/draw/motion.ts'
import { Button } from '../ui/Button.tsx'
import { cx } from '../ui/cx.ts'
import { Icon } from '../ui/Icon.tsx'
import { KeysToggle } from './PreferenceControls.tsx'
import { usePreferencesStore } from './preferences-context.ts'
import { WIDGET_SELECTOR, shortcutFor, type KeyPress } from './shortcuts.ts'
import styles from './shell.module.css'

/** The facts `shortcutFor` needs, read from the key event and the page. */
function readPress(event: KeyboardEvent): KeyPress {
  const target = event.target instanceof HTMLElement ? event.target : null
  const tag = target?.tagName
  return {
    key: event.key,
    defaultPrevented: event.defaultPrevented,
    composing: event.isComposing,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    typing: target !== null && (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.getAttribute('role') === 'textbox'),
    inWidget: target?.closest(WIDGET_SELECTOR) != null,
    // A modal dialog owns the keyboard (Esc is handled natively).
    modalOpen: document.querySelector('dialog[open]') !== null,
  }
}

/** Scroll to a home-page section, or go to the home page's section from another route. */
function goHome(id: string) {
  if (!goToId(id)) window.location.href = `/#${id}`
}

/**
 * The key sheet (a native dialog, opened with `?`) and the global shortcuts: p / r / c for the quick-view
 * rail, 2 for a second tab, ? for this sheet. Esc closes dialogs natively; the camera listens for it
 * itself. The shortcuts are single keys, so they have an off switch (shortcuts.ts: WCAG 2.1.4); the switch is
 * in the display options and on this sheet. Mount it once, in the App.
 */
export function KeySheet() {
  const dialog = useRef<HTMLDialogElement>(null)
  const preferences = usePreferencesStore()
  // The sheet's content is only rendered while it is open, which keeps it out of the prerendered HTML.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Read the switch at the moment of the press (not when the effect ran), so turning it off takes effect at once.
      const action = shortcutFor(readPress(event), preferences.getSnapshot().keys)
      if (action === null) return
      event.preventDefault()
      switch (action) {
        case 'projects':
          goHome('services')
          break
        case 'contact':
          goHome('contact')
          break
        case 'resume':
          window.location.href = '/resume/'
          break
        case 'second-tab':
          if (!quorum.openSecondTab()) announce(copy.controlRoom.quorumPrompt.blocked)
          break
        case 'key-sheet':
          setOpen(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preferences])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  const keys = copy.header.keys
  return (
    <dialog
      ref={dialog}
      className={styles.keySheet}
      data-no-print=""
      aria-labelledby="key-sheet-title"
      onClose={() => setOpen(false)}
      onClick={(event) => {
        if (event.target === dialog.current) setOpen(false)
      }}
    >
      {open ? (
        <div className={styles.keySheetBody}>
          <div className={styles.keySheetHead}>
            <h2 id="key-sheet-title" className={styles.keySheetTitle}>
              {keys.title}
            </h2>
            <button type="button" className={styles.iconButton} aria-label={keys.close} onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <p className="muted">{keys.lead}</p>
          <div className={cx(styles.controls, styles['controls-menu'])}>
            <KeysToggle />
          </div>
          <dl className={styles.keyList}>
            {keys.rows.map((row) => (
              <div key={row.text} className={styles.keyRow}>
                <dt>
                  {row.keys.map((key) => (
                    <kbd key={key} className="keycap">
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd>{row.text}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.keySheetActions}>
            <Button variant="primary" onClick={() => setOpen(false)}>
              {keys.close}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
