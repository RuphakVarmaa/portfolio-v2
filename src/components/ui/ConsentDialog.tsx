import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { Button } from './Button.tsx'
import styles from './ui.module.css'

export interface ConsentDialogProps {
  open: boolean
  title: string
  /** The explanation. Say exactly what will happen and what will not (nothing uploaded, how to stop). */
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  /** Called for the cancel button, Esc, and a click on the backdrop. */
  onCancel: () => void
  /** Focus returns here when the dialog closes (needed on Safari, which does not focus buttons on click). */
  returnFocus?: RefObject<HTMLElement | null>
}

/**
 * A native <dialog> for asking permission (the camera, the motion sensors). Modal: focus is trapped,
 * Esc cancels, the page behind is inert. The safe choice ("Not now") comes first in the DOM, so it is
 * the one focused when the dialog opens. It never starts anything itself: the caller acts in `onConfirm`.
 */
export function ConsentDialog({ open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel, returnFocus }: ConsentDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const finish = (confirmed: boolean) => {
    ref.current?.close()
    returnFocus?.current?.focus()
    if (confirmed) onConfirm()
    else onCancel()
  }

  return (
    <dialog
      ref={ref}
      className={styles.consent}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: let us run the cancel path (and restore focus) instead of the default close.
        event.preventDefault()
        finish(false)
      }}
      onClick={(event) => {
        if (event.target === ref.current) finish(false)
      }}
    >
      <div className={styles.consentBody}>
        <h3 id={titleId} className={styles.consentTitle}>
          {title}
        </h3>
        <div className={styles.consentText}>{children}</div>
        <div className={styles.consentActions}>
          <Button variant="secondary" onClick={() => finish(false)}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={() => finish(true)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
