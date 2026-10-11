/**
 * Copy text to the clipboard. The async Clipboard API where the browser offers it (secure contexts, with a
 * user gesture); otherwise a hidden, read-only <textarea> and `execCommand('copy')`, which still works on
 * plain-HTTP previews and in older embedded browsers. Resolves true only when the browser said it copied.
 * Focus goes back to wherever it was, so a keyboard user is not thrown to the top of the page.
 */

export interface ClipboardDeps {
  /** `navigator.clipboard`, injectable for tests. */
  clipboard?: { writeText(text: string): Promise<void> } | null
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let copied: boolean
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  previous?.focus({ preventScroll: true })
  return copied
}

export async function copyText(text: string, deps: ClipboardDeps = {}): Promise<boolean> {
  const clipboard = deps.clipboard === undefined ? (typeof navigator === 'undefined' ? null : (navigator.clipboard ?? null)) : deps.clipboard
  if (clipboard) {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      /* permission denied or no gesture: try the legacy path */
    }
  }
  return legacyCopy(text)
}
