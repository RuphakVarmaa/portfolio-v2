/**
 * Which single-key shortcut, if any, a key press is (the site's `p`, `r`, `c`, `2` and `?`).
 *
 * WCAG 2.1.4 (Character Key Shortcuts, level A) says a shortcut made of one printable character must be one a person
 * can turn off, remap, or that only works while its own control has focus. These work from anywhere on the page, so
 * they can be turned off: the "Key shortcuts" switch (display options, menu, Colophon, and the key sheet itself) stores
 * `ruphak-keys`, and `shortcutFor` answers `null` for every key while it is off. The review round-2 finding was a
 * speech-input user and a screen-reader user in focus mode, both of whom send single keys without meaning a shortcut:
 * `c` moved a reader 14,500 px, and `r` left the page and lost a running demo.
 *
 * Besides the switch, a key press is left alone when the visitor is typing, when a modifier is held (Shift aside, because
 * `?` is Shift+/), while a modal dialog is open, and while focus is inside a widget that has keys of its own: a radio group
 * (the depth switch), a `summary`, or a log (a tape is a keyboard-focusable scroller).
 *
 * Pure and DOM-free (the handler in KeySheet.tsx reads the facts from the event and the document), so `node --test`
 * imports it directly.
 */

export type ShortcutAction = 'projects' | 'contact' | 'resume' | 'second-tab' | 'key-sheet'

/** The facts about a key press that decide whether it is a shortcut. */
export interface KeyPress {
  key: string
  defaultPrevented: boolean
  /** An input method (IME) composition is in progress. */
  composing: boolean
  ctrl: boolean
  meta: boolean
  alt: boolean
  /** Focus is in a text field, a `select`, a content-editable region or a `role="textbox"`. */
  typing: boolean
  /** Focus is inside a radio group, a `summary` or a log. */
  inWidget: boolean
  /** A modal `<dialog>` is open. */
  modalOpen: boolean
}

/** `keysOn` is the visitor's "Key shortcuts" switch. Returns the shortcut the press is, or null when it is not one (or they are off). */
export function shortcutFor(press: KeyPress, keysOn: boolean): ShortcutAction | null {
  if (!keysOn) return null
  if (press.defaultPrevented || press.composing || press.ctrl || press.meta || press.alt) return null
  if (press.typing || press.inWidget || press.modalOpen) return null
  switch (press.key) {
    case 'p':
      return 'projects'
    case 'c':
      return 'contact'
    case 'r':
      return 'resume'
    case '2':
      return 'second-tab'
    case '?':
      return 'key-sheet'
    default:
      return null
  }
}

/** The selector for "focus is inside a widget that has keys of its own" (the handler asks `target.closest(...)`). */
export const WIDGET_SELECTOR = '[role="radiogroup"], summary, [role="log"]'
