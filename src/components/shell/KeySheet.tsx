import { useEffect, useRef, useState } from 'react'
import { announce } from '../../cluster/live-region.ts'
import { quorum } from '../../cluster/quorum.ts'
import { copy } from '../../data/copy.ts'
import { goToId } from '../../lib/draw/motion.ts'
import { Button } from '../ui/Button.tsx'
import { Icon } from '../ui/Icon.tsx'
import styles from './shell.module.css'

/** Keys are ignored while the visitor is typing, or while any modifier (other than Shift) is held. */
function shouldIgnore(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target
  if (target instanceof HTMLElement) {
    if (target.isContentEditable) return true
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (target.getAttribute('role') === 'textbox') return true
  }
  // A modal dialog owns the keyboard (Esc is handled natively).
  return document.querySelector('dialog[open]') !== null
}

/** Scroll to a home-page section, or go to the home page's section from another route. */
function goHome(id: string) {
  if (!goToId(id)) window.location.href = `/#${id}`
}

/**
 * The key sheet (a native dialog, opened with `?`) and the global shortcuts: p / r / c for the quick-view
 * rail, 2 for a second tab, ? for this sheet. Esc closes dialogs natively; the camera listens for it
 * itself. Mount it once, in the App.
 */
export function KeySheet() {
  const dialog = useRef<HTMLDialogElement>(null)
  // The sheet's content is only rendered while it is open, which keeps it out of the prerendered HTML.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shouldIgnore(event)) return
      switch (event.key) {
        case 'p':
          event.preventDefault()
          goHome('services')
          break
        case 'c':
          event.preventDefault()
          goHome('contact')
          break
        case 'r':
          event.preventDefault()
          window.location.href = '/resume/'
          break
        case '2':
          event.preventDefault()
          if (!quorum.openSecondTab()) announce(copy.controlRoom.quorumPrompt.blocked)
          break
        case '?':
          event.preventDefault()
          setOpen(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
